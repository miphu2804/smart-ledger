package com.smartledger.core.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.nio.charset.StandardCharsets;
import java.sql.DriverManager;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Actual V21 transactions in generated disposable schemas; payment fixtures enter through verified HMAC. */
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
class SubscriptionPostgresTest {
    private static final String SECRET = "local-only-sepay-test-secret-123456789";
    private static final VerifiedFirebaseToken TOKEN = token("subscription-owner");
    private String schema;
    private JdbcTemplate sql;
    private BillingRepository billingRepository;
    private SubscriptionRepository repository;
    private BillingService billing;
    private SePayWebhookService webhook;
    private BillingJson json;
    private SePayPaymentsPostgresTest.MutableClock clock;
    private DataSourceTransactionManager manager;
    private SubscriptionService service;
    private long owner;
    private long providerId;

    @BeforeEach void setup() throws Exception {
        schema = "core_subscription_test_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = rawConnection(); var statement = connection.createStatement()) { statement.execute("CREATE SCHEMA " + schema); }
        var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
        var properties = new Properties(); properties.setProperty("currentSchema", schema); source.setConnectionProperties(properties);
        sql = new JdbcTemplate(source);
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).load().migrate();
        manager = new DataSourceTransactionManager(source);
        json = new BillingJson(new ObjectMapper().registerModule(new JavaTimeModule())
                .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS));
        clock = new SePayPaymentsPostgresTest.MutableClock(Instant.parse("2027-01-31T03:04:05.123456Z"));
        billingRepository = new BillingRepository(sql); repository = new SubscriptionRepository(sql);
        var settings = new BillingProperties(true, true, "test", SECRET, "TPBank", "0000000001", "SIMULATED RECIPIENT");
        billing = new BillingService(billingRepository, settings, json, clock, manager);
        webhook = new SePayWebhookService(billingRepository, settings, json, clock, manager);
        service = instance(true);
        owner = owner("subscription-owner", "OWNER", "ACTIVE");
    }

    @AfterEach void cleanup() throws Exception {
        if (schema != null && schema.matches("core_subscription_test_[a-f0-9]{32}")) {
            try (var connection = rawConnection(); var statement = connection.createStatement()) { statement.execute("DROP SCHEMA " + schema + " CASCADE"); }
        }
    }

    @Test void freeReadsAreShoplessScopedAndDoNotCreateRowsWithFulfillmentDisabled() {
        var disabled = instance(false);
        assertThat(disabled.subscription(TOKEN).effectiveTier()).isEqualTo("FREE");
        assertThat(disabled.subscription(TOKEN).lastPurchasedPlanCode()).isNull();
        var quota = disabled.quota(TOKEN);
        assertThat(quota.limit()).isEqualTo(2); assertThat(quota.enforcementEnabled()).isFalse();
        assertThat(quota.windowStart().toInstant()).isEqualTo(Instant.parse("2027-01-30T17:00:00Z"));
        assertThat(quota.nextResetAt().toInstant()).isEqualTo(Instant.parse("2027-01-31T17:00:00Z"));
        owner("admin", "ADMIN", "ACTIVE"); owner("disabled", "OWNER", "DISABLED");
        assertCode(() -> disabled.subscription(token("admin")), ErrorCode.SHOP_ACCESS_DENIED);
        assertCode(() -> disabled.quota(token("disabled")), ErrorCode.ACCOUNT_DISABLED);
        assertCode(() -> disabled.subscription(token("missing")), ErrorCode.AUTH_PROFILE_NOT_FOUND);
        assertThat(count("billing_subscription_periods")).isZero(); assertThat(count("ai_quota_windows")).isZero();
        assertThat(count("shops")).isZero();
    }

    @Test void acceptedMoneyActivatesOnceAcrossIndependentWorkersAndRestart() throws Exception {
        var request = paid("FULL_MONTHLY");
        assertThat(billing.get(TOKEN, request.id()).fulfillmentStatus()).isEqualTo("PENDING");
        assertThat(instance(false).fulfill(request.id())).isFalse();
        var start = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var a = workers.submit(() -> { start.await(); return service.fulfill(request.id()); });
            var b = workers.submit(() -> { start.await(); return instance(true).fulfill(request.id()); });
            start.countDown();
            assertThat(java.util.List.of(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        assertThat(instance(true).fulfill(request.id())).isFalse();
        assertThat(count("billing_subscription_grants")).isEqualTo(1);
        assertThat(billing.get(TOKEN, request.id()).fulfillmentStatus()).isEqualTo("APPLIED");
        assertThat(instance(false).subscription(TOKEN).status()).isEqualTo("ACTIVE");
        assertThat(service.subscription(TOKEN).expiresAt().toInstant()).isEqualTo(Instant.parse("2027-02-28T03:04:05.123456Z"));
        for (String table : new String[]{"sales", "payments", "debts", "expenses", "ai_quota_windows", "ai_turn_usages"}) {
            assertThat(count(table)).isZero();
        }
        assertThat(sql.queryForObject("SELECT system_role FROM users WHERE id=?", String.class, owner)).isEqualTo("OWNER");
    }

    @Test void pendingScanHonorsTheRequestIdCapturedBeforeNewPaymentsArrive() {
        var first = paid("FULL_MONTHLY");
        long cycleEnd = service.latestRequestId();
        var next = paid("FULL_QUARTERLY");

        assertThat(cycleEnd).isEqualTo(first.id());
        assertThat(service.pending(0, cycleEnd)).containsExactly(first.id());
        assertThat(service.pending(first.id(), cycleEnd)).isEmpty();
        assertThat(service.pending(0, service.latestRequestId())).containsExactly(first.id(), next.id());
        assertThat(instance(false).latestRequestId()).isZero();
    }

    @Test void concurrentMixedRenewalsPreserveOriginalCalendarAndWeeklyAnchor() throws Exception {
        var first = paid("FULL_MONTHLY"); service.fulfill(first.id());
        var original = service.subscription(TOKEN).activatedAt();
        clock.advance(3600);
        var monthly = paid("FULL_MONTHLY"); var quarterly = paid("FULL_QUARTERLY");
        try (var workers = Executors.newFixedThreadPool(2)) {
            var a = workers.submit(() -> service.fulfill(monthly.id()));
            var b = workers.submit(() -> instance(true).fulfill(quarterly.id()));
            assertThat(a.get(10, TimeUnit.SECONDS)).isTrue(); assertThat(b.get(10, TimeUnit.SECONDS)).isTrue();
        }
        var result = service.subscription(TOKEN);
        assertThat(result.activatedAt()).isEqualTo(original); assertThat(result.weeklyAnchorAt()).isEqualTo(original);
        assertThat(result.expiresAt().toInstant()).isEqualTo(Instant.parse("2027-06-30T03:04:05.123456Z"));
        assertThat(sql.queryForObject("SELECT purchased_months FROM billing_subscription_periods WHERE is_current", Integer.class)).isEqualTo(5);
        assertThat(count("billing_subscription_periods")).isEqualTo(1); assertThat(count("billing_subscription_grants")).isEqualTo(3);
        assertThat(sql.queryForList("SELECT period_version FROM billing_subscription_grants ORDER BY period_version", Long.class))
                .containsExactly(1L, 2L, 3L);
        assertThat(result.lastPurchasedPlanCode()).isEqualTo(sql.queryForObject("""
                SELECT r.plan_code FROM billing_subscription_grants g JOIN billing_payment_requests r ON r.id=g.payment_request_id
                ORDER BY g.applied_at DESC,g.id DESC LIMIT 1
                """, String.class));
    }

    @Test void exactExpiryFallsBackWithoutWriteAndLateActivationStartsNewEpoch() {
        var first = paid("FULL_MONTHLY"); service.fulfill(first.id());
        var oldEnd = service.subscription(TOKEN).expiresAt();
        clock.current.set(oldEnd.toInstant());
        assertThat(service.subscription(TOKEN).effectiveTier()).isEqualTo("FREE");
        assertThat(service.subscription(TOKEN).activatedAt()).isNull();
        assertThat(service.subscription(TOKEN).lastPurchasedPlanCode()).isEqualTo("FULL_MONTHLY");
        assertThat(service.quota(TOKEN).limit()).isEqualTo(2);
        assertThat(count("billing_subscription_periods")).isEqualTo(1);
        var second = paid("FULL_QUARTERLY"); clock.advance(86400);
        service.fulfill(second.id());
        var actual = service.subscription(TOKEN);
        assertThat(actual.activatedAt().toInstant()).isEqualTo(clock.instant());
        assertThat(actual.weeklyAnchorAt()).isEqualTo(actual.activatedAt());
        assertThat(count("billing_subscription_periods")).isEqualTo(2);
        assertThat(sql.queryForObject("SELECT count(*) FROM billing_subscription_periods WHERE is_current", Integer.class)).isEqualTo(1);
        assertThat(sql.queryForObject("SELECT previous_expires_at FROM billing_subscription_grants WHERE payment_request_id=?",
                OffsetDateTime.class, second.id())).isNull();
    }

    @Test void disabledPayerKeepsPaidMoneyPendingUntilActualActivation() {
        var request = paid("FULL_MONTHLY");
        sql.update("UPDATE users SET status='DISABLED' WHERE id=?", owner);
        assertThat(service.pending(0, service.latestRequestId())).isEmpty(); assertThat(service.fulfill(request.id())).isFalse();
        clock.advance(86400);
        sql.update("UPDATE users SET status='ACTIVE' WHERE id=?", owner);
        assertThat(service.fulfill(request.id())).isTrue();
        assertThat(service.subscription(TOKEN).activatedAt().toInstant()).isEqualTo(clock.instant());
        long other = owner("another", "OWNER", "ACTIVE");
        assertThat(service.subscription(token("another")).effectiveTier()).isEqualTo("FREE");
        assertThat(service.quota(token("another")).remaining()).isEqualTo(2);
        assertThat(other).isNotEqualTo(owner);
    }

    @Test void rollbackAndSkippedGrantOrAppliedWritesLeavePendingMoneyAndRetryOnce() {
        var request = paid("FULL_MONTHLY");
        sql.execute("CREATE FUNCTION skip_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$");
        sql.execute("CREATE TRIGGER skip_grant BEFORE INSERT ON billing_subscription_grants FOR EACH ROW EXECUTE FUNCTION skip_write()");
        assertCode(() -> service.fulfill(request.id()), ErrorCode.BILLING_UNAVAILABLE);
        assertThat(count("billing_subscription_periods")).isZero(); assertThat(count("billing_subscription_grants")).isZero();
        sql.execute("DROP TRIGGER skip_grant ON billing_subscription_grants");
        sql.execute("CREATE TRIGGER skip_applied BEFORE UPDATE ON billing_payment_requests FOR EACH ROW EXECUTE FUNCTION skip_write()");
        assertThatThrownBy(() -> service.fulfill(request.id())).isInstanceOf(IllegalStateException.class);
        assertThat(count("billing_subscription_periods")).isZero(); assertThat(count("billing_subscription_grants")).isZero();
        assertThat(billing.get(TOKEN, request.id()).status()).isEqualTo("PAID");
        assertThat(billing.get(TOKEN, request.id()).fulfillmentStatus()).isEqualTo("PENDING");
        sql.execute("DROP TRIGGER skip_applied ON billing_payment_requests");
        assertThat(instance(true).fulfill(request.id())).isTrue();
        var renewal = paid("FULL_MONTHLY");
        sql.execute("CREATE TRIGGER skip_extend BEFORE UPDATE ON billing_subscription_periods FOR EACH ROW EXECUTE FUNCTION skip_write()");
        assertThatThrownBy(() -> service.fulfill(renewal.id())).isInstanceOf(IllegalStateException.class);
        assertThat(count("billing_subscription_grants")).isEqualTo(1);
        assertThat(service.subscription(TOKEN).expiresAt().toInstant()).isEqualTo(Instant.parse("2027-02-28T03:04:05.123456Z"));
        sql.execute("DROP TRIGGER skip_extend ON billing_subscription_periods");
        assertThat(service.fulfill(renewal.id())).isTrue();
        assertThat(service.subscription(TOKEN).expiresAt().toInstant()).isEqualTo(Instant.parse("2027-03-31T03:04:05.123456Z"));
    }

    @Test void countersStayInSameFinalWindowWhenRenewalExtendsItsClippedEnd() {
        service.fulfill(paid("FULL_MONTHLY").id());
        var anchor = service.subscription(TOKEN).activatedAt();
        clock.current.set(anchor.plusDays(27).toInstant());
        var last = service.quota(TOKEN);
        assertThat(last.nextResetAt()).isNull();
        sql.update("""
                INSERT INTO ai_quota_windows(id,user_id,kind,period_id,policy_version,window_start,nominal_end,
                    limit_count,committed_count,reserved_count)
                SELECT ?,?,'PAID_WEEKLY',id,1,?,?,300,297,2 FROM billing_subscription_periods WHERE is_current
                """, UUID.randomUUID(), owner, last.windowStart(), anchor.plusDays(28));
        assertThat(service.quota(TOKEN).remaining()).isEqualTo(1);
        service.fulfill(paid("FULL_QUARTERLY").id());
        var extended = service.quota(TOKEN);
        assertThat(extended.windowStart()).isEqualTo(last.windowStart());
        assertThat(extended.committed()).isEqualTo(297); assertThat(extended.reserved()).isEqualTo(2);
        assertThat(extended.remaining()).isEqualTo(1); assertThat(extended.nextResetAt()).isEqualTo(anchor.plusDays(28));
        clock.current.set(anchor.plusDays(28).toInstant());
        assertThat(service.quota(TOKEN).remaining()).isEqualTo(300);
        assertThat(count("ai_quota_windows")).isEqualTo(1); assertThat(count("ai_turn_usages")).isZero();
    }

    @Test void freeCountersResetAtVietnamMidnightAndPaidActivationDoesNotStackAllowances() {
        var daily = service.quota(TOKEN);
        sql.update("""
                INSERT INTO ai_quota_windows(id,user_id,kind,policy_version,window_start,nominal_end,limit_count,committed_count)
                VALUES (?,?,'FREE_DAILY',1,?,?,2,2)
                """, UUID.randomUUID(), owner, daily.windowStart(), daily.windowEnd());
        assertThat(service.quota(TOKEN).remaining()).isZero();
        clock.current.set(daily.nextResetAt().toInstant().minusNanos(1000));
        assertThat(service.quota(TOKEN).remaining()).isZero();
        clock.advance(1);
        assertThat(service.quota(TOKEN).remaining()).isEqualTo(2);
        service.fulfill(paid("FULL_MONTHLY").id());
        assertThat(service.quota(TOKEN).remaining()).isEqualTo(300);
        assertThat(count("ai_quota_windows")).isEqualTo(1);
    }

    @Test void reviewUnpaidUnsupportedSnapshotsAndWrongRolesNeverReceiveAutomaticGrant() {
        var unpaid = billing.create(TOKEN, UUID.randomUUID().toString(), body("FULL_MONTHLY"));
        assertThat(service.fulfill(unpaid.id())).isFalse();
        receive(unpaid, 98999);
        assertThat(service.fulfill(unpaid.id())).isFalse();
        var unknown = paid("FULL_MONTHLY");
        sql.update("UPDATE billing_payment_requests SET quota_policy_version=2 WHERE id=?", unknown.id());
        assertThat(service.fulfill(unknown.id())).isFalse();
        var request = paid("FULL_QUARTERLY");
        sql.update("UPDATE users SET system_role='ADMIN' WHERE id=?", owner);
        assertThat(service.fulfill(request.id())).isFalse();
        assertThat(service.pending(0, service.latestRequestId())).isEmpty(); assertThat(count("billing_subscription_grants")).isZero();
    }

    @Test void backwardClockCannotReplaceCurrentEpochWithAnOverlappingTerm() {
        service.fulfill(paid("FULL_MONTHLY").id());
        var anchor = service.subscription(TOKEN).activatedAt();
        clock.advance(10);
        var renewal = paid("FULL_MONTHLY");
        clock.current.set(anchor.toInstant().minusSeconds(1));
        assertThat(service.fulfill(renewal.id())).isFalse();
        assertThat(count("billing_subscription_periods")).isEqualTo(1);
        assertThat(count("billing_subscription_grants")).isEqualTo(1);
        assertThat(billing.get(TOKEN, renewal.id()).fulfillmentStatus()).isEqualTo("PENDING");
        clock.current.set(anchor.toInstant().plusSeconds(11));
        assertThat(service.fulfill(renewal.id())).isTrue();
        assertThat(service.subscription(TOKEN).activatedAt()).isEqualTo(anchor);
        assertThat(service.subscription(TOKEN).expiresAt().toInstant()).isEqualTo(Instant.parse("2027-03-31T03:04:05.123456Z"));
    }

    @Test void missingSubscriptionStoreFailsClosedInsteadOfReportingFree() {
        sql.execute("ALTER TABLE billing_subscription_periods RENAME TO unavailable_periods");
        assertCode(() -> service.subscription(TOKEN), ErrorCode.BILLING_UNAVAILABLE);
        assertCode(() -> service.quota(TOKEN), ErrorCode.BILLING_UNAVAILABLE);
    }

    private SubscriptionService instance(boolean enabled) {
        return new SubscriptionService(billingRepository, repository, new SubscriptionProperties(enabled), clock, manager);
    }
    private BillingPaymentResponse paid(String plan) {
        var request = billing.create(TOKEN, UUID.randomUUID().toString(), body(plan)); receive(request, request.amountVnd()); return request;
    }
    private void receive(BillingPaymentResponse request, long amount) {
        byte[] payload = json.write(Map.of("id", ++providerId, "gateway", "TPBank", "accountNumber", "0000000001",
                "code", request.paymentCode(), "content", request.paymentCode(), "transferType", "in", "transferAmount", amount))
                .getBytes(StandardCharsets.UTF_8);
        String timestamp = Long.toString(clock.instant().getEpochSecond());
        webhook.accept("test", timestamp, SePayPaymentsPostgresTest.signature(timestamp, payload), payload);
    }
    private static byte[] body(String plan) {
        return ("{\"planCode\":\"" + plan + "\",\"planVersion\":1}").getBytes(StandardCharsets.UTF_8);
    }
    private long owner(String uid, String role, String status) {
        long id = sql.queryForObject("INSERT INTO users(display_name,system_role,status) VALUES ('Test owner',?,?) RETURNING id", Long.class, role, status);
        sql.update("INSERT INTO auth_identities(user_id,provider_subject) VALUES (?,?)", id, uid); return id;
    }
    private static VerifiedFirebaseToken token(String uid) { return new VerifiedFirebaseToken(uid, null, false, null, null, null); }
    private void assertCode(Runnable operation, ErrorCode expected) {
        assertThatThrownBy(operation::run).isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getErrorCode()).isEqualTo(expected));
    }
    private int count(String table) { return sql.queryForObject("SELECT count(*) FROM " + table, Integer.class); }
    private java.sql.Connection rawConnection() throws Exception {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"), System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }
}
