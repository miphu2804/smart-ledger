package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** Exercises approved billing/quota DDL in disposable schemas, not payment or AI runtime behavior. */
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
class BillingSchemaPostgresTest {
    private static final AtomicLong KEYS = new AtomicLong();
    private static final String HASH = "a".repeat(64);
    private static final List<String> TABLES = List.of("billing_payment_requests", "billing_bank_transactions",
            "billing_subscription_periods", "billing_subscription_grants", "ai_quota_windows", "ai_turn_usages");
    private String schema;
    private DriverManagerDataSource source;
    private JdbcTemplate sql;
    private TransactionTemplate transaction;

    @BeforeEach
    void createDisposableV20() throws Exception {
        schema = "core_billing_test_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = rawConnection(); var statement = connection.createStatement()) {
            statement.execute("CREATE SCHEMA " + schema);
        }
        source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
        var properties = new Properties();
        properties.setProperty("currentSchema", schema);
        source.setConnectionProperties(properties);
        sql = new JdbcTemplate(source);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        flyway("20").migrate();
    }

    @AfterEach
    void removeOnlyGeneratedSchema() throws Exception {
        if (schema != null && schema.matches("core_billing_test_[a-f0-9]{32}")) {
            try (var connection = rawConnection(); var statement = connection.createStatement()) {
                statement.execute("DROP SCHEMA " + schema + " CASCADE");
            }
        }
    }

    @Test
    void upgradePreservesV20DataAndAddsSixEmptyPrivateTables() {
        long user = user();
        long shop = shop(user);
        var beforeUser = sql.queryForMap("SELECT * FROM users WHERE id=?", user);
        var beforeShop = sql.queryForMap("SELECT * FROM shops WHERE id=?", shop);
        assertThat(flyway("21").migrate().migrationsExecuted).isEqualTo(1);
        assertThat(flyway("21").migrate().migrationsExecuted).isZero();
        assertThat(flyway("21").validateWithResult().validationSuccessful).isTrue();
        assertThat(sql.queryForMap("SELECT * FROM users WHERE id=?", user)).isEqualTo(beforeUser);
        assertThat(sql.queryForMap("SELECT * FROM shops WHERE id=?", shop)).isEqualTo(beforeShop);
        for (var table : TABLES) {
            assertThat(count(table)).isZero();
            assertPrivate(table);
        }
        assertThat(sql.queryForObject("SELECT to_regclass('agent_turn_receipts')", String.class)).isNull();
        assertThat(sql.queryForObject("SELECT count(*) FROM sales", Integer.class)).isZero();
        assertThat(sql.queryForObject("SELECT count(*) FROM payments", Integer.class)).isZero();
    }

    @Test
    void lateCollisionRollsBackAllNewObjectsAndCanRetryWithoutRepair() {
        sql.execute("CREATE TABLE ai_turn_usages(marker TEXT)");
        sql.update("INSERT INTO ai_turn_usages VALUES ('unrelated')");
        assertThatThrownBy(() -> flyway("21").migrate()).isInstanceOf(RuntimeException.class);
        assertThat(sql.queryForObject("SELECT marker FROM ai_turn_usages", String.class)).isEqualTo("unrelated");
        assertThat(sql.queryForObject("SELECT to_regclass('billing_payment_requests')", String.class)).isNull();
        assertThat(sql.queryForObject("SELECT to_regclass('ai_quota_windows')", String.class)).isNull();
        assertThat(sql.queryForObject("SELECT max(version::int) FROM flyway_schema_history WHERE success", Integer.class)).isEqualTo(20);
        sql.execute("DROP TABLE ai_turn_usages");
        assertThat(flyway("21").migrate().migrationsExecuted).isEqualTo(1);
    }

    @Test
    void foreignKeyLockTimeoutKeepsV20UsableAndRetryWorks() throws Exception {
        try (var connection = source.getConnection(); var statement = connection.createStatement()) {
            connection.setAutoCommit(false);
            statement.execute("LOCK TABLE users IN ACCESS EXCLUSIVE MODE");
            assertThatThrownBy(() -> flyway("21").migrate()).isInstanceOf(RuntimeException.class)
                    .hasStackTraceContaining("lock timeout");
            connection.rollback();
        }
        assertThat(sql.queryForObject("SELECT to_regclass('billing_payment_requests')", String.class)).isNull();
        assertThat(flyway("21").migrate().migrationsExecuted).isEqualTo(1);
    }

    @Test
    void ownerKeysSurviveIntegrationRotationAndProviderDedupeKeepsFinancialScope() {
        flyway("21").migrate();
        long owner = user();
        long other = user();
        long request = request(owner, "company-test", "same-key");
        rejects(() -> request(owner, "company-live", "same-key"));
        request(other, "company-test", "same-key");
        long accepted = bank(owner, request, "company-test", "100", "ACCEPTED", "MATCHED");
        rejects(() -> bank(owner, request, "company-test", "100", "REVIEW_REQUIRED", "EXTRA_TRANSFER"));
        rejects(() -> bank(owner, request, "company-test", "101", "ACCEPTED", "MATCHED"));
        bank(owner, request, "company-test", "102", "REVIEW_REQUIRED", "EXTRA_TRANSFER");
        rejects(() -> bank(other, request, "company-test", "103", "REVIEW_REQUIRED", "AMOUNT_MISMATCH"));
        rejects(() -> bank(owner, request, "company-live", "104", "REVIEW_REQUIRED", "RECIPIENT_MISMATCH"));
        long liveRequest = request(owner, "company-live", "live-key");
        bank(owner, liveRequest, "company-live", "100", "ACCEPTED", "MATCHED");
        rejects(() -> sql.update("UPDATE billing_payment_requests SET duration_months=3 WHERE id=?", request));
        rejects(() -> sql.update("UPDATE billing_payment_requests SET original_response='[]' WHERE id=?", request));
        assertThat(accepted).isPositive();
    }

    @Test
    void grantsRequireSameAcceptedPaymentAndAtomicApplicationCanRollBack() {
        flyway("21").migrate();
        long owner = user();
        long request = request(owner, "test", "pay");
        long payment = bank(owner, request, "test", "201", "ACCEPTED", "MATCHED");
        long period = period(owner);
        sql.update("UPDATE billing_payment_requests SET status='PAID',paid_at=now(),fulfillment_status='PENDING' WHERE id=?", request);
        transaction.executeWithoutResult(status -> {
            long grant = grant(owner, request, payment, period);
            sql.update("UPDATE billing_payment_requests SET fulfillment_status='APPLIED',fulfilled_grant_id=? WHERE id=?", grant, request);
            status.setRollbackOnly();
        });
        assertThat(count("billing_subscription_grants")).isZero();
        assertThat(sql.queryForObject("SELECT fulfillment_status FROM billing_payment_requests WHERE id=?", String.class, request)).isEqualTo("PENDING");
        long grant = transaction.execute(status -> {
            long id = grant(owner, request, payment, period);
            sql.update("UPDATE billing_payment_requests SET fulfillment_status='APPLIED',fulfilled_grant_id=? WHERE id=?", id, request);
            return id;
        });
        rejects(() -> grant(owner, request, payment, period));
        long otherRequest = request(owner, "test", "other");
        rejects(() -> sql.update("UPDATE billing_payment_requests SET status='PAID',paid_at=now(),fulfillment_status='APPLIED',fulfilled_grant_id=? WHERE id=?", grant, otherRequest));
        long otherUser = user();
        long foreignPeriod = period(otherUser);
        long review = bank(owner, otherRequest, "test", "202", "REVIEW_REQUIRED", "LATE_RECEIPT");
        rejects(() -> grant(owner, otherRequest, review, period));
        long otherAccepted = bank(owner, otherRequest, "test", "203", "ACCEPTED", "MATCHED");
        rejects(() -> grant(owner, otherRequest, otherAccepted, foreignPeriod));
        assertThatThrownBy(() -> sql.update("DELETE FROM billing_bank_transactions WHERE id=?", payment)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> sql.update("UPDATE billing_subscription_grants SET duration_months=3 WHERE id=?", grant)).isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> sql.execute("TRUNCATE billing_bank_transactions CASCADE")).isInstanceOf(DataAccessException.class);
    }

    @Test
    void quotaKeysAndScopedWindowsCannotMintCapacityOrMoveAnotherUsersTurn() {
        flyway("21").migrate();
        long owner = user();
        long other = user();
        long shop = shop(owner);
        long period = period(owner);
        rejects(() -> period(owner));
        UUID free = window(owner, null, 1);
        rejects(() -> window(owner, null, 2));
        UUID paid = window(owner, period, 1);
        rejects(() -> window(owner, period, 2));
        rejects(() -> window(other, period, 1));
        UUID turn = usage(owner, shop, free, "question");
        rejects(() -> usage(owner, shop, paid, "question"));
        rejects(() -> usage(other, shop, free, "foreign"));
        rejects(() -> sql.update("UPDATE ai_quota_windows SET reserved_count=3 WHERE id=?", free));
        rejects(() -> sql.update("UPDATE ai_quota_windows SET committed_count=-1 WHERE id=?", free));
        rejects(() -> sql.update("UPDATE ai_turn_usages SET state='SUCCEEDED' WHERE id=?", turn));
        sql.update("UPDATE ai_turn_usages SET state='RECONCILING' WHERE id=?", turn);
        assertThat(sql.queryForObject("SELECT completed_at IS NULL FROM ai_turn_usages WHERE id=?", Boolean.class, turn)).isTrue();
    }

    @Test
    void independentDatabaseWritersCannotReserveTheSameLastSlot() throws Exception {
        flyway("21").migrate();
        UUID window = window(user(), null, 1);
        sql.update("UPDATE ai_quota_windows SET committed_count=1 WHERE id=?", window);
        var start = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var first = workers.submit(() -> claimLastSlot(start, window));
            var second = workers.submit(() -> claimLastSlot(start, window));
            start.countDown();
            assertThat(first.get(10, TimeUnit.SECONDS) + second.get(10, TimeUnit.SECONDS)).isEqualTo(1);
        }
        assertThat(sql.queryForObject("SELECT committed_count+reserved_count FROM ai_quota_windows WHERE id=?", Integer.class, window)).isEqualTo(2);
    }

    @Test
    void aiMigrationPreservesChatDeletionAndKeepsSuccessfulReceiptWithoutContent() throws Exception {
        flyway("21").migrate();
        long owner = user();
        long shop = shop(owner);
        // Reuse the baseline's actual chat DDL; Core CI uses vanilla PostgreSQL without vector.
        // The full AI migration set is rehearsed separately on the disposable pgvector database.
        String baseline = Files.readString(Path.of("../../supabase/migrations/20261005000000_ai_baseline.sql"));
        int vectorBoundary = baseline.indexOf("-- Embeddings live in PostgreSQL");
        assertThat(vectorBoundary).isPositive();
        sql.execute(baseline.substring(0, vectorBoundary));
        aiMigration("20261107000000_agent_turn_receipts.sql");
        assertPrivate("agent_turn_receipts");
        long conversation = sql.queryForObject("INSERT INTO chat_conversations(user_id,shop_id) VALUES (?,?) RETURNING id", Long.class, owner, shop);
        long message = sql.queryForObject("INSERT INTO chat_messages(conversation_id,role,content) VALUES (?,'ASSISTANT','saved answer') RETURNING id", Long.class, conversation);
        UUID turn = UUID.randomUUID();
        sql.update("""
                INSERT INTO agent_turn_receipts(turn_id,user_id,shop_id,request_hash,hash_version,state,
                    execution_fence,created_at,completed_at,result_conversation_id,result_message_id)
                VALUES (?,?,?, ?,1,'SUCCEEDED',1,now(),now(),?,?)
                """, turn, owner, shop, HASH, conversation, message);
        rejects(() -> sql.update("INSERT INTO agent_turn_receipts SELECT * FROM agent_turn_receipts WHERE turn_id=?", turn));
        aiMigration("20261108000000_agent_turn_result_metadata.sql");
        assertPrivate("agent_turn_receipts");
        assertThat(sql.queryForMap("SELECT result_model,result_model_version FROM agent_turn_receipts WHERE turn_id=?", turn))
                .containsEntry("result_model", null).containsEntry("result_model_version", null);
        rejects(() -> sql.update("UPDATE agent_turn_receipts SET result_model='incomplete' WHERE turn_id=?", turn));
        sql.update("DELETE FROM chat_messages WHERE id=?", message);
        sql.update("DELETE FROM chat_conversations WHERE id=?", conversation);
        var receipt = sql.queryForMap("SELECT state,result_message_id,result_conversation_id FROM agent_turn_receipts WHERE turn_id=?", turn);
        assertThat(receipt.get("state")).isEqualTo("SUCCEEDED");
        assertThat(receipt.get("result_message_id")).isNull();
        assertThat(receipt.get("result_conversation_id")).isNull();
        UUID tombstone = UUID.randomUUID();
        sql.update("""
                INSERT INTO agent_turn_receipts(turn_id,user_id,shop_id,state,execution_fence,created_at,completed_at,failure_code)
                VALUES (?,?,?,'CANCELLED',2,now(),now(),'cancelled')
                """, tombstone, owner, shop);
        rejects(() -> sql.update("UPDATE agent_turn_receipts SET state='IN_PROGRESS',completed_at=null,failure_code=null WHERE turn_id=?", tombstone));
        assertThat(sql.queryForObject("SELECT count(*) FROM information_schema.columns WHERE table_schema=? AND table_name='agent_turn_receipts' AND column_name IN ('answer','message','content')", Integer.class, schema)).isZero();
    }

    @Test
    void migrationRevokesInheritedDefaultClientAndAiReaderGrants() {
        sql.execute("DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
        sql.execute("DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
        sql.execute("DO $$ BEGIN CREATE ROLE ai_sql_reader NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
        sql.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA " + schema + " GRANT ALL ON TABLES TO anon, authenticated, ai_sql_reader");
        sql.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA " + schema + " GRANT ALL ON SEQUENCES TO anon, authenticated, ai_sql_reader");
        flyway("21").migrate();
        for (var table : TABLES) assertPrivate(table);
        assertThat(sql.queryForObject("""
                SELECT count(*) FROM information_schema.usage_privileges WHERE object_schema=?
                AND grantee IN ('PUBLIC','anon','authenticated','ai_sql_reader') AND object_type='SEQUENCE'
                """, Integer.class, schema)).isZero();
    }

    private int claimLastSlot(CountDownLatch start, UUID id) throws Exception {
        assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
        return new JdbcTemplate(source).update("UPDATE ai_quota_windows SET reserved_count=reserved_count+1 WHERE id=? AND committed_count+reserved_count<limit_count", id);
    }

    private void assertPrivate(String table) {
        assertThat(sql.queryForObject("SELECT relrowsecurity FROM pg_class WHERE oid=?::regclass", Boolean.class, table)).isTrue();
        assertThat(sql.queryForObject("SELECT count(*) FROM pg_policies WHERE schemaname=? AND tablename=?", Integer.class, schema, table)).isZero();
        assertThat(sql.queryForObject("SELECT count(*) FROM information_schema.table_privileges WHERE table_schema=? AND table_name=? AND grantee IN ('PUBLIC','anon','authenticated','ai_sql_reader')", Integer.class, schema, table)).isZero();
    }

    private long user() {
        return sql.queryForObject("INSERT INTO users(display_name) VALUES ('Billing test') RETURNING id", Long.class);
    }

    private long shop(long user) {
        return sql.queryForObject("INSERT INTO shops(owner_id,name,industry) VALUES (?,'Test shop','test') RETURNING id", Long.class, user);
    }

    private long request(long user, String integration, String key) {
        return sql.queryForObject("""
                INSERT INTO billing_payment_requests(payer_user_id,integration_key,plan_code,plan_version,duration_months,
                    quota_policy_version,amount_vnd,currency,recipient_bank_code,recipient_account_number,recipient_account_name,
                    payment_code,idempotency_key,request_hash,hash_version,original_response,created_at,expires_at)
                VALUES (?,?,'FULL_MONTHLY',1,1,1,99000,'VND','TEST','0000000001','Test recipient',?,?,?,1,'{}',now(),now()+interval '30 minutes') RETURNING id
                """, Long.class, user, integration, "SLP%012d".formatted(KEYS.incrementAndGet()), key, HASH);
    }

    private long bank(long user, long request, String integration, String providerId, String disposition, String reason) {
        return sql.queryForObject("""
                INSERT INTO billing_bank_transactions(integration_key,provider_transaction_id,first_received_at,direction,
                    amount_vnd,bank_code,account_number,matched_request_id,payer_user_id,disposition,reason,financial_hash,hash_version)
                VALUES (?,?,now(),'IN',99000,'TEST','0000000001',?,?,?,?,?,1) RETURNING id
                """, Long.class, integration, providerId, request, user, disposition, reason, HASH);
    }

    private long period(long user) {
        return sql.queryForObject("INSERT INTO billing_subscription_periods(user_id,activated_at,purchased_months,quota_policy_version,expires_at,version) VALUES (?,now(),1,1,now()+interval '1 month',1) RETURNING id", Long.class, user);
    }

    private long grant(long user, long request, long payment, long period) {
        return sql.queryForObject("""
                INSERT INTO billing_subscription_grants(payment_request_id,accepted_transaction_id,user_id,integration_key,
                    period_id,period_version,duration_months,resulting_expires_at,applied_at)
                VALUES (?,?,?,'test',?,1,1,now()+interval '1 month',now()) RETURNING id
                """, Long.class, request, payment, user, period);
    }

    private UUID window(long user, Long period, int policy) {
        UUID id = UUID.randomUUID();
        sql.update("""
                INSERT INTO ai_quota_windows(id,user_id,kind,period_id,policy_version,window_start,nominal_end,limit_count)
                VALUES (?,?,?,?,?,date_trunc('day',now()),date_trunc('day',now())+?::interval,?)
                """, id, user, period == null ? "FREE_DAILY" : "PAID_WEEKLY", period, policy,
                period == null ? "1 day" : "7 days", period == null ? 2 : 300);
        return id;
    }

    private UUID usage(long user, long shop, UUID window, String key) {
        UUID id = UUID.randomUUID();
        sql.update("""
                INSERT INTO ai_turn_usages(id,user_id,shop_id,idempotency_key,request_hash,hash_version,window_id,
                    execution_fence,lease_owner,lease_expires_at,admitted_at)
                VALUES (?,?,?,?,?,1,?,1,?,now()+interval '1 minute',now())
                """, id, user, shop, key, HASH, window, UUID.randomUUID());
        return id;
    }

    private int count(String table) {
        return sql.queryForObject("SELECT count(*) FROM " + table, Integer.class);
    }

    private void rejects(Runnable operation) {
        assertThatThrownBy(operation::run).isInstanceOf(DataIntegrityViolationException.class);
    }

    private void aiMigration(String name) throws Exception {
        var path = Path.of("../../supabase/migrations", name);
        transaction.executeWithoutResult(status -> {
            try {
                sql.execute(Files.readString(path));
            } catch (java.io.IOException exception) {
                throw new java.io.UncheckedIOException(exception);
            }
        });
    }

    private Flyway flyway(String version) {
        return Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target(version).load();
    }

    private Connection rawConnection() throws Exception {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }
}
