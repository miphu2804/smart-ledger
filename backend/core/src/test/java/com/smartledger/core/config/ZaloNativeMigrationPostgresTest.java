package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.DriverManager;
import java.time.OffsetDateTime;
import java.util.List;
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

/** Actual Flyway V18, committed transactions and generated schemas in a disposable PostgreSQL only. */
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
class ZaloNativeMigrationPostgresTest {
    private String schema;
    private DriverManagerDataSource source;
    private JdbcTemplate jdbc;

    @BeforeEach
    void createSchema() throws Exception {
        schema = "core_zalo_v18_test_" + UUID.randomUUID().toString().replace("-", "");
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
        if (schema != null && schema.matches("core_zalo_v18_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("drop schema \"" + schema + "\" cascade");
            }
        }
    }

    @Test
    void freshV18CreatesNativeColumnsAndRerunIsNoOp() {
        flyway("18").migrate();
        assertThat(jdbc.queryForObject("select max(version::integer) from flyway_schema_history where success", Integer.class)).isEqualTo(18);
        assertThat(jdbc.queryForObject("""
                select count(*) from information_schema.columns where table_schema=? and table_name='oauth_login_sessions'
                  and column_name in ('client_type','native_client_id','return_target_id','handoff_reference_hash','handoff_expires_at')
                """, Integer.class, schema)).isEqualTo(5);
        assertThat(jdbc.queryForObject("select is_nullable from information_schema.columns where table_schema=? and table_name='oauth_login_sessions' and column_name='client_origin'",
                String.class, schema)).isEqualTo("YES");
        assertThat(jdbc.queryForObject("select count(*) from pg_indexes where schemaname=? and indexname='uq_oauth_login_sessions_handoff_reference'", Integer.class, schema)).isEqualTo(1);
        UUID web = webSession("PENDING");
        assertThat(jdbc.queryForObject("select client_type from oauth_login_sessions where id=?", String.class, web)).isEqualTo("WEB");
        nativeSession("unique-reference");
        var before = jdbc.queryForList("select * from oauth_login_sessions order by id");
        assertThat(flyway("18").migrate().migrationsExecuted).isZero();
        flyway("18").validate();
        assertThat(jdbc.queryForList("select * from oauth_login_sessions order by id")).isEqualTo(before);
    }

    @Test
    void upgradeFromV17PreservesWebSessionsMappingsAndBusinessData() {
        flyway("17").migrate();
        long owner = jdbc.queryForObject("insert into users(display_name) values ('Existing owner') returning id", Long.class);
        jdbc.update("insert into auth_identities(user_id,provider_subject) values (?, 'existing-firebase-uid')", owner);
        jdbc.update("insert into shops(owner_id,name,industry) values (?,'Existing shop','Retail')", owner);
        jdbc.update("insert into external_auth_identities values ('ZALO','app','subject','existing-firebase-uid',now(),now())");
        for (String status : List.of("PENDING", "EXCHANGING", "VERIFIED", "CONSUMED", "FAILED")) webSession(status);
        var sessions = jdbc.queryForList("select to_jsonb(s)::text as snapshot from oauth_login_sessions s order by id");
        var users = jdbc.queryForList("select * from users");
        var identities = jdbc.queryForList("select * from auth_identities");
        var shops = jdbc.queryForList("select * from shops");
        var mappings = jdbc.queryForList("select * from external_auth_identities");
        assertThat(flyway("18").migrate().migrationsExecuted).isEqualTo(1);
        assertThat(jdbc.queryForList("""
                select (to_jsonb(s)-'client_type'-'native_client_id'-'return_target_id'-'handoff_reference_hash'-'handoff_expires_at')::text as snapshot
                from oauth_login_sessions s order by id
                """)).isEqualTo(sessions);
        assertThat(jdbc.queryForObject("select count(*) from oauth_login_sessions where client_type='WEB' and native_client_id is null and handoff_reference_hash is null", Integer.class)).isEqualTo(5);
        assertThat(jdbc.queryForList("select * from users")).isEqualTo(users);
        assertThat(jdbc.queryForList("select * from auth_identities")).isEqualTo(identities);
        assertThat(jdbc.queryForList("select * from shops")).isEqualTo(shops);
        assertThat(jdbc.queryForList("select * from external_auth_identities")).isEqualTo(mappings);
        // Existing web writer SQL omits all native columns and still verifies/consumes after upgrade.
        UUID pending = webSession("PENDING");
        assertThat(jdbc.update("update oauth_login_sessions set status='VERIFIED',provider_subject='subject',proof_hash=?,proof_expires_at=expires_at,verifier_ciphertext=null where id=?",
                UUID.randomUUID().toString(), pending)).isEqualTo(1);
        assertThat(jdbc.update("update oauth_login_sessions set status='CONSUMED',proof_hash=null,proof_expires_at=null,completed_at=now() where id=?", pending)).isEqualTo(1);
    }

    @Test
    void v18RejectsMixedChannelsDuplicateReferenceAndInvalidExpiry() {
        flyway("18").migrate();
        UUID nativeId = nativeSession("reference-a");
        assertThatThrownBy(() -> nativeSession("reference-a")).isInstanceOf(DataIntegrityViolationException.class);
        for (String update : List.of("client_type='OTHER'", "client_origin='https://evil.test'", "native_client_id=null",
                "return_target_id=null", "proof_hash='web-proof'", "proof_expires_at=expires_at",
                "handoff_reference_hash=null", "handoff_expires_at=null", "provider_subject=null",
                "handoff_expires_at=expires_at+interval '1 second'")) {
            // Fixed test-only SQL fragments, never caller input.
            assertThatThrownBy(() -> jdbc.update("update oauth_login_sessions set " + update + " where id=?", nativeId))
                    .as(update).isInstanceOf(DataIntegrityViolationException.class);
        }
        UUID web = webSession("PENDING");
        for (String update : List.of("client_origin=null", "native_client_id='android-staging'", "return_target_id='core-staging'",
                "handoff_reference_hash='native-reference'", "handoff_expires_at=expires_at",
                "status='VERIFIED',provider_subject='subject'")) {
            assertThatThrownBy(() -> jdbc.update("update oauth_login_sessions set " + update + " where id=?", web))
                    .as(update).isInstanceOf(DataIntegrityViolationException.class);
        }
    }

    @Test
    void earlyColumnCollisionRollsBackWithoutAdoptingUnexpectedSchema() {
        flyway("17").migrate();
        UUID web = webSession("PENDING");
        jdbc.execute("alter table oauth_login_sessions add column native_client_id text");
        jdbc.update("update oauth_login_sessions set native_client_id='unexpected-value'");
        assertThatThrownBy(() -> flyway("18").migrate()).isInstanceOf(RuntimeException.class);
        assertV18RolledBack();
        assertThat(jdbc.queryForObject("select native_client_id from oauth_login_sessions where id=?", String.class, web)).isEqualTo("unexpected-value");
        jdbc.execute("alter table oauth_login_sessions drop column native_client_id");
        assertThat(flyway("18").migrate().migrationsExecuted).isEqualTo(1);
    }

    @Test
    void lateConstraintCollisionRollsBackAllColumnsAndRetainsWebConstraint() {
        flyway("17").migrate();
        webSession("VERIFIED");
        var before = jdbc.queryForList("select * from oauth_login_sessions");
        jdbc.execute("alter table oauth_login_sessions add constraint ck_oauth_login_sessions_channel check (true)");
        assertThatThrownBy(() -> flyway("18").migrate()).isInstanceOf(RuntimeException.class);
        assertV18RolledBack();
        assertThat(jdbc.queryForList("select * from oauth_login_sessions")).isEqualTo(before);
        assertThat(jdbc.queryForObject("select is_nullable from information_schema.columns where table_schema=? and table_name='oauth_login_sessions' and column_name='client_origin'",
                String.class, schema)).isEqualTo("NO");
        assertThatThrownBy(() -> jdbc.update("update oauth_login_sessions set proof_hash=null")).isInstanceOf(DataIntegrityViolationException.class);
        jdbc.execute("alter table oauth_login_sessions drop constraint ck_oauth_login_sessions_channel");
        assertThat(flyway("18").migrate().migrationsExecuted).isEqualTo(1);
    }

    @Test
    void lockTimeoutLeavesV17UsableAndRetrySucceeds() throws Exception {
        flyway("17").migrate();
        webSession("PENDING");
        try (var blocker = source.getConnection(); var statement = blocker.createStatement()) {
            blocker.setAutoCommit(false);
            statement.execute("lock table oauth_login_sessions in access share mode");
            assertThatThrownBy(() -> flyway("18").migrate()).isInstanceOf(RuntimeException.class)
                    .hasStackTraceContaining("lock timeout");
            blocker.rollback();
        }
        assertV18RolledBack();
        assertThat(jdbc.queryForObject("select count(*) from oauth_login_sessions", Integer.class)).isEqualTo(1);
        assertThat(flyway("18").migrate().migrationsExecuted).isEqualTo(1);
    }

    @Test
    void nativeColumnsRetainRlsAndNoPublicPoliciesOrGrants() throws Exception {
        flyway("18").migrate();
        nativeSession("private-reference");
        assertThat(jdbc.queryForObject("select relrowsecurity from pg_class where oid='oauth_login_sessions'::regclass", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from pg_policies where schemaname=? and tablename='oauth_login_sessions'", Integer.class, schema)).isZero();
        assertThat(jdbc.queryForObject("""
                select count(*) from information_schema.table_privileges where table_schema=?
                  and table_name='oauth_login_sessions' and grantee in ('PUBLIC','anon','authenticated')
                """, Integer.class, schema)).isZero();
        try (var connection = source.getConnection(); var statement = connection.createStatement()) {
            connection.setAutoCommit(false);
            statement.execute("set local role pg_read_all_data");
            try (var rows = statement.executeQuery("select count(handoff_reference_hash) from oauth_login_sessions")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getInt(1)).isZero();
            }
            statement.execute("set local role pg_write_all_data");
            assertThat(statement.executeUpdate("update oauth_login_sessions set handoff_reference_hash=null")).isZero();
            assertThat(statement.executeUpdate("delete from oauth_login_sessions")).isZero();
            assertThatThrownBy(() -> statement.executeUpdate("""
                    insert into oauth_login_sessions(id,state_hash,browser_binding_hash,purpose,client_origin,client_request_id,
                      client_challenge,verifier_ciphertext,status,created_at,expires_at,provider_app_id)
                    values ('00000000-0000-0000-0000-000000000001','attacker','binding','LOGIN','https://app.example.test',
                      'request','challenge','cipher','PENDING',now(),now()+interval '5 minutes','app')
                    """)).isInstanceOfSatisfying(java.sql.SQLException.class,
                            failure -> assertThat(failure.getSQLState()).isEqualTo("42501"));
            connection.rollback();
        }
        assertThat(jdbc.queryForObject("select handoff_reference_hash from oauth_login_sessions", String.class)).isEqualTo("private-reference");
    }

    private void assertV18RolledBack() {
        assertThat(jdbc.queryForObject("select count(*) from information_schema.columns where table_schema=? and table_name='oauth_login_sessions' and column_name='client_type'", Integer.class, schema)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version='18'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from pg_constraint where conrelid='oauth_login_sessions'::regclass and conname='ck_oauth_login_sessions_verified_proof'", Integer.class)).isEqualTo(1);
    }

    private UUID webSession(String status) {
        UUID id = UUID.randomUUID();
        boolean verified = "VERIFIED".equals(status);
        jdbc.update("""
                insert into oauth_login_sessions(id,state_hash,browser_binding_hash,purpose,client_origin,client_request_id,
                  client_challenge,verifier_ciphertext,status,provider_subject,proof_hash,created_at,expires_at,proof_expires_at,provider_app_id)
                values (?,?,'binding','LOGIN','https://app.example.test','request','challenge',?,?,?, ?,
                  timestamptz '2026-10-16 10:00:00+00',timestamptz '2026-10-16 10:05:00+00',?,'app')
                """, id, id.toString(), verified ? null : "cipher", status, verified ? "subject" : null,
                verified ? id.toString() : null, verified ? OffsetDateTime.parse("2026-10-16T10:01:00Z") : null);
        return id;
    }

    private UUID nativeSession(String reference) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into oauth_login_sessions(id,state_hash,browser_binding_hash,purpose,client_request_id,client_challenge,
                  status,provider_subject,created_at,expires_at,provider_app_id,client_type,native_client_id,return_target_id,
                  handoff_reference_hash,handoff_expires_at)
                values (?,?,'binding','LOGIN','request','challenge','VERIFIED','subject',now(),now()+interval '5 minutes',
                  'app','ANDROID','android-staging','core-staging',?,now()+interval '1 minute')
                """, id, id.toString(), reference);
        return id;
    }

    private Flyway flyway(String target) {
        return Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).cleanDisabled(true).target(target).load();
    }

    private static java.sql.Connection connection() throws Exception {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }
}
