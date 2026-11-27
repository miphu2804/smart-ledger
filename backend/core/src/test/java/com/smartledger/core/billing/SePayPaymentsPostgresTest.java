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
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Real financial transactions on generated schemas only; no real SePay, bank or Firebase access. */
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
class SePayPaymentsPostgresTest {
    private static final String SECRET = "local-only-sepay-test-secret-123456789";
    private static final byte[] MONTHLY = "{\"planCode\":\"FULL_MONTHLY\",\"planVersion\":1}".getBytes(StandardCharsets.UTF_8);
    private static final VerifiedFirebaseToken TOKEN = new VerifiedFirebaseToken("billing-owner", null, false, null, null, null);
    private String schema;
    private DriverManagerDataSource source;
    private JdbcTemplate sql;
    private BillingRepository repository;
    private BillingJson json;
    private BillingService billing;
    private SePayWebhookService webhook;
    private MutableClock clock;
    private DataSourceTransactionManager manager;

    @BeforeEach
    void setup() throws Exception {
        schema = "core_sepay_test_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = rawConnection(); var statement = connection.createStatement()) { statement.execute("CREATE SCHEMA " + schema); }
        source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
        var properties = new Properties(); properties.setProperty("currentSchema", schema); source.setConnectionProperties(properties);
        sql = new JdbcTemplate(source);
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).load().migrate();
        json = new BillingJson(new ObjectMapper().registerModule(new JavaTimeModule())
                .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS));
        clock = new MutableClock(Instant.parse("2026-11-08T00:00:00Z"));
        repository = new BillingRepository(sql);
        manager = new DataSourceTransactionManager(source);
        billing = new BillingService(repository, settings(true, true), json, clock, manager);
        webhook = new SePayWebhookService(repository, settings(true, true), json, clock, manager);
        owner("billing-owner", "OWNER", "ACTIVE");
    }

    @AfterEach
    void cleanup() throws Exception {
        if (schema != null && schema.matches("core_sepay_test_[a-f0-9]{32}")) {
            try (var connection = rawConnection(); var statement = connection.createStatement()) { statement.execute("DROP SCHEMA " + schema + " CASCADE"); }
        }
    }

    @Test
    void catalogAndActiveOwnerGuardsWorkWithoutShopOrPaymentConfiguration() {
        var disabled = new BillingService(repository, settings(false, false), json, clock, manager);
        assertThat(disabled.plans(TOKEN)).extracting(BillingPlanResponse::amountVnd).containsExactly(0L, 99000L, 297000L);
        assertCode(() -> disabled.create(TOKEN, "new", MONTHLY), ErrorCode.BILLING_UNAVAILABLE);
        owner("admin", "ADMIN", "ACTIVE"); owner("disabled", "OWNER", "DISABLED");
        assertCode(() -> disabled.plans(token("admin")), ErrorCode.SHOP_ACCESS_DENIED);
        assertCode(() -> disabled.plans(token("disabled")), ErrorCode.ACCOUNT_DISABLED);
        assertCode(() -> disabled.plans(token("missing")), ErrorCode.AUTH_PROFILE_NOT_FOUND);
        assertThat(count("shops")).isZero(); assertThat(count("billing_payment_requests")).isZero();
    }

    @Test
    void replayKeepsOriginalSnapshotAcrossExpiryConfigAndCatalogValidation() {
        var first = billing.create(TOKEN, " stable-key ", MONTHLY);
        assertThat(first.paymentCode()).matches("SLP[A-Z0-9]{12}");
        assertThat(first.expiresAt()).isEqualTo(first.createdAt().plusMinutes(30));
        assertThat(first.qrUrl()).startsWith("https://vietqr.app/img?").contains("amount=99000", "des=" + first.paymentCode());
        clock.advance(3600);
        var changed = new BillingProperties(false, false, "different-scope", "", "OtherBank", "00002", "Other recipient");
        var service = new BillingService(repository, changed, json, clock, manager);
        assertThat(service.create(TOKEN, "stable-key", MONTHLY)).isEqualTo(first);
        assertThat(service.get(TOKEN, first.id()).status()).isEqualTo("EXPIRED");
        assertThat(service.get(TOKEN, first.id()).qrUrl()).isNull();
        assertThat(sql.queryForObject("SELECT status FROM billing_payment_requests", String.class)).isEqualTo("PENDING");
        assertCode(() -> service.create(TOKEN, "stable-key", "{\"planCode\":\"FULL_MONTHLY\",\"planVersion\":2}".getBytes(StandardCharsets.UTF_8)),
                ErrorCode.BILLING_IDEMPOTENCY_CONFLICT);
        assertThat(count("billing_payment_requests")).isEqualTo(1);
    }

    @Test
    void concurrentInstancesShareOneRequestAndCrossOwnerReadsAreHidden() throws Exception {
        var other = new BillingService(new BillingRepository(new JdbcTemplate(source)), settings(true, true), json, clock, manager);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var first = workers.submit(() -> billing.create(TOKEN, "one-key", MONTHLY));
            var second = workers.submit(() -> other.create(TOKEN, "one-key", MONTHLY));
            assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(second.get(10, TimeUnit.SECONDS));
        }
        var result = billing.create(TOKEN, "one-key", MONTHLY);
        owner("other", "OWNER", "ACTIVE");
        assertCode(() -> billing.get(token("other"), result.id()), ErrorCode.BILLING_REQUEST_NOT_FOUND);
        assertCode(() -> billing.get(TOKEN, 0), ErrorCode.INVALID_BILLING_REQUEST);
        assertCode(() -> billing.create(TOKEN, "one-key", "{\"planCode\":\"FULL_QUARTERLY\",\"planVersion\":1}".getBytes(StandardCharsets.UTF_8)),
                ErrorCode.BILLING_IDEMPOTENCY_CONFLICT);
        assertThat(count("billing_payment_requests")).isEqualTo(1);
    }

    @Test
    void invalidExtraDuplicateAndClientControlledFieldsCreateNothing() {
        for (String body : new String[]{"{}", "null", "[]", "{\"planCode\":\"FULL_MONTHLY\",\"planVersion\":1,\"amountVnd\":1}",
                "{\"planCode\":\"FULL_MONTHLY\",\"planVersion\":1,\"payerUserId\":1}",
                "{\"planCode\":\"FULL_MONTHLY\",\"planVersion\":1,\"planVersion\":2}",
                "{\"planCode\":\"FULL_MONTHLY\",\"planVersion\":1.5}",
                "{\"planCode\":\"FULL_MONTHLY\",\"planVersion\":1} {}"}) {
            assertCode(() -> billing.create(TOKEN, "bad", body.getBytes(StandardCharsets.UTF_8)), ErrorCode.INVALID_BILLING_REQUEST);
        }
        assertCode(() -> billing.create(TOKEN, " ", MONTHLY), ErrorCode.INVALID_BILLING_REQUEST);
        assertCode(() -> billing.create(TOKEN, "long".repeat(100), MONTHLY), ErrorCode.INVALID_BILLING_REQUEST);
        assertCode(() -> billing.create(TOKEN, "free", "{\"planCode\":\"FREE\",\"planVersion\":1}".getBytes(StandardCharsets.UTF_8)), ErrorCode.BILLING_OFFER_UNAVAILABLE);
        assertThat(count("billing_payment_requests")).isZero();
    }

    @Test
    void concurrentSignedReceiptsCommitOnePaymentAndNeverActivateAnything() throws Exception {
        var request = billing.create(TOKEN, "payment", MONTHLY);
        byte[] body = payload("9007199254740993", request.paymentCode(), "in", 99000, "0000000001", null);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var first = workers.submit(() -> receive(body));
            var second = workers.submit(() -> receive(body));
            first.get(10, TimeUnit.SECONDS); second.get(10, TimeUnit.SECONDS);
        }
        var paid = billing.get(TOKEN, request.id());
        assertThat(paid.status()).isEqualTo("PAID"); assertThat(paid.fulfillmentStatus()).isEqualTo("PENDING");
        assertThat(paid.qrUrl()).isNull(); assertThat(paid.paidAt()).isNotNull();
        assertThat(count("billing_bank_transactions")).isEqualTo(1);
        receive(payload("9007199254740994", request.paymentCode(), "in", 99000, "0000000001", null));
        assertThat(billing.get(TOKEN, request.id()).reviewRequired()).isTrue();
        assertThat(sql.queryForObject("SELECT reason FROM billing_bank_transactions WHERE provider_transaction_id='9007199254740994'", String.class)).isEqualTo("EXTRA_TRANSFER");
        for (String table : new String[]{"billing_subscription_periods", "billing_subscription_grants", "ai_quota_windows", "ai_turn_usages", "sales", "payments", "debts", "expenses", "audit_logs"}) {
            assertThat(count(table)).as(table).isZero();
        }
        assertThat(sql.queryForObject("SELECT system_role FROM users", String.class)).isEqualTo("OWNER");
    }

    @Test
    void mismatchedAndOutgoingFundsAreStoredWithExplicitReviewReasons() {
        var amount = billing.create(TOKEN, "amount", MONTHLY);
        receive(payload("1", amount.paymentCode(), "in", 100000, "0000000001", null));
        assertThat(billing.get(TOKEN, amount.id()).reviewRequired()).isTrue();
        assertThat(reason("1")).isEqualTo("AMOUNT_MISMATCH");
        var account = billing.create(TOKEN, "account", MONTHLY);
        receive(payload("2", account.paymentCode(), "in", 99000, "0000000002", null));
        assertThat(reason("2")).isEqualTo("RECIPIENT_MISMATCH");
        var va = billing.create(TOKEN, "va", MONTHLY);
        receive(payload("3", va.paymentCode(), "in", 99000, "0000000001", "unconfigured-va"));
        assertThat(reason("3")).isEqualTo("RECIPIENT_MISMATCH");
        var outgoing = billing.create(TOKEN, "out", MONTHLY);
        receive(payload("4", outgoing.paymentCode(), "out", 99000, "0000000001", null));
        assertThat(reason("4")).isEqualTo("OUTGOING");
        assertThat(billing.get(TOKEN, outgoing.id()).reviewRequired()).isFalse();
        receive(payload("5", "SLPZZZZZZZZZZZZ", "in", 99000, "0000000001", null));
        assertThat(reason("5")).isEqualTo("UNKNOWN_CODE");
        receive(payload("6", null, "in", 99000, "0000000001", null));
        assertThat(reason("6")).isEqualTo("MISSING_CODE");
        var ambiguous = json.write(Map.of("id", 7, "gateway", "TPBank", "accountNumber", "0000000001", "transferType", "in",
                "transferAmount", 99000, "code", amount.paymentCode(), "content", "SLPZZZZZZZZZZZZ"));
        receive(ambiguous.getBytes(StandardCharsets.UTF_8));
        assertThat(reason("7")).isEqualTo("AMBIGUOUS_CODE");
        var mixedCase = json.write(Map.of("id", 8, "gateway", "TPBank", "accountNumber", "0000000001", "transferType", "in",
                "transferAmount", 99000, "code", amount.paymentCode(), "content", amount.paymentCode() + " slpzzzzzzzzzzzz"));
        receive(mixedCase.getBytes(StandardCharsets.UTF_8));
        assertThat(reason("8")).isEqualTo("AMBIGUOUS_CODE");
        assertThat(sql.queryForObject("SELECT count(*) FROM billing_payment_requests WHERE status='PAID'", Integer.class)).isZero();
    }

    @Test
    void changedFinancialFactsConflictButIrrelevantDescriptionAndFormattingDoNot() {
        var request = billing.create(TOKEN, "same", MONTHLY);
        receive(payload("55", request.paymentCode(), "in", 99000, "0000000001", null));
        byte[] changed = payload("55", request.paymentCode(), "in", 1, "0000000001", null);
        assertThatThrownBy(() -> receive(changed)).isInstanceOfSatisfying(SePayFailure.class, e -> assertThat(e.status()).isEqualTo(409));
        String formatted = " {\"content\":\"" + request.paymentCode() + "\",\"description\":\"ignored sender\",\"accumulated\":123,"
                + "\"id\":\"55\",\"gateway\":\"tpbank\",\"accountNumber\":\"0000000001\",\"transferType\":\"in\",\"transferAmount\":99000.00,\"code\":\"" + request.paymentCode() + "\"}";
        receive(formatted.getBytes(StandardCharsets.UTF_8));
        assertThat(count("billing_bank_transactions")).isEqualTo(1);
        assertThat(sql.queryForObject("SELECT amount_vnd FROM billing_bank_transactions", Long.class)).isEqualTo(99000);
    }

    @Test
    void invalidRawSignatureTimestampAndMalformedMoneyHaveNoDurableSideEffects() {
        var request = billing.create(TOKEN, "auth", MONTHLY);
        byte[] body = payload("88", request.paymentCode(), "in", 99000, "0000000001", null);
        String timestamp = Long.toString(clock.instant().getEpochSecond());
        assertThatThrownBy(() -> webhook.accept("test", timestamp, "sha256=" + "0".repeat(64), body)).isInstanceOf(SePayFailure.class);
        assertThatThrownBy(() -> webhook.accept("wrong", timestamp, signature(timestamp, body), body)).isInstanceOf(SePayFailure.class);
        String old = Long.toString(clock.instant().getEpochSecond() - 301);
        assertThatThrownBy(() -> webhook.accept("test", old, signature(old, body), body)).isInstanceOf(SePayFailure.class);
        assertThatThrownBy(() -> webhook.accept("test", timestamp, signature(timestamp, body), (new String(body, StandardCharsets.UTF_8) + " ").getBytes(StandardCharsets.UTF_8))).isInstanceOf(SePayFailure.class);
        for (String invalid : new String[]{"{}", "null", "{\"id\":1,\"id\":2}",
                new String(body, StandardCharsets.UTF_8).replace("99000", "1.25"),
                new String(body, StandardCharsets.UTF_8).replace("99000", "9223372036854775808")}) {
            assertThatThrownBy(() -> receive(invalid.getBytes(StandardCharsets.UTF_8)))
                    .isInstanceOfSatisfying(SePayFailure.class, e -> assertThat(e.status()).isEqualTo(400));
        }
        assertThat(count("billing_bank_transactions")).isZero();
    }

    @Test
    void preDeadlineReceiptCanCommitAfterExpiryWhileGetDoesNotMutateItsState() throws Exception {
        var request = billing.create(TOKEN, "expiry-race", MONTHLY);
        clock.current.set(request.expiresAt().toInstant().minusSeconds(1));
        var reachedLock = new CountDownLatch(1);
        var waiting = new BillingRepository(sql) {
            @Override java.util.Optional<Request> lockCode(String integration, String code) {
                reachedLock.countDown(); return super.lockCode(integration, code);
            }
        };
        var service = new SePayWebhookService(waiting, settings(true, true), json, clock, manager);
        try (var blocker = source.getConnection(); var workers = Executors.newSingleThreadExecutor()) {
            blocker.setAutoCommit(false);
            try (var statement = blocker.prepareStatement("SELECT id FROM billing_payment_requests WHERE id=? FOR UPDATE")) {
                statement.setLong(1, request.id()); statement.executeQuery().close();
            }
            byte[] body = payload("91", request.paymentCode(), "in", 99000, "0000000001", null);
            String timestamp = Long.toString(clock.instant().getEpochSecond());
            String signed = signature(timestamp, body);
            var delivery = workers.submit(() -> service.accept("test", timestamp, signed, body));
            assertThat(reachedLock.await(2, TimeUnit.SECONDS)).isTrue();
            clock.advance(2);
            assertThat(billing.get(TOKEN, request.id()).status()).isEqualTo("EXPIRED");
            blocker.rollback();
            delivery.get(5, TimeUnit.SECONDS);
        }
        var paid = billing.get(TOKEN, request.id());
        assertThat(paid.status()).isEqualTo("PAID");
        assertThat(paid.paidAt().toInstant()).isBefore(request.expiresAt().toInstant());
    }

    @Test
    void rollbackIsRetryableAndPostDeadlineRetryWithEarlierBankTimeRequiresReview() {
        var request = billing.create(TOKEN, "rollback", MONTHLY);
        sql.execute("CREATE FUNCTION stop_paid() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$");
        sql.execute("CREATE TRIGGER stop_paid BEFORE UPDATE ON billing_payment_requests FOR EACH ROW EXECUTE FUNCTION stop_paid()");
        byte[] body = payload("92", request.paymentCode(), "in", 99000, "0000000001", null);
        assertThatThrownBy(() -> receive(body)).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(count("billing_bank_transactions")).isZero();
        sql.execute("DROP TRIGGER stop_paid ON billing_payment_requests");
        receive(body);
        assertThat(billing.get(TOKEN, request.id()).status()).isEqualTo("PAID");
        var late = billing.create(TOKEN, "late", MONTHLY);
        sql.execute("CREATE TRIGGER stop_paid BEFORE UPDATE ON billing_payment_requests FOR EACH ROW EXECUTE FUNCTION stop_paid()");
        assertThatThrownBy(() -> receive(payload("93", late.paymentCode(), "in", 99000, "0000000001", null)))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(count("billing_bank_transactions")).isEqualTo(1);
        sql.execute("DROP TRIGGER stop_paid ON billing_payment_requests");
        clock.current.set(late.expiresAt().toInstant());
        String jsonBody = new String(payload("93", late.paymentCode(), "in", 99000, "0000000001", null), StandardCharsets.UTF_8);
        receive((jsonBody.substring(0, jsonBody.length() - 1) + ",\"transactionDate\":\"2026-11-08 07:29:00\"}").getBytes(StandardCharsets.UTF_8));
        assertThat(reason("93")).isEqualTo("LATE_RECEIPT");
        assertThat(billing.get(TOKEN, late.id()).status()).isEqualTo("EXPIRED");
        assertThat(billing.get(TOKEN, late.id()).reviewRequired()).isTrue();
    }

    @Test
    void disabledCreationOrPayerDoesNotDiscardAlreadyIssuedMoney() {
        var request = billing.create(TOKEN, "issued", MONTHLY);
        sql.update("UPDATE users SET status='DISABLED'");
        var changedRecipient = new BillingProperties(false, true, "test", SECRET, "OtherBank", "0000000002", "CHANGED RECIPIENT");
        var receiptOnly = new SePayWebhookService(repository, changedRecipient, json, clock, manager);
        byte[] body = payload("94", request.paymentCode(), "in", 99000, "0000000001", null);
        String timestamp = Long.toString(clock.instant().getEpochSecond());
        receiptOnly.accept("test", timestamp, signature(timestamp, body), body);
        assertThat(sql.queryForObject("SELECT status FROM billing_payment_requests", String.class)).isEqualTo("PAID");
        assertThat(count("billing_subscription_grants")).isZero();
    }

    @Test
    void distinctSimultaneousTransfersCannotBothPayOneRequest() throws Exception {
        var request = billing.create(TOKEN, "two-transfers", MONTHLY);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var first = workers.submit(() -> receive(payload("95", request.paymentCode(), "in", 99000, "0000000001", null)));
            var second = workers.submit(() -> receive(payload("96", request.paymentCode(), "in", 99000, "0000000001", null)));
            first.get(10, TimeUnit.SECONDS); second.get(10, TimeUnit.SECONDS);
        }
        assertThat(count("billing_bank_transactions")).isEqualTo(2);
        assertThat(sql.queryForObject("SELECT count(*) FROM billing_bank_transactions WHERE disposition='ACCEPTED'", Integer.class)).isEqualTo(1);
        assertThat(sql.queryForObject("SELECT count(*) FROM billing_bank_transactions WHERE reason='EXTRA_TRANSFER'", Integer.class)).isEqualTo(1);
        assertThat(billing.get(TOKEN, request.id()).status()).isEqualTo("PAID");
        assertThat(billing.get(TOKEN, request.id()).reviewRequired()).isTrue();
    }

    @Test
    void silentSkippedWritesCannotProduceAnAcceptedUnpaidReceipt() {
        var request = billing.create(TOKEN, "skip-write", MONTHLY);
        sql.execute("CREATE FUNCTION skip_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$");
        sql.execute("CREATE TRIGGER skip_paid BEFORE UPDATE ON billing_payment_requests FOR EACH ROW EXECUTE FUNCTION skip_write()");
        byte[] body = payload("97", request.paymentCode(), "in", 99000, "0000000001", null);
        assertThatThrownBy(() -> receive(body)).isInstanceOf(IllegalStateException.class);
        assertThat(count("billing_bank_transactions")).isZero();
        assertThat(billing.get(TOKEN, request.id()).status()).isEqualTo("PENDING");
        sql.execute("DROP TRIGGER skip_paid ON billing_payment_requests");
        sql.execute("CREATE TRIGGER skip_bank BEFORE INSERT ON billing_bank_transactions FOR EACH ROW EXECUTE FUNCTION skip_write()");
        assertThatThrownBy(() -> receive(body)).isInstanceOf(IllegalStateException.class);
        assertThat(count("billing_bank_transactions")).isZero();
        assertThat(billing.get(TOKEN, request.id()).status()).isEqualTo("PENDING");
        sql.execute("DROP TRIGGER skip_bank ON billing_bank_transactions");
        receive(body);
        assertThat(billing.get(TOKEN, request.id()).status()).isEqualTo("PAID");
    }

    private void receive(byte[] body) {
        String timestamp = Long.toString(clock.instant().getEpochSecond());
        webhook.accept("test", timestamp, signature(timestamp, body), body);
    }
    private byte[] payload(String id, String code, String direction, long amount, String account, String sub) {
        var body = new java.util.LinkedHashMap<String, Object>();
        body.put("id", id); body.put("gateway", "TPBank"); body.put("accountNumber", account);
        body.put("subAccount", sub); body.put("code", code); body.put("content", code == null ? "ordinary transfer" : code);
        body.put("transferType", direction); body.put("transferAmount", amount);
        return json.write(body).getBytes(StandardCharsets.UTF_8);
    }
    static String signature(String timestamp, byte[] body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            mac.update((timestamp + ".").getBytes(StandardCharsets.US_ASCII));
            return "sha256=" + HexFormat.of().formatHex(mac.doFinal(body));
        } catch (java.security.GeneralSecurityException exception) { throw new AssertionError(exception); }
    }
    private static BillingProperties settings(boolean creation, boolean receipts) {
        return new BillingProperties(creation, receipts, "test", SECRET, "TPBank", "0000000001", "SIMULATED RECIPIENT");
    }
    private void owner(String uid, String role, String status) {
        long id = sql.queryForObject("INSERT INTO users(display_name,system_role,status) VALUES ('Test payer',?,?) RETURNING id", Long.class, role, status);
        sql.update("INSERT INTO auth_identities(user_id,provider_subject) VALUES (?,?)", id, uid);
    }
    private static VerifiedFirebaseToken token(String uid) { return new VerifiedFirebaseToken(uid, null, false, null, null, null); }
    private void assertCode(Runnable operation, ErrorCode code) {
        assertThatThrownBy(operation::run).isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getErrorCode()).isEqualTo(code));
    }
    private String reason(String id) { return sql.queryForObject("SELECT reason FROM billing_bank_transactions WHERE provider_transaction_id=?", String.class, id); }
    private int count(String table) { return sql.queryForObject("SELECT count(*) FROM " + table, Integer.class); }
    private java.sql.Connection rawConnection() throws Exception {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"), System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }
    static final class MutableClock extends Clock {
        final AtomicReference<Instant> current;
        MutableClock(Instant instant) { current = new AtomicReference<>(instant); }
        void advance(long seconds) { current.updateAndGet(value -> value.plusSeconds(seconds)); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return current.get(); }
    }
}
