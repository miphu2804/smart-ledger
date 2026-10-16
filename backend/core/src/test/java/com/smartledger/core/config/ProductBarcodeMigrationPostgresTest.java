package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Tests V16 only in generated PostgreSQL schemas, including competing writers. */
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
class ProductBarcodeMigrationPostgresTest {
    private String schema;

    @BeforeEach
    void createSchema() throws SQLException {
        schema = "core_barcode_migration_test_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = rawConnection(); var statement = connection.createStatement()) {
            statement.execute("create schema \"" + schema + "\"");
        }
    }

    @AfterEach
    void removeOnlyGeneratedSchema() throws SQLException {
        if (schema != null && schema.matches("core_barcode_migration_test_[a-f0-9]{32}")) {
            try (var connection = rawConnection(); var statement = connection.createStatement()) {
                statement.execute("drop schema \"" + schema + "\" cascade");
            }
        }
    }

    @Test
    void freshMigrationInstallsValidPartialUniqueIndexAndRerunIsNoOp() throws SQLException {
        assertThat(flyway(null).migrate().migrationsExecuted).isEqualTo(16);
        assertThat(scalar("select indisunique and indisvalid from pg_index where indexrelid = "
                + "'uq_products_shop_barcode_active'::regclass")).isEqualTo("t");
        assertThat(scalar("select pg_get_expr(indpred, indrelid) from pg_index where indexrelid = "
                + "'uq_products_shop_barcode_active'::regclass")).contains("ACTIVE", "barcode IS NOT NULL");
        assertThat(scalar("select count(*) from pg_constraint where conrelid = 'products'::regclass "
                + "and conname = 'uq_products_shop_barcode'")).isEqualTo("0");
        assertThat(flyway(null).migrate().migrationsExecuted).isZero();
        assertThat(flyway(null).validateWithResult().validationSuccessful).isTrue();
    }

    @Test
    void upgradePreservesArchivedProductAndSaleDraftSnapshotsAndAllowsReuse() throws SQLException {
        seedV15();
        execute("""
                insert into products(id,shop_id,name,barcode,unit,selling_price_vnd,status,archived_at,archived_by_user_id)
                values (100,1,'Old product','ABC','piece',1000,'ARCHIVED',now(),1);
                insert into sales(id,shop_id,created_by_user_id,subtotal_vnd,total_vnd,paid_vnd,payment_status)
                values (1,1,1,1000,1000,1000,'PAID');
                insert into sale_items(sale_id,product_id,product_name_snapshot,unit_snapshot,quantity,unit_price_vnd,line_total_vnd)
                values (1,100,'Historical name','piece',1,1000,1000);
                insert into sale_drafts(id,shop_id,created_by_user_id,expires_at) values (1,1,1,now()+interval '1 day');
                insert into sale_draft_items(draft_id,product_id,product_name_snapshot,unit_snapshot,quantity,unit_price_vnd,line_total_vnd)
                values (1,100,'Draft name','piece',1,1000,1000);
                """);
        String before = scalar("select row_to_json(p)::text from products p where id=100");
        assertThat(flyway(null).migrate().migrationsExecuted).isEqualTo(1);
        execute(insert("ABC"));
        assertThat(scalar("select row_to_json(p)::text from products p where id=100")).isEqualTo(before);
        assertThat(scalar("select product_id || ':' || product_name_snapshot from sale_items"))
                .isEqualTo("100:Historical name");
        assertThat(scalar("select product_id || ':' || product_name_snapshot from sale_draft_items"))
                .isEqualTo("100:Draft name");
        assertThat(scalar("select paid_vnd from sales where id=1")).isEqualTo("1000");
        assertThat(scalar("select count(*) from products where shop_id=1 and barcode='ABC'")).isEqualTo("2");
    }

    @Test
    void uniqueGuardOnlyAppliesToNonNullActiveSameShopExactCodes() throws SQLException {
        seedV15();
        flyway(null).migrate();
        execute(insert("ABC"));
        rejected(insert("ABC"), "23505", "uq_products_shop_barcode_active");
        execute(insert("abc"));
        execute(insert("ABC").replace("(1,'Product'", "(2,'Product'"));
        execute(insert("ABC-123"));
        execute(insert("123"));
    }

    @Test
    void multipleArchivedAndNullCodesAreAllowedButReactivationCannotStealAnActiveCode() throws SQLException {
        seedV15();
        flyway(null).migrate();
        execute(insert("ABC"));
        for (int i = 0; i < 2; i++) {
            execute("insert into products(shop_id,name,barcode,unit,selling_price_vnd,status,archived_at,archived_by_user_id) "
                    + "values (1,'Old','ABC','piece',1000,'ARCHIVED',now(),1)");
            execute(insert("IGNORED").replace("'IGNORED'", "null"));
        }
        rejected("update products set status='ACTIVE',archived_at=null,archived_by_user_id=null where status='ARCHIVED'",
                "23505", "uq_products_shop_barcode_active");
        assertThat(scalar("select count(*) from products where status='ARCHIVED'")).isEqualTo("2");
    }

    @Test
    void failureDroppingOldConstraintRollsBackNewIndexAndLeavesOldGuardAndRowsIntact() throws SQLException {
        seedV15();
        execute(insert("ABC"));
        execute("create table dependent_codes(shop_id bigint,barcode varchar(100), "
                + "foreign key(shop_id,barcode) references products(shop_id,barcode))");
        assertThatThrownBy(() -> flyway(null).migrate()).isInstanceOf(FlywayException.class)
                .hasMessageContaining("uq_products_shop_barcode");
        assertThat(scalar("select max(version::int) from flyway_schema_history where success")).isEqualTo("15");
        assertThat(scalar("select to_regclass('uq_products_shop_barcode_active')")).isNull();
        rejected(insert("ABC"), "23505", "uq_products_shop_barcode");
        assertThat(scalar("select count(*) from products")).isEqualTo("1");
        execute("drop table dependent_codes"); // Synthetic dependency, only in this test schema.
        assertThat(flyway(null).migrate().migrationsExecuted).isEqualTo(1);
    }

    @Test
    void duplicateActiveLocalDriftStopsMigrationWithoutSilentlyRepairingRows() throws SQLException {
        seedV15();
        execute("alter table products drop constraint uq_products_shop_barcode");
        execute(insert("ABC"));
        execute(insert("ABC"));
        assertThatThrownBy(() -> flyway(null).migrate()).isInstanceOf(FlywayException.class)
                .hasMessageContaining("uq_products_shop_barcode_active");
        assertThat(scalar("select max(version::int) from flyway_schema_history where success")).isEqualTo("15");
        assertThat(scalar("select to_regclass('uq_products_shop_barcode_active')")).isNull();
        assertThat(scalar("select count(*) from products where status='ACTIVE' and barcode='ABC'")).isEqualTo("2");
    }

    @Test
    void concurrentCreatesThatBothPassPrecheckHaveOneWinner() throws Exception {
        seedV15();
        flyway(null).migrate();
        race(insert("RACE"), insert("RACE"));
        assertThat(scalar("select count(*) from products where status='ACTIVE' and barcode='RACE'")).isEqualTo("1");
    }

    @Test
    void concurrentPatchesOfDifferentProductsThatBothPassPrecheckHaveOneWinner() throws Exception {
        seedV15();
        flyway(null).migrate();
        execute(insert("FIRST"));
        execute(insert("SECOND"));
        race("update products set barcode='RACE' where barcode='FIRST'",
                "update products set barcode='RACE' where barcode='SECOND'");
        assertThat(scalar("select count(*) from products where status='ACTIVE' and barcode='RACE'")).isEqualTo("1");
        assertThat(scalar("select count(*) from products")).isEqualTo("2");
    }

    private void race(String first, String second) throws Exception {
        var barrier = new CountDownLatch(2);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var a = executor.submit(() -> competingWrite(first, barrier));
            var b = executor.submit(() -> competingWrite(second, barrier));
            assertThat(List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("COMMITTED", "23505");
        } finally {
            executor.shutdownNow();
            assertThat(executor.awaitTermination(10, TimeUnit.SECONDS)).isTrue();
        }
    }

    private String competingWrite(String sql, CountDownLatch barrier) throws Exception {
        try (var connection = scopedConnection(); var statement = connection.createStatement()) {
            connection.setAutoCommit(false);
            statement.execute("set local statement_timeout='10s'");
            try (var result = statement.executeQuery("select count(*) from products where shop_id=1 "
                    + "and status='ACTIVE' and barcode='RACE'")) {
                assertThat(result.next()).isTrue();
                assertThat(result.getInt(1)).isZero();
            }
            barrier.countDown();
            if (!barrier.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Competing writer did not reach precheck");
            }
            try {
                statement.executeUpdate(sql);
                connection.commit();
                return "COMMITTED";
            } catch (SQLException error) {
                connection.rollback();
                assertThat(error.getMessage()).contains("uq_products_shop_barcode_active");
                return error.getSQLState();
            }
        }
    }

    private void seedV15() throws SQLException {
        flyway("15").migrate();
        execute("insert into users(id,display_name) values (1,'Owner'); "
                + "insert into shops(id,owner_id,name,industry) values (1,1,'One','Retail'),(2,1,'Two','Retail')");
    }

    private String insert(String code) {
        return "insert into products(shop_id,name,barcode,unit,selling_price_vnd) "
                + "values (1,'Product','" + code + "','piece',1000)";
    }

    private Flyway flyway(String target) {
        var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
        var properties = new Properties();
        properties.setProperty("currentSchema", schema);
        source.setConnectionProperties(properties);
        var configuration = Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema)
                // This suite exercises V16; ZaloMigrationPostgresTest exercises the V17 upgrade separately.
                .locations("classpath:db/migration").target("16");
        if (target != null) {
            configuration.target(target);
        }
        return configuration.load();
    }

    private void rejected(String sql, String state, String constraint) {
        assertThatThrownBy(() -> execute(sql)).isInstanceOfSatisfying(SQLException.class, error -> {
            assertThat(error.getSQLState()).isEqualTo(state);
            assertThat(error.getMessage()).contains(constraint);
        });
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
            statement.execute("set search_path to \"" + schema + "\"");
        } catch (SQLException error) {
            connection.close();
            throw error;
        }
        return connection;
    }

    private Connection rawConnection() throws SQLException {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }
}
