package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.entity.AuthIdentity;
import com.smartledger.core.entity.AuditLog;
import com.smartledger.core.entity.Category;
import com.smartledger.core.entity.Customer;
import com.smartledger.core.entity.Debt;
import com.smartledger.core.entity.Expense;
import com.smartledger.core.entity.Payment;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.SaleDraft;
import com.smartledger.core.entity.SaleDraftItem;
import com.smartledger.core.entity.SaleItem;
import com.smartledger.core.entity.SaleRefund;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.enums.AuditAction;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Properties;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Opt-in real PostgreSQL migration tests; only generated schemas are touched. */
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
class SaleRefundMigrationPostgresTest {
    private String schema;

    @BeforeEach
    void createIsolatedSchema() throws SQLException {
        schema = "core_migration_test_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = rawConnection(); var statement = connection.createStatement()) {
            statement.execute("CREATE SCHEMA \"" + schema + "\"");
        }
    }

    @AfterEach
    void removeOnlyGeneratedSchema() throws SQLException {
        if (schema != null && schema.matches("core_migration_test_[a-f0-9]{32}")) {
            try (var connection = rawConnection(); var statement = connection.createStatement()) {
                statement.execute("DROP SCHEMA \"" + schema + "\" CASCADE");
            }
        }
    }

    @Test
    void freshMigrationsMatchEveryEntityAndSecondRunDoesNothing() {
        assertThat(flyway(null).migrate().migrationsExecuted).isEqualTo(11);
        validateEntitySchema();
        assertThat(flyway(null).migrate().migrationsExecuted).isZero();
        assertThat(flyway(null).validateWithResult().validationSuccessful).isTrue();
    }

    @Test
    void upgradeFromV8PreservesMoneySettledDebtAndUnknownStockHistory() throws SQLException {
        migrateAndSeedV8();
        assertThat(flyway(null).migrate().migrationsExecuted).isEqualTo(3);
        validateEntitySchema();

        assertThat(scalar("SELECT stock_deducted FROM sale_items WHERE id = 1")).isNull();
        assertThat(scalar("SELECT product_id FROM sale_items WHERE id = 2")).isNull();
        assertThat(scalar("SELECT stock_deducted FROM sale_items WHERE id = 2")).isNull();
        assertThat(scalar("SELECT stock_quantity FROM products WHERE id = 1")).isEqualTo("7.000");
        assertThat(scalar("SELECT amount_vnd FROM payments WHERE id = 1")).isEqualTo("40000");
        assertThat(scalar("SELECT status || ':' || outstanding_vnd FROM debts WHERE id = 1"))
                .isEqualTo("OPEN:60000");
        assertThat(scalar("SELECT status || ':' || outstanding_vnd FROM debts WHERE id = 2"))
                .isEqualTo("SETTLED:0");
        assertThat(scalar("SELECT settled_at = TIMESTAMPTZ '2026-09-01T10:00:00Z' FROM debts WHERE id = 2"))
                .isEqualTo("t");
        assertThat(scalar("SELECT count(*) FROM debts WHERE voided_at IS NOT NULL OR cancelled_vnd IS NOT NULL"))
                .isEqualTo("0");
        assertThat(scalar("SELECT count(*) FROM sale_refunds")).isEqualTo("0");
    }

    @Test
    void upgradePreservesHibernateCreatedRefundTableColumnsAndRows() throws SQLException {
        migrateAndSeedV8();
        execute("""
                ALTER TABLE sale_items ADD COLUMN stock_deducted BOOLEAN;
                UPDATE sale_items SET stock_deducted = true WHERE id = 1;
                ALTER TABLE debts ADD COLUMN voided_at TIMESTAMPTZ, ADD COLUMN cancelled_vnd BIGINT;
                ALTER TABLE debts ADD CONSTRAINT debts_status_check CHECK (status IN ('OPEN', 'SETTLED'));
                """);
        createLocalRefundTable();
        execute("""
                INSERT INTO sale_refunds (sale_id, amount_vnd, refund_method, refunded_by_user_id, refunded_at)
                VALUES (1, 40000, 'CASH', 1, TIMESTAMPTZ '2026-09-02T10:00:00Z');
                """);

        assertThat(flyway(null).migrate().migrationsExecuted).isEqualTo(3);
        validateEntitySchema();
        assertThat(scalar("SELECT stock_deducted FROM sale_items WHERE id = 1")).isEqualTo("t");
        assertThat(scalar("SELECT amount_vnd FROM sale_refunds WHERE sale_id = 1")).isEqualTo("40000");
        assertThat(scalar("SELECT refunded_at = TIMESTAMPTZ '2026-09-02T10:00:00Z' FROM sale_refunds WHERE sale_id = 1"))
                .isEqualTo("t");
        // The obsolete Hibernate enum check must no longer prevent VOIDED.
        execute("UPDATE debts SET status = 'VOIDED', outstanding_vnd = 0, voided_at = now(), cancelled_vnd = 60000 WHERE id = 1");
        assertThat(scalar("SELECT status FROM debts WHERE id = 1")).isEqualTo("VOIDED");
    }

    @Test
    void constraintsProtectRefundReferencesAmountsUniquenessAndDebtAudit() throws SQLException {
        migrateAndSeedV8();
        flyway(null).migrate();

        rejected("UPDATE debts SET status = 'VOIDED', outstanding_vnd = 0 WHERE id = 1",
                "23514", "ck_debts_lifecycle");
        rejected("UPDATE debts SET status = 'VOIDED', outstanding_vnd = 0, voided_at = now() WHERE id = 1",
                "23514", "ck_debts_lifecycle");
        rejected("UPDATE debts SET status = 'VOIDED', outstanding_vnd = 0, voided_at = now(), cancelled_vnd = 0 WHERE id = 1",
                "23514", "ck_debts_lifecycle");
        rejected("UPDATE debts SET status = 'VOIDED', outstanding_vnd = 0, voided_at = now(), cancelled_vnd = 60001 WHERE id = 1",
                "23514", "ck_debts_lifecycle");
        rejected("UPDATE debts SET cancelled_vnd = 1 WHERE id = 1", "23514", "ck_debts_lifecycle");
        rejected("UPDATE debts SET voided_at = now() WHERE id = 2", "23514", "ck_debts_lifecycle");
        rejected("UPDATE debts SET status = 'UNKNOWN' WHERE id = 1", "23514", "ck_debts_lifecycle");
        rejected(refundInsert(1, 0, "CASH", 1), "23514", "ck_sale_refunds_amount");
        rejected(refundInsert(1, -1, "CASH", 1), "23514", "ck_sale_refunds_amount");
        rejected(refundInsert(1, 40000, "CARD", 1), "23514", "ck_sale_refunds_method");
        rejected(refundInsert(999, 40000, "CASH", 1), "23503", "fk_sale_refunds_sale");
        rejected(refundInsert(1, 40000, "CASH", 999), "23503", "fk_sale_refunds_user");

        execute(refundInsert(1, 40000, "CASH", 1));
        rejected(refundInsert(1, 40000, "TRANSFER", 1), "23505", "uq_sale_refunds_sale_id");
        execute(refundInsert(2, 100000, "TRANSFER", 1));
        rejected("DELETE FROM sales WHERE id = 2", "23503", "fk_sale_refunds_sale");
        execute("UPDATE debts SET status = 'VOIDED', outstanding_vnd = 0, voided_at = now(), cancelled_vnd = 60000 WHERE id = 1");
        assertThat(scalar("SELECT cancelled_vnd FROM debts WHERE id = 1")).isEqualTo("60000");
        assertThat(scalar("SELECT status FROM debts WHERE id = 2")).isEqualTo("SETTLED");
        assertThat(scalar("SELECT amount_vnd FROM payments WHERE id = 1")).isEqualTo("40000");
    }

    @Test
    void invalidLocalRefundStopsMigrationAndRollsBackSchemaChangesWithoutDeletingRows() throws SQLException {
        migrateAndSeedV8();
        createLocalRefundTable();
        execute(refundInsert(999, 40000, "CASH", 1));

        assertThatThrownBy(() -> flyway(null).migrate()).isInstanceOf(FlywayException.class);
        assertThat(scalar("SELECT count(*) FROM sale_refunds WHERE sale_id = 999")).isEqualTo("1");
        assertThat(scalar("SELECT count(*) FROM information_schema.columns WHERE table_schema = '" + schema
                + "' AND table_name = 'debts' AND column_name = 'cancelled_vnd'")).isEqualTo("0");
        assertThat(scalar("SELECT max(version::integer) FROM flyway_schema_history WHERE success AND version IS NOT NULL"))
                .isEqualTo("8");
        // Correct the test row explicitly, then retry without Flyway repair.
        execute("UPDATE sale_refunds SET sale_id = 1 WHERE sale_id = 999");
        assertThat(flyway(null).migrate().migrationsExecuted).isEqualTo(3);
    }

    @Test
    void legacyVoidedDebtWithoutAuditIsNotSilentlyReconstructed() throws SQLException {
        migrateAndSeedV8();
        execute("""
                ALTER TABLE debts DROP CONSTRAINT ck_debts_lifecycle;
                ALTER TABLE debts ADD CONSTRAINT ck_debts_lifecycle CHECK (status IN ('OPEN', 'SETTLED', 'VOIDED'));
                UPDATE debts SET status = 'VOIDED', outstanding_vnd = 0 WHERE id = 1;
                """);

        assertThatThrownBy(() -> flyway(null).migrate()).isInstanceOf(FlywayException.class);
        assertThat(scalar("SELECT status || ':' || outstanding_vnd FROM debts WHERE id = 1"))
                .isEqualTo("VOIDED:0");
        assertThat(scalar("SELECT count(*) FROM information_schema.columns WHERE table_schema = '" + schema
                + "' AND table_name = 'debts' AND column_name = 'voided_at'")).isEqualTo("0");
    }

    @Test
    void v10PreservesHibernateAuditRowsAndBlocksAllMutationPaths() throws SQLException {
        migrateAndSeedV8();
        flyway("9").migrate();
        createHibernateAuditTable();
        execute(auditInsert("'{}'::jsonb"));
        String original = scalar("SELECT row_to_json(a)::text FROM audit_logs a");
        assertThat(flyway("10").migrate().migrationsExecuted).isEqualTo(1);
        validateEntitySchema();
        assertThat(scalar("SELECT row_to_json(a)::text FROM audit_logs a")).isEqualTo(original);
        rejected("UPDATE audit_logs SET reason = 'Changed'", "55000", "append-only");
        rejected("DELETE FROM audit_logs", "55000", "append-only");
        rejected("TRUNCATE audit_logs", "55000", "append-only");
        assertThat(scalar("SELECT row_to_json(a)::text FROM audit_logs a")).isEqualTo(original);
        execute(auditInsert("'{}'::jsonb"));
        assertThat(scalar("SELECT count(distinct id) FROM audit_logs")).isEqualTo("2");
        assertThat(scalar("SELECT count(*) FROM pg_indexes WHERE schemaname = '" + schema
                + "' AND indexname IN ('idx_audit_logs_shop_time', 'idx_audit_logs_entity', 'idx_audit_logs_actor')"))
                .isEqualTo("3");
        assertThat(flyway("10").migrate().migrationsExecuted).isZero();
    }

    @Test
    void v10AcceptsCommittedBusinessActionsAndRejectsUnmigratedAdminReads() throws SQLException {
        migrateAndSeedV8();
        flyway("10").migrate();
        String valid = auditInsert("'{}'::jsonb");
        rejected(valid.replace("1, 'OWNER', 1", "999, 'OWNER', 1"), "23503", "fk_audit_logs_actor");
        rejected(valid.replace("1, 'OWNER', 1", "1, 'OWNER', 999"), "23503", "fk_audit_logs_shop");
        rejected(valid.replace("'OWNER'", "'OTHER'"), "23514", "ck_audit_logs_actor_role");
        rejected(valid.replace("'SUCCESS'", "'FAILURE'"), "23514", "ck_audit_logs_outcome");
        rejected(valid.replace("'SHOP_UPDATED'", "'UNKNOWN'"), "23514", "ck_audit_logs_action_target");
        rejected(valid.replace("'SHOP', 1", "'DEBT', 1"), "23514", "ck_audit_logs_action_target");
        rejected(valid.replace("'SHOP', 1", "'SHOP', 0"), "23514", "ck_audit_logs_ids");
        rejected(valid.replace("'00000000-0000-0000-0000-000000000001'", "'untrusted-id'"),
                "23514", "ck_audit_logs_request_id");
        rejected(auditInsert("'[]'::jsonb"), "23514", "ck_audit_logs_metadata");
        rejected(auditInsert("'null'::jsonb"), "23514", "ck_audit_logs_metadata");
        rejected(auditInsert("NULL"), "23502", "metadata");
        assertThat(scalar("SELECT count(*) FROM audit_logs")).isEqualTo("0");
        for (AuditAction action : AuditAction.values()) {
            String statement = valid.replace("'SHOP_UPDATED'", "'" + action.name() + "'")
                    .replace("'SHOP', 1", "'" + action.entityType() + "', 1");
            if (action.isAdminRead()) {
                // V10 remains immutable; V11 extends its whitelist separately.
                rejected(statement.replace("'OWNER'", "'ADMIN'"), "23514", "ck_audit_logs_action_target");
            } else {
                execute(statement);
            }
        }
        assertThat(scalar("SELECT count(*) FROM audit_logs")).isEqualTo(Long.toString(
                java.util.Arrays.stream(AuditAction.values()).filter(action -> !action.isAdminRead()).count()));
    }

    @Test
    void v10InvalidExistingAuditDataRollsBackWithoutDeletingAndCanBeRetried() throws SQLException {
        migrateAndSeedV8();
        flyway("9").migrate();
        createHibernateAuditTable();
        execute(auditInsert("'[]'::jsonb"));
        assertThatThrownBy(() -> flyway("10").migrate()).isInstanceOf(FlywayException.class);
        assertThat(scalar("SELECT metadata::text FROM audit_logs")).isEqualTo("[]");
        assertThat(scalar("SELECT max(version::integer) FROM flyway_schema_history WHERE success AND version IS NOT NULL"))
                .isEqualTo("9");
        assertThat(scalar("SELECT count(*) FROM pg_constraint WHERE conrelid = 'audit_logs'::regclass AND conname = 'fk_audit_logs_actor'"))
                .isEqualTo("0");
        // Only this isolated fixture is explicitly corrected; migration never repairs data itself.
        execute("UPDATE audit_logs SET metadata = '{}'::jsonb");
        assertThat(flyway("10").migrate().migrationsExecuted).isEqualTo(1);
        assertThat(scalar("SELECT count(*) FROM audit_logs")).isEqualTo("1");
        rejected("DELETE FROM audit_logs", "55000", "append-only");
        validateEntitySchema();
    }

    @Test
    void v11PreservesV10HistorySupportsAllActionsAndKeepsAppendOnlyGuards() throws SQLException {
        migrateAndSeedV8();
        flyway("10").migrate();
        execute(auditInsert("'{}'::jsonb"));
        execute("ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check CHECK (action = 'SHOP_UPDATED')");
        String before = scalar("SELECT row_to_json(a)::text FROM audit_logs a");

        assertThat(flyway(null).migrate().migrationsExecuted).isEqualTo(1);
        assertThat(scalar("SELECT row_to_json(a)::text FROM audit_logs a")).isEqualTo(before);
        assertThat(scalar("SELECT count(*) FROM pg_constraint WHERE conrelid='audit_logs'::regclass AND conname='audit_logs_action_check'"))
                .isEqualTo("0");
        for (AuditAction action : AuditAction.values()) {
            if (action.isAdminRead()) {
                execute(adminReadInsert(action));
            } else {
                execute(auditInsert("'{}'::jsonb").replace("'SHOP_UPDATED'", "'" + action.name() + "'")
                        .replace("'SHOP', 1", "'" + action.entityType() + "', 1"));
            }
        }
        assertThat(scalar("SELECT count(*) FROM audit_logs")).isEqualTo(Integer.toString(AuditAction.values().length + 1));
        assertThat(scalar("SELECT amount_vnd FROM payments WHERE id=1")).isEqualTo("40000");
        assertThat(scalar("SELECT outstanding_vnd FROM debts WHERE id=1")).isEqualTo("60000");
        assertThat(scalar("SELECT stock_quantity FROM products WHERE id=1")).isEqualTo("7.000");
        for (String mutation : new String[] {"UPDATE audit_logs SET reason='changed'", "DELETE FROM audit_logs", "TRUNCATE audit_logs"}) {
            rejected(mutation, "55000", "append-only");
        }
        assertThat(scalar("SELECT count(*) FROM information_schema.tables WHERE table_schema='" + schema + "' AND table_name='admin_access_logs'"))
                .isEqualTo("0");
        validateEntitySchema();
        assertThat(flyway(null).migrate().migrationsExecuted).isZero();
        assertThat(flyway(null).validateWithResult().validationSuccessful).isTrue();
    }

    @Test
    void v11RejectsUnscopedBusinessWrongAdminRolesAndWrongTargets() throws SQLException {
        migrateAndSeedV8();
        flyway(null).migrate();
        String business = auditInsert("'{}'::jsonb");
        rejected(business.replace("1, 'OWNER', 1", "1, 'OWNER', NULL"), "23514", "ck_audit_logs_action_target");
        rejected(business.replace("'SHOP', 1", "'SHOP', NULL"), "23514", "ck_audit_logs_action_target");
        String overview = adminReadInsert(AuditAction.ADMIN_OVERVIEW_VIEWED);
        rejected(overview.replace("'ADMIN'", "'OWNER'"), "23514", "ck_audit_logs_action_target");
        rejected(overview.replace("'SYSTEM'", "'SHOP'"), "23514", "ck_audit_logs_action_target");
        rejected(overview.replace("1, 'ADMIN', NULL", "1, 'ADMIN', 1"), "23514", "ck_audit_logs_action_target");
        rejected(overview.replace("'SUCCESS'", "'FAILURE'"), "23514", "ck_audit_logs_outcome");
        rejected(overview.replace("'ADMIN_OVERVIEW_VIEWED'", "'ADMIN_UNKNOWN'"), "23514", "ck_audit_logs_action_target");
        String owner = adminReadInsert(AuditAction.ADMIN_OWNER_VIEWED);
        rejected(owner.replace("'OWNER', 1", "'OWNER', NULL"), "23514", "ck_audit_logs_action_target");
        rejected(owner.replace("'OWNER', 1", "'OWNER', 0"), "23514", "ck_audit_logs_ids");
        String shop = adminReadInsert(AuditAction.ADMIN_SHOP_VIEWED);
        rejected(shop.replace("'SHOP', 1", "'SHOP', 2"), "23514", "ck_audit_logs_action_target");
        rejected(shop.replace("1, 'ADMIN', 1", "1, 'ADMIN', NULL"), "23514", "ck_audit_logs_action_target");
        rejected(shop.replace("1, 'ADMIN', 1", "1, 'ADMIN', 999").replace("'SHOP', 1", "'SHOP', 999"),
                "23503", "fk_audit_logs_shop");
        rejected(overview.replace("1, 'ADMIN', NULL", "999, 'ADMIN', NULL"), "23503", "fk_audit_logs_actor");
        rejected(overview.replace("'{}'::jsonb", "'[]'::jsonb"), "23514", "ck_audit_logs_metadata");
        assertThat(scalar("SELECT count(*) FROM audit_logs")).isEqualTo("0");
    }

    @Test
    void v11CanAdoptManuallyAdjustedV10ConstraintsWithoutLosingAdminHistory() throws Exception {
        migrateAndSeedV8();
        flyway("10").migrate();
        execute(auditInsert("'{}'::jsonb"));
        var sql = new ClassPathResource("db/migration/V11__extend_audit_logs_for_admin_dashboard.sql")
                .getContentAsString(StandardCharsets.UTF_8);
        try (var connection = scopedConnection(); var statement = connection.createStatement()) {
            connection.setAutoCommit(false);
            statement.execute(sql);
            connection.commit();
        }
        execute(adminReadInsert(AuditAction.ADMIN_OVERVIEW_VIEWED));
        String before = scalar("SELECT json_agg(a ORDER BY id)::text FROM audit_logs a");
        assertThat(scalar("SELECT max(version::integer) FROM flyway_schema_history WHERE success AND version IS NOT NULL")).isEqualTo("10");
        assertThat(flyway(null).migrate().migrationsExecuted).isEqualTo(1);
        assertThat(scalar("SELECT json_agg(a ORDER BY id)::text FROM audit_logs a")).isEqualTo(before);
        assertThat(flyway(null).migrate().migrationsExecuted).isZero();
    }

    @Test
    void v11InvalidExistingAdminEventRollsBackWithoutErasingHistory() throws SQLException {
        migrateAndSeedV8();
        flyway("10").migrate();
        execute("""
                ALTER TABLE audit_logs ALTER COLUMN shop_id DROP NOT NULL;
                ALTER TABLE audit_logs ALTER COLUMN entity_id DROP NOT NULL;
                ALTER TABLE audit_logs DROP CONSTRAINT ck_audit_logs_action_target;
                """);
        execute(adminReadInsert(AuditAction.ADMIN_OVERVIEW_VIEWED).replace("'ADMIN'", "'OWNER'"));
        String before = scalar("SELECT row_to_json(a)::text FROM audit_logs a");
        String idsBefore = scalar("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='audit_logs'::regclass AND conname='ck_audit_logs_ids'");

        assertThatThrownBy(() -> flyway(null).migrate()).isInstanceOf(FlywayException.class);
        assertThat(scalar("SELECT row_to_json(a)::text FROM audit_logs a")).isEqualTo(before);
        assertThat(scalar("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='audit_logs'::regclass AND conname='ck_audit_logs_ids'"))
                .isEqualTo(idsBefore);
        assertThat(scalar("SELECT count(*) FROM pg_constraint WHERE conrelid='audit_logs'::regclass AND conname='ck_audit_logs_action_target'"))
                .isEqualTo("0");
        assertThat(scalar("SELECT max(version::integer) FROM flyway_schema_history WHERE success AND version IS NOT NULL")).isEqualTo("10");
        rejected("DELETE FROM audit_logs", "55000", "append-only");
    }

    private String adminReadInsert(AuditAction action) {
        boolean shop = action == AuditAction.ADMIN_SHOP_VIEWED || action == AuditAction.ADMIN_SHOP_STATUS_HISTORY_VIEWED;
        boolean target = shop || action == AuditAction.ADMIN_OWNER_VIEWED;
        return "INSERT INTO audit_logs (actor_user_id, actor_role, shop_id, action, entity_type, entity_id, outcome, request_id, metadata) VALUES (1, 'ADMIN', "
                + (shop ? "1" : "NULL") + ", '" + action.name() + "', '" + action.entityType() + "', "
                + (target ? "1" : "NULL") + ", 'SUCCESS', '" + UUID.randomUUID() + "', '{}'::jsonb)";
    }

    private String auditInsert(String metadata) {
        return "INSERT INTO audit_logs (actor_user_id, actor_role, shop_id, action, entity_type, entity_id, outcome, "
                + "request_id, metadata, created_at) VALUES (1, 'OWNER', 1, 'SHOP_UPDATED', 'SHOP', 1, 'SUCCESS', "
                + "'00000000-0000-0000-0000-000000000001', " + metadata + ", TIMESTAMPTZ '2026-10-01T10:00:00Z')";
    }

    private void createHibernateAuditTable() {
        var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
        var properties = new Properties();
        properties.setProperty("currentSchema", schema);
        source.setConnectionProperties(properties);
        var registry = new StandardServiceRegistryBuilder()
                .applySetting("hibernate.connection.datasource", source)
                .applySetting("hibernate.default_schema", schema)
                .applySetting("hibernate.hbm2ddl.auto", "update").build();
        try {
            try (var factory = new MetadataSources(registry).addAnnotatedClass(AuditLog.class)
                    .buildMetadata().buildSessionFactory()) {
                assertThat(factory.isOpen()).isTrue();
            }
        } finally { StandardServiceRegistryBuilder.destroy(registry); }
    }

    private void migrateAndSeedV8() throws SQLException {
        assertThat(flyway("8").migrate().migrationsExecuted).isEqualTo(8);
        execute("""
                INSERT INTO users (id, display_name) VALUES (1, 'Migration owner');
                INSERT INTO shops (id, owner_id, name, industry) VALUES (1, 1, 'Test shop', 'Retail');
                INSERT INTO customers (id, shop_id, name) VALUES (1, 1, 'Test customer');
                INSERT INTO products (id, shop_id, name, unit, selling_price_vnd, tracked, stock_quantity)
                    VALUES (1, 1, 'Test item', 'piece', 50000, true, 7);
                INSERT INTO sales (id, shop_id, created_by_user_id, customer_id, subtotal_vnd, total_vnd, paid_vnd, payment_status)
                    VALUES (1, 1, 1, 1, 100000, 100000, 40000, 'PARTIAL'),
                           (2, 1, 1, 1, 100000, 100000, 100000, 'PAID'),
                           (3, 1, 1, 1, 100000, 100000, 100000, 'PAID');
                INSERT INTO debts (id, sale_id, customer_id, original_vnd, outstanding_vnd, status, settled_at)
                    VALUES (1, 1, 1, 60000, 60000, 'OPEN', NULL),
                           (2, 3, 1, 60000, 0, 'SETTLED', TIMESTAMPTZ '2026-09-01T10:00:00Z');
                INSERT INTO sale_items (id, sale_id, product_id, product_name_snapshot, unit_snapshot, quantity, unit_price_vnd, line_total_vnd)
                    VALUES (1, 1, 1, 'Test item', 'piece', 2, 50000, 100000),
                           (2, 3, NULL, 'Custom item', 'piece', 2, 50000, 100000);
                INSERT INTO payments (id, sale_id, amount_vnd, payment_method, type, received_by_user_id)
                    VALUES (1, 1, 40000, 'CASH', 'INITIAL', 1);
                """);
    }

    private void createLocalRefundTable() throws SQLException {
        execute("""
                CREATE TABLE sale_refunds (
                    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    sale_id BIGINT NOT NULL, amount_vnd BIGINT NOT NULL,
                    refund_method VARCHAR(20) NOT NULL, transfer_reference VARCHAR(255),
                    refunded_by_user_id BIGINT NOT NULL, refunded_at TIMESTAMPTZ NOT NULL,
                    CONSTRAINT uq_sale_refunds_sale_id UNIQUE (sale_id)
                );
                """);
    }

    private Flyway flyway(String target) {
        var config = Flyway.configure().dataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"))
                .schemas(schema).defaultSchema(schema).locations("classpath:db/migration");
        if (target != null) {
            config.target(target);
        }
        return config.load();
    }

    private void validateEntitySchema() {
        var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
        var properties = new Properties();
        properties.setProperty("currentSchema", schema);
        source.setConnectionProperties(properties);
        var registry = new StandardServiceRegistryBuilder()
                .applySetting("hibernate.connection.datasource", source)
                .applySetting("hibernate.default_schema", schema)
                .applySetting("hibernate.hbm2ddl.auto", "validate")
                .build();
        try {
            var metadata = new MetadataSources(registry);
            for (var entity : new Class<?>[] {AuditLog.class, AuthIdentity.class, Category.class, Customer.class, Debt.class,
                    Expense.class, Payment.class, Product.class, Sale.class, SaleDraft.class,
                    SaleDraftItem.class, SaleItem.class, SaleRefund.class, Shop.class, UserAccount.class}) {
                metadata.addAnnotatedClass(entity);
            }
            try (var factory = metadata.buildMetadata().buildSessionFactory()) {
                assertThat(factory.isOpen()).isTrue();
            }
        } finally {
            StandardServiceRegistryBuilder.destroy(registry);
        }
    }

    private void rejected(String sql, String sqlState, String constraint) {
        assertThatThrownBy(() -> execute(sql)).isInstanceOfSatisfying(SQLException.class, exception -> {
            assertThat(exception.getSQLState()).isEqualTo(sqlState);
            assertThat(exception.getMessage()).contains(constraint);
        });
    }

    private String refundInsert(long saleId, long amount, String method, long userId) {
        return "INSERT INTO sale_refunds (sale_id, amount_vnd, refund_method, refunded_by_user_id, refunded_at) VALUES ("
                + saleId + ", " + amount + ", '" + method + "', " + userId + ", now())";
    }

    private void execute(String sql) throws SQLException {
        try (var connection = scopedConnection(); var statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }

    private String scalar(String sql) throws SQLException {
        try (var connection = scopedConnection(); var statement = connection.createStatement();
                var result = statement.executeQuery(sql)) {
            assertThat(result.next()).isTrue();
            return result.getString(1);
        }
    }

    private Connection scopedConnection() throws SQLException {
        var connection = rawConnection();
        try (var statement = connection.createStatement()) {
            statement.execute("SET search_path TO \"" + schema + "\"");
        } catch (SQLException exception) {
            connection.close();
            throw exception;
        }
        return connection;
    }

    private Connection rawConnection() throws SQLException {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }
}
