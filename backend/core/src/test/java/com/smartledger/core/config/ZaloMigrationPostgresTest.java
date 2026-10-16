package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.DriverManager;
import java.util.Properties;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Fresh, upgrade and transactional failure checks against disposable UUID-named schemas only. */
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
class ZaloMigrationPostgresTest {
    private String schema;
    private DriverManagerDataSource source;
    private JdbcTemplate jdbc;

    @BeforeEach
    void createSchema() throws Exception {
        schema = "core_zalo_migration_test_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = connection(); var statement = connection.createStatement()) {
            statement.execute("create schema \"" + schema + "\"");
        }
        source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
        var settings = new Properties();
        settings.setProperty("currentSchema", schema);
        source.setConnectionProperties(settings);
        jdbc = new JdbcTemplate(source);
    }

    @AfterEach
    void cleanup() throws Exception {
        if (schema != null && schema.matches("core_zalo_migration_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("drop schema \"" + schema + "\" cascade");
            }
        }
    }

    @Test
    void freshMigrationCreatesBothStoresAndExpiryIndexWithoutCoreProfileForeignKey() {
        flyway(null).migrate();
        assertThat(jdbc.queryForObject("select version from flyway_schema_history where version='17' and success", String.class)).isEqualTo("17");
        assertThat(jdbc.queryForObject("select count(*) from information_schema.tables where table_schema=? and table_name in ('external_auth_identities','oauth_login_sessions')",
                Integer.class, schema)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from pg_indexes where schemaname=? and indexname='ix_oauth_login_sessions_expires_at'",
                Integer.class, schema)).isEqualTo(1);
        assertThat(jdbc.queryForObject("""
                select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
                where n.nspname=? and c.relname in ('external_auth_identities','oauth_login_sessions') and c.relrowsecurity
                """, Integer.class, schema)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from pg_policies where schemaname=? and tablename in ('external_auth_identities','oauth_login_sessions')",
                Integer.class, schema)).isZero();
        identity("app-a", "subject-a", "not-yet-a-firebase-or-core-user");
        assertThat(jdbc.queryForObject("select count(*) from users", Integer.class)).isZero();
    }

    @Test
    void upgradeFromV16PreservesExistingOwnerIdentityShopAndCreatesNoMappings() {
        flyway("16").migrate();
        long owner = jdbc.queryForObject("insert into users(display_name) values ('Existing owner') returning id", Long.class);
        jdbc.update("insert into auth_identities(user_id,provider_subject) values (?, 'existing-firebase-uid')", owner);
        long shop = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Existing shop','Retail') returning id", Long.class, owner);
        var beforeOwner = jdbc.queryForMap("select * from users where id=?", owner);
        var beforeIdentity = jdbc.queryForMap("select * from auth_identities where user_id=?", owner);
        var beforeShop = jdbc.queryForMap("select * from shops where id=?", shop);
        flyway(null).migrate();
        assertThat(jdbc.queryForMap("select * from users where id=?", owner)).isEqualTo(beforeOwner);
        assertThat(jdbc.queryForMap("select * from auth_identities where user_id=?", owner)).isEqualTo(beforeIdentity);
        assertThat(jdbc.queryForMap("select * from shops where id=?", shop)).isEqualTo(beforeShop);
        assertThat(jdbc.queryForObject("select count(*) from external_auth_identities", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from oauth_login_sessions", Integer.class)).isZero();
    }

    @Test
    void migrationFailureRollsBackNewTableAndHistoryWithoutAdoptingUnexpectedTables() {
        flyway("16").migrate();
        jdbc.execute("create table oauth_login_sessions(marker text)");
        jdbc.update("insert into oauth_login_sessions values ('keep-this-unexpected-table')");
        assertThatThrownBy(() -> flyway(null).migrate()).isInstanceOf(RuntimeException.class);
        assertThat(jdbc.queryForObject("select to_regclass('external_auth_identities') is null", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version='17'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select marker from oauth_login_sessions", String.class)).isEqualTo("keep-this-unexpected-table");
        // Only this generated test schema is touched; simulate removing the intentional collision and retry.
        jdbc.execute("drop table oauth_login_sessions");
        assertThat(flyway(null).migrate().migrationsExecuted).isEqualTo(1);
    }

    @Test
    void rerunIsNoOpAndProviderAppScopeUniquenessPreservesCanonicalUid() {
        flyway(null).migrate();
        identity("app-a", "subject-a", "canonical-uid");
        identity("app-b", "subject-a", "other-uid");
        identity("app-a", "subject-b", "canonical-uid");
        assertThatThrownBy(() -> identity("app-a", "subject-a", "must-not-reassign"))
                .isInstanceOf(DataIntegrityViolationException.class);
        var before = jdbc.queryForList("select * from external_auth_identities order by provider_app_id,provider_subject");
        assertThat(flyway(null).migrate().migrationsExecuted).isZero();
        flyway(null).validate();
        assertThat(jdbc.queryForList("select * from external_auth_identities order by provider_app_id,provider_subject")).isEqualTo(before);
    }

    @Test
    void nonOwnerRolesCannotReadOrInsertEvenWithBroadTablePrivileges() throws Exception {
        flyway(null).migrate();
        identity("app-a", "private-subject", "private-uid");
        jdbc.update("""
                insert into oauth_login_sessions(id,state_hash,browser_binding_hash,purpose,client_origin,
                  client_request_id,client_challenge,verifier_ciphertext,status,created_at,expires_at,provider_app_id)
                values (?,'private-state','binding','LOGIN','https://app.example.test','request','challenge',
                  'cipher','PENDING',now(),now()+interval '5 minutes','app-a')
                """, UUID.randomUUID());
        try (var connection = source.getConnection(); var statement = connection.createStatement()) {
            connection.setAutoCommit(false);
            // PostgreSQL's predefined read/write roles have broad table grants but do not bypass RLS.
            // Disposable CI PostgreSQL uses its initialization owner, which may SET ROLE for this check.
            statement.execute("set local role pg_read_all_data");
            try (var rows = statement.executeQuery("select count(*) from external_auth_identities")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getInt(1)).isZero();
            }
            try (var rows = statement.executeQuery("select count(*) from oauth_login_sessions")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getInt(1)).isZero();
            }
            statement.execute("set local role pg_write_all_data");
            assertThat(statement.executeUpdate("delete from external_auth_identities")).isZero();
            assertThat(statement.executeUpdate("delete from oauth_login_sessions")).isZero();
            assertThatThrownBy(() -> statement.executeUpdate(
                    "insert into external_auth_identities values ('ZALO','attacker','subject','uid',now(),now())"))
                    .isInstanceOfSatisfying(java.sql.SQLException.class,
                            failure -> {
                                assertThat(failure.getSQLState()).isEqualTo("42501");
                                assertThat(failure.getMessage()).contains("row-level security");
                            });
            connection.rollback();
        }
        assertThat(jdbc.queryForObject("select count(*) from external_auth_identities", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from oauth_login_sessions", Integer.class)).isEqualTo(1);
    }

    @Test
    void databaseRejectsInvalidSessionLifecycleAndDuplicateHandoffProof() {
        flyway(null).migrate();
        String sql = """
                insert into oauth_login_sessions(id,state_hash,browser_binding_hash,purpose,client_origin,
                  client_request_id,client_challenge,verifier_ciphertext,status,provider_subject,proof_hash,
                  created_at,expires_at,proof_expires_at,provider_app_id)
                values (?,?,'binding','LOGIN','https://app.example.test','request','challenge',?, ?, ?, ?,
                  timestamptz '2026-10-16 10:00:00+00',timestamptz '2026-10-16 10:05:00+00',?, 'app-a')
                """;
        assertThatThrownBy(() -> jdbc.update(sql, UUID.randomUUID(), "pending-no-verifier", null, "PENDING", null, null, null))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(sql, UUID.randomUUID(), "verified-no-proof", null, "VERIFIED", "subject", null, null))
                .isInstanceOf(DataIntegrityViolationException.class);
        var expiry = java.time.OffsetDateTime.parse("2026-10-16T10:01:00Z");
        jdbc.update(sql, UUID.randomUUID(), "valid-state", null, "VERIFIED", "subject", "unique-proof", expiry);
        assertThatThrownBy(() -> jdbc.update(sql, UUID.randomUUID(), "other-state", null, "VERIFIED", "subject", "unique-proof", expiry))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(sql, UUID.randomUUID(), "expired-proof", null, "VERIFIED", "subject", "different-proof", expiry.plusHours(1)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private void identity(String app, String subject, String uid) {
        jdbc.update("insert into external_auth_identities values ('ZALO',?,?,?,now(),now())", app, subject, uid);
    }

    private Flyway flyway(String target) {
        var config = Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).cleanDisabled(true);
        if (target != null) config.target(target);
        return config.load();
    }

    private static java.sql.Connection connection() throws Exception {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }
}
