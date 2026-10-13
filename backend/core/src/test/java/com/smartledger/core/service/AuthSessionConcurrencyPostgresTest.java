package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.smartledger.core.dto.response.AuthSessionResponse;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.SystemRole;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.media.MediaStorage;
import com.smartledger.core.repository.AuthIdentityRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.AuthSessionServiceImpl;
import jakarta.persistence.EntityManager;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.LockSupport;
import java.util.stream.Stream;
import javax.sql.DataSource;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Verifies real User row locks and stale persistence contexts in a disposable PostgreSQL schema.
 * Role/status changes use a separate DB transaction because Core has no user administration write API.
 * Latches control transaction order; pg_blocking_pids proves blocking before the holder commits.
 */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({AuthSessionServiceImpl.class, AuthSessionConcurrencyPostgresTest.Config.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AuthSessionConcurrencyPostgresTest {
    private static final String SCHEMA = "core_auth_race_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final String OLD_AVATAR = "smartledger/local/users/test/old";
    private static final String NEW_AVATAR = "smartledger/local/users/test/new";
    private static boolean schemaCreated;
    @Autowired private AuthSessionService sessions;
    @Autowired private AuthIdentityRepository identities;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private EntityManager entityManager;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private SqlProbe sql;
    private long userId;
    private String uid;

    @DynamicPropertySource
    static void schema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }

    @BeforeEach
    void seed() {
        uid = "auth-race-" + UUID.randomUUID();
        userId = jdbc.queryForObject("""
                insert into users(display_name,email,phone,avatar_url,avatar_public_id,system_role)
                values ('Existing admin','old@example.test','+84900000000','https://firebase.test/old.png',?,'ADMIN')
                returning id
                """, Long.class, OLD_AVATAR);
        jdbc.update("insert into auth_identities(user_id,provider,provider_subject) values (?,'FIREBASE',?)", userId, uid);
        sql.clear();
    }

    @ParameterizedTest(name = "writer first: {0}, changed claims={1}, preloaded user={2}")
    @MethodSource("writerFirstCases")
    void sessionReadsCommittedChangesEvenWhenUserWasAlreadyManaged(Change change, boolean changedClaims,
            boolean preloadUser) throws Exception {
        var sessionReady = new CountDownLatch(1);
        var attemptSession = new CountDownLatch(1);
        var sessionPid = new AtomicInteger();
        try (var pool = Executors.newFixedThreadPool(1); var writer = schemaConnection()) {
            writer.setAutoCommit(false);
            var session = pool.submit(() -> {
                try {
                    return new TransactionTemplate(transactions).execute(status -> {
                        jdbc.execute("set local statement_timeout='10s'");
                        sessionPid.set(jdbc.queryForObject("select pg_backend_pid()", Integer.class));
                        if (preloadUser) {
                            UserAccount stale = entityManager.find(UserAccount.class, userId);
                            assertThat(stale.getSystemRole()).isEqualTo(SystemRole.ADMIN);
                            assertThat(stale.getAvatarPublicId()).isEqualTo(OLD_AVATAR);
                        }
                        sessionReady.countDown();
                        await(attemptSession);
                        return new Attempt(sessions.openSession(token(changedClaims), null), null);
                    });
                } catch (BusinessException error) {
                    return new Attempt(null, error.getErrorCode());
                }
            });
            try {
                await(sessionReady);
                applyChange(writer, change);
                attemptSession.countDown();
                awaitBlocked(sessionPid.get());
                assertThat(session.isDone()).isFalse();
                writer.commit();
                Attempt result = session.get(15, TimeUnit.SECONDS);
                assertSession(result, change, changedClaims);
                assertStoredProfile(change, changedClaims && change != Change.DISABLE);
            } finally {
                attemptSession.countDown();
                writer.rollback();
                session.cancel(true);
            }
        }
    }

    @ParameterizedTest(name = "session first: {0}, changed claims={1}")
    @MethodSource("sessionFirstCases")
    void sessionKeepsItsRowLockUntilCommitAndTheLaterWriterWins(Change change, boolean changedClaims) throws Exception {
        var sessionHoldsLock = new CountDownLatch(1);
        var releaseSession = new CountDownLatch(1);
        var writerStarted = new CountDownLatch(1);
        var writerPid = new AtomicInteger();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var session = pool.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                jdbc.execute("set local statement_timeout='10s'");
                AuthSessionResponse response = sessions.openSession(token(changedClaims), null);
                sessionHoldsLock.countDown();
                await(releaseSession);
                return response;
            }));
            await(sessionHoldsLock);
            var writer = pool.submit(() -> {
                try (var connection = schemaConnection()) {
                    connection.setAutoCommit(false);
                    try (var statement = connection.createStatement(); var result = statement.executeQuery("select pg_backend_pid()")) {
                        result.next();
                        writerPid.set(result.getInt(1));
                    }
                    writerStarted.countDown();
                    applyChange(connection, change);
                    connection.commit();
                }
                return null;
            });
            try {
                await(writerStarted);
                awaitBlocked(writerPid.get());
                assertThat(writer.isDone()).isFalse();
                releaseSession.countDown();
                AuthSessionResponse response = session.get(15, TimeUnit.SECONDS);
                writer.get(15, TimeUnit.SECONDS);
                assertThat(response.role()).isEqualTo(SystemRole.ADMIN);
                assertThat(response.user().avatarUrl()).isEqualTo(deliveryUrl(OLD_AVATAR));
                assertThat(response.user().email()).isEqualTo(token(changedClaims).email());
                assertStoredProfile(change, changedClaims);
            } finally {
                releaseSession.countDown();
                session.cancel(true);
                writer.cancel(true);
            }
        }
    }

    @Test
    void identityLookupDoesNotLoadUserBeforeTakingItsLock() {
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            assertThat(identities.findUserIdByProviderSubject(uid)).contains(userId);
            // No User entity read or hydration is hidden in this scalar lookup.
            assertThat(sql.statements).hasSize(1);
            assertThat(sql.statements.getFirst()).contains(".user_id", "auth_identities").doesNotContain(" join ", " users ");
            sql.clear();
            sessions.openSession(token(true), null);
            assertThat(sql.statements.stream().filter(query -> query.contains(" from ") && query.contains("users")
                    && query.contains("for ")).toList()).hasSize(2);
        });
    }

    @Test
    void createsOwnerOnlyOnFirstSessionAndMeDoesNotSyncProviderClaims() {
        String newUid = "new-" + UUID.randomUUID();
        var original = new VerifiedFirebaseToken(newUid, "new@example.test", true, null, null, null);
        var created = sessions.openSession(original, " New owner ");
        assertThat(created.role()).isEqualTo(SystemRole.OWNER);
        assertThat(created.user().displayName()).isEqualTo("New owner");
        assertThat(created.needsOnboarding()).isTrue();
        var updated = new VerifiedFirebaseToken(newUid, "updated@example.test", true, null, null, null);
        assertThat(sessions.getCurrentSession(updated).user().email()).isEqualTo("new@example.test");
        assertThat(sessions.openSession(updated, null).user().id()).isEqualTo(created.user().id());
        assertThat(jdbc.queryForObject("select count(*) from auth_identities where provider_subject=?", Long.class, newUid))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("select email from users where id=?", String.class, created.user().id()))
                .isEqualTo("updated@example.test");
    }

    private void assertSession(Attempt attempt, Change change, boolean changedClaims) {
        if (change == Change.DISABLE) {
            assertThat(attempt.error()).isEqualTo(ErrorCode.ACCOUNT_DISABLED);
            assertThat(attempt.response()).isNull();
            return;
        }
        assertThat(attempt.error()).isNull();
        var response = attempt.response();
        assertThat(response.role()).isEqualTo(change == Change.DEMOTE ? SystemRole.OWNER : SystemRole.ADMIN);
        assertThat(response.needsOnboarding()).isEqualTo(change == Change.DEMOTE);
        assertThat(response.user().email()).isEqualTo(token(changedClaims).email());
        assertThat(response.user().phone()).isEqualTo(token(changedClaims).phoneNumber());
        assertThat(response.user().avatarUrl()).isEqualTo(change == Change.CLEAR_AVATAR
                ? token(changedClaims).avatarUrl() : deliveryUrl(change == Change.REPLACE_AVATAR ? NEW_AVATAR : OLD_AVATAR));
    }

    private void assertStoredProfile(Change change, boolean changedClaims) {
        Map<String, Object> profile = jdbc.queryForMap("select * from users where id=?", userId);
        assertThat(profile.get("status")).isEqualTo(change == Change.DISABLE ? "DISABLED" : "ACTIVE");
        assertThat(profile.get("system_role")).isEqualTo(change == Change.DEMOTE ? "OWNER" : "ADMIN");
        assertThat(profile.get("avatar_public_id")).isEqualTo(switch (change) {
            case REPLACE_AVATAR -> NEW_AVATAR;
            case CLEAR_AVATAR -> null;
            default -> OLD_AVATAR;
        });
        assertThat(profile.get("email")).isEqualTo(token(changedClaims).email());
        assertThat(profile.get("phone")).isEqualTo(token(changedClaims).phoneNumber());
        assertThat(profile.get("avatar_url")).isEqualTo(token(changedClaims).avatarUrl());
        assertThat(profile.get("display_name")).isEqualTo("Existing admin");
    }

    private VerifiedFirebaseToken token(boolean changedClaims) {
        return new VerifiedFirebaseToken(uid, changedClaims ? "new@example.test" : "old@example.test", true,
                changedClaims ? "+84901111111" : "+84900000000", "Ignored provider name",
                changedClaims ? "https://firebase.test/new.png" : "https://firebase.test/old.png");
    }

    private void applyChange(Connection connection, Change change) throws SQLException {
        String assignment = switch (change) {
            case REPLACE_AVATAR -> "avatar_public_id='" + NEW_AVATAR + "'";
            case CLEAR_AVATAR -> "avatar_public_id=null";
            case DISABLE -> "status='DISABLED'";
            case DEMOTE -> "system_role='OWNER'";
        };
        try (var statement = connection.prepareStatement("update users set " + assignment + ",updated_at=current_timestamp where id=?")) {
            statement.setLong(1, userId);
            assertThat(statement.executeUpdate()).isEqualTo(1);
        }
    }

    private static Stream<Arguments> writerFirstCases() {
        return sessionFirstCases().flatMap(arguments -> Stream.of(
                Arguments.of(arguments.get()[0], arguments.get()[1], false),
                Arguments.of(arguments.get()[0], arguments.get()[1], true)));
    }

    private static Stream<Arguments> sessionFirstCases() {
        return Stream.of(Change.values()).flatMap(change -> Stream.of(Arguments.of(change, false), Arguments.of(change, true)));
    }

    private static void await(CountDownLatch latch) {
        try {
            assertThat(latch.await(15, TimeUnit.SECONDS)).as("transaction coordination").isTrue();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted transaction coordination", exception);
        }
    }

    private static void awaitBlocked(int pid) throws SQLException {
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        try (var connection = connection(); var statement = connection.prepareStatement("select cardinality(pg_blocking_pids(?)) > 0")) {
            statement.setInt(1, pid);
            while (System.nanoTime() < deadline) {
                try (var result = statement.executeQuery()) {
                    result.next();
                    if (result.getBoolean(1)) return;
                }
                LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(10));
            }
        }
        throw new AssertionError("Expected PostgreSQL row lock to block backend " + pid);
    }

    private static String deliveryUrl(String publicId) { return "https://media.test/" + publicId; }

    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }

    private static Connection schemaConnection() throws SQLException {
        var connection = connection();
        try (var statement = connection.createStatement()) {
            statement.execute("set search_path to \"" + SCHEMA + "\"");
            statement.execute("set statement_timeout='10s'");
        }
        return connection;
    }

    @AfterAll
    static void cleanupSchema() throws SQLException {
        if (schemaCreated && SCHEMA.matches("core_auth_race_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("drop schema \"" + SCHEMA + "\" cascade");
            }
        }
    }

    private enum Change { REPLACE_AVATAR, CLEAR_AVATAR, DISABLE, DEMOTE }
    private record Attempt(AuthSessionResponse response, ErrorCode error) { }

    static class SqlProbe implements StatementInspector {
        private final List<String> statements = new CopyOnWriteArrayList<>();
        @Override public String inspect(String query) { statements.add(query.toLowerCase(Locale.ROOT)); return query; }
        void clear() { statements.clear(); }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Config {
        @Bean
        DataSource dataSource() throws SQLException {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("create schema \"" + SCHEMA + "\"");
                schemaCreated = true;
            }
            var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                    System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
            var properties = new Properties();
            properties.setProperty("currentSchema", SCHEMA);
            source.setConnectionProperties(properties);
            return source;
        }
        @Bean SqlProbe sqlProbe() { return new SqlProbe(); }
        @Bean HibernatePropertiesCustomizer inspectSql(SqlProbe probe) {
            return properties -> properties.put("hibernate.session_factory.statement_inspector", probe);
        }
        @Bean MediaStorage mediaStorage() {
            var storage = mock(MediaStorage.class);
            when(storage.authenticatedUrl(OLD_AVATAR)).thenReturn(deliveryUrl(OLD_AVATAR));
            when(storage.authenticatedUrl(NEW_AVATAR)).thenReturn(deliveryUrl(NEW_AVATAR));
            return storage;
        }
    }
}
