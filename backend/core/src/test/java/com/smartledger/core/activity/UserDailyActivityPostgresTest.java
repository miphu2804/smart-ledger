package com.smartledger.core.activity;

import static org.assertj.core.api.Assertions.*;

import java.sql.DriverManager;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.stream.IntStream;
import java.nio.file.Files;
import java.nio.file.Path;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Actual V18→V19 upgrade, constraints, commits and cross-instance deduplication on disposable PostgreSQL. */
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
class UserDailyActivityPostgresTest {
    private String schema;
    private DriverManagerDataSource source;
    private JdbcTemplate jdbc;
    private UserDailyActivityRepository repository;
    private String reader;
    private final LocalDate date = LocalDate.of(2026, 10, 29);

    @BeforeEach
    void setup() throws Exception {
        schema = "core_activity_test_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = connection(); var statement = connection.createStatement()) {
            statement.execute("CREATE SCHEMA " + schema);
        }
        source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
        Properties properties = new Properties();
        properties.setProperty("currentSchema", schema);
        source.setConnectionProperties(properties);
        jdbc = new JdbcTemplate(source);
        repository = new UserDailyActivityRepository(jdbc, new DataSourceTransactionManager(source));
    }

    @AfterEach
    void cleanup() throws Exception {
        if (schema != null && schema.matches("core_activity_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("DROP SCHEMA " + schema + " CASCADE");
                if (reader != null && reader.matches("core_activity_reader_[a-f0-9]{32}")) {
                    statement.execute("DROP ROLE " + reader);
                }
            }
        }
    }

    @Test
    void upgradePreservesExistingDataAndOnlyAddsEmptyDailyActivity() {
        flyway("18").migrate();
        long user = user("old", "OWNER", "ACTIVE", "old@example.test");
        var before = jdbc.queryForList("SELECT * FROM users");
        assertThat(flyway("19").migrate().migrationsExecuted).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT * FROM users")).isEqualTo(before);
        assertThat(count()).isZero();
        assertThat(flyway("19").migrate().migrationsExecuted).isZero();
        flyway("19").validate();
        assertThat(repository.insertActiveDay(user, date)).isTrue();
        assertThatThrownBy(() -> jdbc.update("INSERT INTO user_daily_activity VALUES (?, ?)", user, date))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO user_daily_activity VALUES (?, ?)", -1, date))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_indexes WHERE schemaname=? AND indexname='idx_user_daily_activity_date'",
                Long.class, schema)).isEqualTo(1);
    }

    @Test
    void firstRequestAfterUserCreationResolvesCanonicalIdAndDisabledUsersAreSkipped() {
        flyway("19").migrate();
        var service = service();
        service.record("new-uid", date); // Token exists before /auth/session creates a Core profile.
        assertThat(count()).isZero();
        long user = user("new-uid", "OWNER", "ACTIVE", "owner@example.test");
        service.record("new-uid", date);
        service.record("new-uid", date);
        assertThat(jdbc.queryForObject("SELECT user_id FROM user_daily_activity", Long.class)).isEqualTo(user);
        jdbc.update("UPDATE users SET status='DISABLED' WHERE id=?", user);
        assertThat(repository.insertActiveDay(user, date.plusDays(1))).isFalse();
        service.record("new-uid", date);
        assertThat(count()).isEqualTo(1);
    }

    @Test
    void concurrentIndependentInstancesAndRestartStillProduceOneRowPerDay() throws Exception {
        flyway("19").migrate();
        user("uid", "ADMIN", "ACTIVE", "admin@example.test");
        try (var pool = Executors.newFixedThreadPool(8)) {
            var jobs = IntStream.range(0, 16).<java.util.concurrent.Callable<Void>>mapToObj(i -> () -> {
                service().record("uid", date); return null;
            }).toList();
            for (var result : pool.invokeAll(jobs)) { result.get(); }
        }
        assertThat(count()).isEqualTo(1);
        service().record("uid", date);
        assertThat(count()).isEqualTo(1);
    }

    @Test
    void retentionKeepsBoundaryDayAndForeignKeyCascadesOnlyActivity() {
        flyway("19").migrate();
        long user = user("uid", "OWNER", "ACTIVE", null);
        repository.insertActiveDay(user, date.minusDays(90));
        repository.insertActiveDay(user, date.minusDays(89));
        repository.insertActiveDay(user, date);
        service().cleanup();
        assertThat(count()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT min(activity_date) FROM user_daily_activity", LocalDate.class))
                .isEqualTo(date.minusDays(89));
        jdbc.update("DELETE FROM auth_identities WHERE user_id=?", user);
        jdbc.update("DELETE FROM users WHERE id=?", user);
        assertThat(count()).isZero();
    }

    @Test
    void grafanaQueriesUseVietnamWindowsExcludeLoadTestsAndWorkWithColumnLimitedRole() throws Exception {
        flyway("19").migrate();
        LocalDate today = jdbc.queryForObject("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date", LocalDate.class);
        long owner = user("owner", "OWNER", "ACTIVE", null);
        long old = user("old", "OWNER", "ACTIVE", "old@example.test");
        long admin = user("admin", "ADMIN", "ACTIVE", "admin@example.test");
        long test = user("load", "OWNER", "ACTIVE", "LOADTEST+123@example.test");
        repository.insertActiveDay(owner, today);
        repository.insertActiveDay(owner, today.minusDays(29));
        repository.insertActiveDay(old, today.minusDays(30));
        repository.insertActiveDay(admin, today);
        repository.insertActiveDay(test, today);
        // Subsequent suspension does not rewrite historic activity.
        jdbc.update("UPDATE users SET status='DISABLED' WHERE id=?", owner);
        String[] queries = Files.readString(Path.of("docs/sql/user-daily-activity.sql")).split(";");
        var dau = jdbc.queryForList(queries[0]);
        assertThat(dau).hasSize(180);
        assertThat(dau.stream().filter(row -> today.equals(row.get("activity_date"))
                        || java.sql.Date.valueOf(today).equals(row.get("activity_date")))
                .map(row -> ((Number) row.get("active_users")).longValue()).toList()).containsExactly(1L, 1L);
        var mau = jdbc.queryForList(queries[1]);
        assertThat(mau).extracting(row -> row.get("active_users")).containsExactly(1L, 1L);
        reader = "core_activity_reader_" + UUID.randomUUID().toString().replace("-", "");
        jdbc.execute("CREATE ROLE " + reader);
        jdbc.execute("GRANT USAGE ON SCHEMA " + schema + " TO " + reader);
        jdbc.execute("GRANT SELECT(user_id,activity_date) ON user_daily_activity TO " + reader);
        jdbc.execute("GRANT SELECT(id,system_role,email) ON users TO " + reader);
        try (var connection = source.getConnection(); var statement = connection.createStatement()) {
            statement.execute("SET ROLE " + reader);
            // Grants alone cannot bypass the private table's RLS.
            try (var result = statement.executeQuery("SELECT count(*) FROM user_daily_activity")) {
                result.next(); assertThat(result.getLong(1)).isZero();
            }
        }
        jdbc.execute("CREATE POLICY activity_reader ON user_daily_activity FOR SELECT TO " + reader + " USING (true)");
        try (var connection = source.getConnection(); var statement = connection.createStatement()) {
            statement.execute("SET TIME ZONE 'Pacific/Honolulu'");
            statement.execute("SET ROLE " + reader);
            for (String query : queries) {
                if (!query.isBlank()) {
                    try (var result = statement.executeQuery(query)) {
                        int rows = 0;
                        long total = 0;
                        while (result.next()) {
                            rows++;
                            long activeUsers = result.getLong("active_users");
                            total += activeUsers;
                            if (query.contains("count(DISTINCT")) { assertThat(activeUsers).isEqualTo(1); }
                        }
                        assertThat(rows).isIn(2, 180);
                        // Check the values, not just shape, under a DB timezone a day behind Vietnam.
                        assertThat(total).isEqualTo(rows == 180 ? 4 : 2);
                    }
                }
            }
            assertThatThrownBy(() -> statement.execute("INSERT INTO user_daily_activity VALUES (" + owner + ", CURRENT_DATE)"))
                    .hasMessageContaining("permission denied");
            assertThatThrownBy(() -> statement.executeQuery("SELECT phone FROM users"))
                    .hasMessageContaining("permission denied");
        }
    }

    @Test
    void conflictingTableAbortsMigrationWithoutAdoptingOrMutatingIt() {
        flyway("18").migrate();
        jdbc.execute("CREATE TABLE user_daily_activity(marker TEXT)");
        jdbc.update("INSERT INTO user_daily_activity VALUES ('unexpected')");
        assertThatThrownBy(() -> flyway("19").migrate()).isInstanceOf(RuntimeException.class);
        assertThat(jdbc.queryForObject("SELECT marker FROM user_daily_activity", String.class)).isEqualTo("unexpected");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE version='19' AND success", Long.class)).isZero();
        jdbc.execute("DROP TABLE user_daily_activity");
        assertThat(flyway("19").migrate().migrationsExecuted).isEqualTo(1);
    }

    private long user(String uid, String role, String status, String email) {
        long id = jdbc.queryForObject("INSERT INTO users(display_name, system_role, status, email) VALUES ('Test', ?, ?, ?) RETURNING id",
                Long.class, role, status, email);
        jdbc.update("INSERT INTO auth_identities(user_id, provider_subject) VALUES (?, ?)", id, uid);
        return id;
    }
    private long count() { return jdbc.queryForObject("SELECT count(*) FROM user_daily_activity", Long.class); }
    private UserDailyActivityService service() {
        return new UserDailyActivityService(repository, Clock.fixed(Instant.parse("2026-10-29T10:00:00Z"), ZoneOffset.UTC), 10);
    }
    private Flyway flyway(String target) {
        return Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema).target(target).load();
    }
    private java.sql.Connection connection() throws Exception {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }
}
