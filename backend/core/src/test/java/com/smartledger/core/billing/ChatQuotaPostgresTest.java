package com.smartledger.core.billing;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.smartledger.core.dto.request.AgentChatRequest;
import com.smartledger.core.dto.response.AgentChatResponse;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ShopService;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.DriverManager;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Real V21 transactions in generated schemas; a durable fake AI verifies the protocol boundary without providers. */
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
class ChatQuotaPostgresTest {
    private static final VerifiedFirebaseToken TOKEN = new VerifiedFirebaseToken("quota-owner", null, false, null, null, null);
    private static final AgentChatRequest QUESTION = new AgentChatRequest(null, "Today's revenue?");
    private String schema;
    private JdbcTemplate sql;
    private DriverManagerDataSource source;
    private DataSourceTransactionManager manager;
    private BillingRepository billing;
    private SubscriptionRepository subscriptions;
    private ChatQuotaStore store;
    private SePayPaymentsPostgresTest.MutableClock clock;
    private ShopService shops;
    private Shop shop;
    private long owner;
    private FakeAi ai;
    private ChatQuotaLedger ledger;
    private ChatQuotaService service;

    @BeforeEach void setup() throws Exception {
        schema = "core_chat_quota_" + UUID.randomUUID().toString().replace("-", "");
        try (var c = raw(); var statement = c.createStatement()) { statement.execute("CREATE SCHEMA " + schema); }
        source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
        var properties = new Properties(); properties.setProperty("currentSchema", schema); source.setConnectionProperties(properties);
        sql = new JdbcTemplate(source);
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).load().migrate();
        manager = new DataSourceTransactionManager(source);
        billing = new BillingRepository(sql); subscriptions = new SubscriptionRepository(sql); store = new ChatQuotaStore(sql);
        clock = new SePayPaymentsPostgresTest.MutableClock(Instant.parse("2027-01-31T03:04:05Z"));
        owner = sql.queryForObject("INSERT INTO users(display_name) VALUES ('Quota owner') RETURNING id", Long.class);
        sql.update("INSERT INTO auth_identities(user_id,provider_subject) VALUES (?,?)", owner, TOKEN.uid());
        long sid = sql.queryForObject("INSERT INTO shops(owner_id,name,industry) VALUES (?,'Test shop','Retail') RETURNING id", Long.class, owner);
        shop = mock(Shop.class); when(shop.getId()).thenReturn(sid); when(shop.getOwnerId()).thenReturn(owner);
        shops = mock(ShopService.class); when(shops.requireOwnedActiveShop(any(), eq(Long.toString(sid)))).thenReturn(shop);
        ai = new FakeAi(); ledger = ledger(true, true); service = service(ledger);
    }
    @AfterEach void cleanup() throws Exception {
        if (schema != null && schema.matches("core_chat_quota_[a-f0-9]{32}")) {
            try (var c = raw(); var statement = c.createStatement()) { statement.execute("DROP SCHEMA " + schema + " CASCADE"); }
        }
    }

    @Test void concurrentIndependentInstancesCannotBothReserveLastFreeSlot() throws Exception {
        service.chat(TOKEN, sid(), QUESTION, "first");
        ai.mode = "PENDING";
        try (var workers = Executors.newFixedThreadPool(2)) {
            var a = workers.submit(() -> outcome(() -> service.chat(TOKEN, sid(), QUESTION, "second")));
            var b = workers.submit(() -> outcome(() -> service(ledger(true, true)).chat(TOKEN, sid(), QUESTION, "third")));
            assertThat(List.of(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("PENDING", "ai_quota_exhausted");
        }
        assertCounts(1, 1);
        assertThat(ai.generations.get()).isEqualTo(2);
        assertThat(quota().remaining()).isZero(); assertThat(quota().enforcementEnabled()).isTrue();
    }

    @Test void replayAcrossTransportsAndDisabledAdmissionNeverDebitsOrGeneratesTwice() throws Exception {
        var first = service.chat(TOKEN, sid(), QUESTION, "stable");
        service.chat(TOKEN, sid(), new AgentChatRequest(null, "  Today's revenue?  "), " stable ");
        var out = new ByteArrayOutputStream();
        service(ledger(false, true)).stream(TOKEN, sid(), QUESTION, "stable").writeTo(out);
        assertThat(out.toString(StandardCharsets.UTF_8)).contains("event: done", first.answer()).doesNotContain("model", "request_id");
        assertThat(ai.generations.get()).isEqualTo(1); assertCounts(1, 0);
        assertCode(() -> service.chat(TOKEN, sid(), new AgentChatRequest(null, "different"), "stable"), ErrorCode.AI_TURN_CONFLICT);
        assertCode(() -> service(ledger(false, true)).chat(TOKEN, sid(), QUESTION, "new"), ErrorCode.AI_QUOTA_UNAVAILABLE);
        assertCode(() -> service(ledger(true, false)).chat(TOKEN, sid(), QUESTION, "new"), ErrorCode.AI_QUOTA_UNAVAILABLE);
        assertThat(ai.generations.get()).isEqualTo(1);
    }

    @Test void lastPaidSlotIsSharedAcrossShopsAndRenewalDoesNotMintAWindow() {
        OffsetDateTime anchor = SubscriptionPolicy.now(clock.instant());
        long period = period(anchor, 1);
        UUID window = UUID.randomUUID();
        sql.update("""
                INSERT INTO ai_quota_windows(id,user_id,kind,period_id,policy_version,window_start,nominal_end,
                    limit_count,committed_count) VALUES (?,?,'PAID_WEEKLY',?,1,?,?,300,299)
                """, window, owner, period, anchor, anchor.plusDays(7));
        service.chat(TOKEN, sid(), QUESTION, "last-paid");
        long secondShop = sql.queryForObject("INSERT INTO shops(owner_id,name,industry) VALUES (?,'Second','Retail') RETURNING id", Long.class, owner);
        Shop second = mock(Shop.class); when(second.getId()).thenReturn(secondShop); when(second.getOwnerId()).thenReturn(owner);
        when(shops.requireOwnedActiveShop(any(), eq(Long.toString(secondShop)))).thenReturn(second);
        assertCode(() -> service.chat(TOKEN, Long.toString(secondShop), QUESTION, "another"), ErrorCode.AI_QUOTA_EXHAUSTED);
        assertCode(() -> service.chat(TOKEN, Long.toString(secondShop), QUESTION, "last-paid"), ErrorCode.AI_TURN_CONFLICT);
        sql.update("UPDATE billing_subscription_periods SET purchased_months=4,expires_at=? WHERE id=?", SubscriptionPolicy.expiry(anchor, 4), period);
        assertThat(quota().remaining()).isZero(); assertThat(count("ai_quota_windows")).isEqualTo(1);
        assertThat(ai.generations.get()).isEqualTo(1);
    }

    @Test void completionAfterMidnightUsesCapturedFreeWindowAndDoesNotStackWithPaidAccess() {
        clock.current.set(Instant.parse("2027-01-31T16:59:59Z"));
        ai.mode = "PENDING";
        assertPending(() -> service.chat(TOKEN, sid(), QUESTION, "before-midnight"));
        var before = usage("before-midnight");
        clock.advance(2); ai.succeed(before);
        service.chat(TOKEN, sid(), QUESTION, "before-midnight");
        assertThat(quota().remaining()).isEqualTo(2);
        assertThat(sql.queryForObject("SELECT committed_count FROM ai_quota_windows WHERE id=?", Integer.class, before.window())).isEqualTo(1);
        var anchor = SubscriptionPolicy.now(clock.instant()); period(anchor, 1);
        ai.mode = "SUCCESS"; service.chat(TOKEN, sid(), QUESTION, "paid");
        assertThat(quota().limit()).isEqualTo(300); assertThat(quota().remaining()).isEqualTo(299);
        assertThat(count("ai_turn_usages")).isEqualTo(2);
    }

    @Test void paidTurnCompletesAfterExpiryInOriginalBucketWhileNewQuestionsUseFree() {
        var anchor = SubscriptionPolicy.now(clock.instant()); period(anchor, 1);
        ai.mode = "PENDING"; assertPending(() -> service.chat(TOKEN, sid(), QUESTION, "paid-pending"));
        var old = usage("paid-pending");
        clock.current.set(SubscriptionPolicy.expiry(anchor, 1).toInstant());
        ai.mode = "SUCCESS"; service.chat(TOKEN, sid(), QUESTION, "now-free");
        ai.succeed(old); service.chat(TOKEN, sid(), QUESTION, "paid-pending");
        assertThat(quota().limit()).isEqualTo(2); assertThat(quota().committed()).isEqualTo(1);
        assertThat(count("ai_quota_windows")).isEqualTo(2);
        assertThat(sql.queryForObject("SELECT committed_count FROM ai_quota_windows WHERE id=?", Integer.class, old.window())).isEqualTo(1);
    }

    @Test void failedRequestAndMissingReceiptRequireDurableTombstoneBeforeRelease() {
        ai.mode = "THROW_BEFORE";
        assertCode(() -> service.chat(TOKEN, sid(), QUESTION, "lost"), ErrorCode.AI_TURN_CANCELLED);
        var row = usage("lost"); assertThat(row.state()).isEqualTo("CANCELLED");
        assertCounts(0, 0); assertThat(ai.receipts.get(row.id()).state()).isEqualTo("CANCELLED");
        assertCode(() -> service.chat(TOKEN, sid(), QUESTION, "lost"), ErrorCode.AI_TURN_CANCELLED);
        assertThat(ai.dispatches.get()).isEqualTo(1); assertThat(ai.generations.get()).isZero();
    }

    @Test void crashBeforeDispatchIsRecoveredByFencedCancelAndDelayedPostCannotGenerate() {
        var admitted = ledger.admit(TOKEN, shop, QUESTION, "crash").usage();
        clock.advance(91);
        new ChatQuotaRecovery(ledger, service).run();
        assertThat(usage("crash").state()).isEqualTo("CANCELLED"); assertCounts(0, 0);
        assertThat(ai.receipts.get(admitted.id()).fence()).isEqualTo(2);
        assertThat(ai.dispatch(admitted, QUESTION)).isEqualTo(409);
        assertThat(ai.generations.get()).isZero();
    }

    @Test void successSavedBeforeCoreRollbackIsRecoveredOnceEvenAfterPayerDisabled() {
        sql.execute("CREATE FUNCTION skip_usage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$");
        sql.execute("CREATE TRIGGER skip_usage BEFORE UPDATE ON ai_turn_usages FOR EACH ROW EXECUTE FUNCTION skip_usage()");
        assertCode(() -> service.chat(TOKEN, sid(), QUESTION, "saved"), ErrorCode.AI_QUOTA_UNAVAILABLE);
        assertCounts(0, 1); assertThat(usage("saved").state()).isEqualTo("RESERVED");
        sql.execute("DROP TRIGGER skip_usage ON ai_turn_usages");
        sql.update("UPDATE users SET status='DISABLED' WHERE id=?", owner);
        clock.advance(91); new ChatQuotaRecovery(ledger, service).run();
        assertCounts(1, 0); assertThat(usage("saved").state()).isEqualTo("SUCCEEDED");
        assertCode(() -> service.chat(TOKEN, sid(), QUESTION, "saved"), ErrorCode.ACCOUNT_DISABLED);
        sql.update("UPDATE users SET status='ACTIVE' WHERE id=?", owner);
        service.chat(TOKEN, sid(), QUESTION, "saved"); assertCounts(1, 0);
        assertThat(ai.generations.get()).isEqualTo(1);
    }

    @Test void unavailableReceiptAndCancellationRetainCapacityAndStaleFinalizerCannotRefund() {
        ai.online = false;
        assertCode(() -> service.chat(TOKEN, sid(), QUESTION, "unknown"), ErrorCode.AI_QUOTA_UNAVAILABLE);
        var original = usage("unknown"); assertCounts(0, 1);
        clock.advance(91); var claimed = ledger.claim(original.id());
        assertThat(claimed.fence()).isEqualTo(2);
        assertThat(ledger.finish(original, "SUCCEEDED", null)).isFalse();
        service.recover(claimed); assertCounts(0, 1);
        ai.online = true; clock.advance(91); new ChatQuotaRecovery(ledger, service).run();
        assertCounts(0, 0); assertThat(usage("unknown").state()).isEqualTo("CANCELLED");
        assertThat(ai.generations.get()).isZero();
    }

    @Test void successfulReceiptWithDeletedResultStaysChargedAndNeverRegenerates() {
        service.chat(TOKEN, sid(), QUESTION, "deleted");
        var row = usage("deleted");
        ai.receipts.put(row.id(), new ChatQuotaTransport.Receipt(row.id(), row.fence(), "SUCCEEDED", false, null, null));
        assertCode(() -> service.chat(TOKEN, sid(), QUESTION, "deleted"), ErrorCode.AI_TURN_RESULT_REMOVED);
        assertCounts(1, 0); assertThat(ai.generations.get()).isEqualTo(1);
        ai.receipts.remove(row.id());
        assertCode(() -> service.chat(TOKEN, sid(), QUESTION, "deleted"), ErrorCode.AI_QUOTA_UNAVAILABLE);
        assertCounts(1, 0); assertThat(ai.cancels.get()).isZero();
    }

    @Test void streamsCommitBeforeDoneIgnorePrematureDoneAndRecoverDisconnectRace() throws Exception {
        ai.frames = ": heartbeat\n\nevent: delta\ndata: {\"text\":\"hello\"}\n\nevent: done\ndata: {\"model\":\"private\"}\n\n";
        var out = new ByteArrayOutputStream() {
            @Override public synchronized void write(byte[] b, int off, int len) {
                if (new String(b, off, len, StandardCharsets.UTF_8).startsWith("event: done")) assertCounts(1, 0);
                super.write(b, off, len);
            }
        };
        service.stream(TOKEN, sid(), QUESTION, "stream").writeTo(out);
        assertThat(out.toString(StandardCharsets.UTF_8)).contains("event: done", "answer").doesNotContain("model", "request_id");
        ai.mode = "PENDING";
        var early = new ByteArrayOutputStream(); service.stream(TOKEN, sid(), QUESTION, "early").writeTo(early);
        assertThat(early.toString(StandardCharsets.UTF_8)).contains("event: error").doesNotContain("event: done");
        assertCounts(1, 0);
        // Reuse the released slot: a disconnect races a committed AI save on close.
        ai.saveOnClose = true;
        var broken = service.stream(TOKEN, sid(), QUESTION, "disconnect");
        assertThatThrownBy(() -> broken.writeTo(new java.io.OutputStream() {
            @Override public void write(int b) throws IOException { throw new IOException("client disconnected"); }
        })).isInstanceOf(IOException.class);
        assertCounts(2, 0); assertThat(usage("disconnect").state()).isEqualTo("SUCCEEDED");
    }

    @Test void disabledGatesDoNotQueryRecoveryAndBrokenStoresFailClosedWithoutAi() {
        assertThat(ledger(false, false).expired()).isEmpty();
        for (String key : new String[]{null, " ", "x".repeat(256)})
            assertCode(() -> service.chat(TOKEN, sid(), QUESTION, key), ErrorCode.AI_TURN_KEY_INVALID);
        sql.execute("ALTER TABLE ai_turn_usages RENAME TO missing_usages");
        assertCode(() -> service.chat(TOKEN, sid(), QUESTION, "new"), ErrorCode.AI_QUOTA_UNAVAILABLE);
        assertThat(ai.generations.get()).isZero();
    }

    @Test void admissionWaitingForWindowLockRechecksVietnamMidnightBeforeReserving() throws Exception {
        clock.current.set(Instant.parse("2027-01-31T16:59:59Z"));
        ai.mode = "PENDING";
        assertPending(() -> service.chat(TOKEN, sid(), QUESTION, "first-day"));
        var old = usage("first-day");
        try (var blocker = source.getConnection(); var workers = Executors.newSingleThreadExecutor()) {
            blocker.setAutoCommit(false);
            try (var lock = blocker.prepareStatement("SELECT id FROM ai_quota_windows WHERE id=? FOR UPDATE")) {
                lock.setObject(1, old.window()); lock.executeQuery().close();
            }
            var waiting = workers.submit(() -> outcome(() -> service(ledger(true, true)).chat(TOKEN, sid(), QUESTION, "next-day")));
            boolean blocked = false;
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
            while (System.nanoTime() < deadline) {
                if (sql.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%ai_quota_windows%'", Integer.class) > 0) { blocked = true; break; }
                Thread.sleep(10);
            }
            assertThat(blocked).isTrue(); clock.advance(2); blocker.commit();
            assertThat(waiting.get(10, TimeUnit.SECONDS)).isEqualTo("PENDING");
        }
        assertThat(usage("next-day").window()).isNotEqualTo(old.window());
        assertThat(quota().reserved()).isEqualTo(1); assertThat(quota().remaining()).isEqualTo(1);
    }

    @Test void definitiveGuardrailFailureReleasesExactlyOnceAndItsKeyCannotRestart() {
        var row = ledger.admit(TOKEN, shop, QUESTION, "guardrail").usage();
        ai.receipts.put(row.id(), new ChatQuotaTransport.Receipt(row.id(), 1, "FAILED", false, null, "answer_timeout"));
        assertCode(() -> service.chat(TOKEN, sid(), QUESTION, "guardrail"), ErrorCode.AGENT_ANSWER_TIMEOUT);
        assertCode(() -> service.chat(TOKEN, sid(), QUESTION, "guardrail"), ErrorCode.AGENT_ANSWER_TIMEOUT);
        assertCounts(0, 0); assertThat(ai.generations.get()).isZero();
    }

    @Test void missingConversationKeepsItsCodeAcrossRetriesAndReleasesOnce() throws Exception {
        ai.mode = "MISSING_CONVERSATION";
        var question = new AgentChatRequest(999_999L, "Today's revenue?");
        assertCode(() -> service.chat(TOKEN, sid(), question, "missing"), ErrorCode.CONVERSATION_NOT_FOUND);
        assertCode(() -> service.chat(TOKEN, sid(), question, "missing"), ErrorCode.CONVERSATION_NOT_FOUND);
        assertCode(() -> service.stream(TOKEN, sid(), question, "missing"), ErrorCode.CONVERSATION_NOT_FOUND);
        assertCode(() -> service.stream(TOKEN, sid(), question, "missing-stream"), ErrorCode.CONVERSATION_NOT_FOUND);
        assertCode(() -> service.chat(TOKEN, sid(), question, "missing-stream"), ErrorCode.CONVERSATION_NOT_FOUND);
        assertThat(ai.dispatches.get()).isEqualTo(2); assertThat(ai.cancels.get()).isZero();
        assertThat(sql.queryForList("SELECT failure_code FROM ai_turn_usages", String.class))
                .containsExactly("conversation_not_found", "conversation_not_found");
        assertCounts(0, 0); assertThat(ai.generations.get()).isZero();
    }

    @Test void recoveryBatchesAdvancePastUnavailableRowsWithoutReleasingUnknownWork() {
        period(SubscriptionPolicy.now(clock.instant()), 1);
        for (int i = 0; i < 25; i++) ledger.admit(TOKEN, shop, QUESTION, "pending-" + i);
        ai.online = false; clock.advance(91);
        var worker = new ChatQuotaRecovery(ledger, service); worker.run();
        assertThat(sql.queryForObject("SELECT count(*) FROM ai_turn_usages WHERE execution_fence=2", Integer.class)).isEqualTo(20);
        worker.run();
        assertThat(sql.queryForObject("SELECT count(*) FROM ai_turn_usages WHERE execution_fence=2", Integer.class)).isEqualTo(25);
        assertCounts(0, 25);
        ai.online = true; clock.advance(91); worker.run(); worker.run();
        assertCounts(0, 0); assertThat(ai.generations.get()).isZero();
    }

    @Test void completedReplayAfterExhaustionAndActivationDoesNotUseNewPaidAllowance() {
        service.chat(TOKEN, sid(), QUESTION, "a"); service.chat(TOKEN, sid(), QUESTION, "b");
        assertCode(() -> service.chat(TOKEN, sid(), QUESTION, "c"), ErrorCode.AI_QUOTA_EXHAUSTED);
        service.chat(TOKEN, sid(), QUESTION, "a");
        period(SubscriptionPolicy.now(clock.instant()), 1);
        service.chat(TOKEN, sid(), QUESTION, "a");
        assertThat(quota().limit()).isEqualTo(300); assertThat(quota().remaining()).isEqualTo(300);
        assertThat(count("ai_quota_windows")).isEqualTo(1); assertThat(ai.generations.get()).isEqualTo(2);
    }

    @Test void differentOwnersHaveIndependentBucketsAndInvalidStoredPolicyNeverMintsCapacity() {
        service.chat(TOKEN, sid(), QUESTION, "same"); service.chat(TOKEN, sid(), QUESTION, "second");
        long other = sql.queryForObject("INSERT INTO users(display_name) VALUES ('Other') RETURNING id", Long.class);
        sql.update("INSERT INTO auth_identities(user_id,provider_subject) VALUES (?,'other-owner')", other);
        long otherShop = sql.queryForObject("INSERT INTO shops(owner_id,name,industry) VALUES (?,'Other','Retail') RETURNING id", Long.class, other);
        Shop otherEntity = mock(Shop.class); when(otherEntity.getId()).thenReturn(otherShop); when(otherEntity.getOwnerId()).thenReturn(other);
        when(shops.requireOwnedActiveShop(any(), eq(Long.toString(otherShop)))).thenReturn(otherEntity);
        var token = new VerifiedFirebaseToken("other-owner", null, false, null, null, null);
        service.chat(token, Long.toString(otherShop), QUESTION, "same");
        assertCounts(3, 0);
        sql.update("UPDATE ai_quota_windows SET policy_version=2 WHERE user_id=?", other);
        assertCode(() -> service.chat(token, Long.toString(otherShop), QUESTION, "new"), ErrorCode.AI_QUOTA_UNAVAILABLE);
        assertThat(ai.generations.get()).isEqualTo(3);
    }

    private ChatQuotaLedger ledger(boolean enabled, boolean recovery) {
        return new ChatQuotaLedger(store, billing, subscriptions, new ChatQuotaProperties(enabled, recovery), clock, manager);
    }
    private ChatQuotaService service(ChatQuotaLedger ledger) { return new ChatQuotaService(shops, ledger, ai); }
    private String sid() { return shop.getId().toString(); }
    private QuotaResponse quota() {
        return new SubscriptionService(billing, subscriptions, new SubscriptionProperties(false), clock, manager,
                new ChatQuotaProperties(true, true)).quota(TOKEN);
    }
    private ChatQuotaStore.Usage usage(String key) { return store.key(owner, key).orElseThrow(); }
    private long period(OffsetDateTime anchor, int months) {
        return sql.queryForObject("""
                INSERT INTO billing_subscription_periods(user_id,activated_at,purchased_months,quota_policy_version,expires_at,version)
                VALUES (?,?,?,1,?,1) RETURNING id
                """, Long.class, owner, anchor, months, SubscriptionPolicy.expiry(anchor, months));
    }
    private void assertCounts(int committed, int reserved) {
        assertThat(sql.queryForObject("SELECT coalesce(sum(committed_count),0) FROM ai_quota_windows", Integer.class)).isEqualTo(committed);
        assertThat(sql.queryForObject("SELECT coalesce(sum(reserved_count),0) FROM ai_quota_windows", Integer.class)).isEqualTo(reserved);
    }
    private int count(String table) { return sql.queryForObject("SELECT count(*) FROM " + table, Integer.class); }
    private static void assertCode(Runnable action, ErrorCode code) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getErrorCode()).isEqualTo(code));
    }
    private static void assertPending(Runnable action) { assertThatThrownBy(action::run).isInstanceOf(ChatTurnPending.class); }
    private static String outcome(Runnable action) {
        try { action.run(); return "SUCCESS"; }
        catch (BusinessException failure) { return failure.getErrorCode().getCode(); }
        catch (ChatTurnPending pending) { return "PENDING"; }
    }
    private java.sql.Connection raw() throws Exception {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"), System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }

    static class FakeAi implements ChatQuotaTransport {
        final Map<UUID, Receipt> receipts = new ConcurrentHashMap<>();
        final AtomicInteger generations = new AtomicInteger(), dispatches = new AtomicInteger(), cancels = new AtomicInteger();
        volatile String mode = "SUCCESS";
        volatile boolean online = true, saveOnClose;
        volatile String frames = "event: done\ndata: {}\n\n";
        private void network() { assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse(); if (!online) throw ChatQuotaLedger.unavailable(); }
        void succeed(ChatQuotaStore.Usage row) { receipts.put(row.id(), new Receipt(row.id(), 1, "SUCCEEDED", true, new AgentChatResponse(31, 41, "answer"), null)); }
        @Override public int dispatch(ChatQuotaStore.Usage row, AgentChatRequest input) {
            dispatches.incrementAndGet(); network();
            var old = receipts.get(row.id());
            if (old != null && old.state().equals("CANCELLED")) return 409;
            if (mode.equals("THROW_BEFORE")) throw ChatQuotaLedger.unavailable();
            if (mode.equals("MISSING_CONVERSATION")) {
                receipts.put(row.id(), new Receipt(row.id(), row.fence(), "FAILED", false, null, "conversation_not_found"));
                return 404;
            }
            generations.incrementAndGet();
            if (mode.equals("PENDING")) receipts.put(row.id(), new Receipt(row.id(), row.fence(), "IN_PROGRESS", false, null, null));
            else succeed(row);
            return mode.equals("PENDING") ? 202 : 200;
        }
        @Override public StreamReply stream(ChatQuotaStore.Usage row, AgentChatRequest input) {
            if (dispatch(row, input) == 404) return new StreamReply(404, null);
            return new StreamReply(200, new Upstream() {
                boolean closed;
                @Override public java.io.InputStream body() { return new ByteArrayInputStream(frames.getBytes(StandardCharsets.UTF_8)); }
                @Override public void close() { if (!closed && saveOnClose) succeed(row); closed = true; }
            });
        }
        @Override public Receipt read(ChatQuotaStore.Usage row) {
            network(); return receipts.getOrDefault(row.id(), new Receipt(row.id(), 0, "MISSING", false, null, null));
        }
        @Override public Receipt cancel(ChatQuotaStore.Usage row) {
            network(); cancels.incrementAndGet();
            return receipts.compute(row.id(), (id, previous) -> {
                if (previous != null && previous.terminal()) return previous;
                return new Receipt(row.id(), row.fence(), "CANCELLED", false, null, "ai_turn_cancelled");
            });
        }
    }
}
