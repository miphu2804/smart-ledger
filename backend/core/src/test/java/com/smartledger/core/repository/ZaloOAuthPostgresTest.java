package com.smartledger.core.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.zalo.ZaloOAuthSession;
import com.smartledger.core.zalo.ZaloPurpose;
import com.smartledger.core.zalo.ZaloStatus;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.LockSupport;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** Real PostgreSQL proof/identity atomicity on the actual Flyway migrations, including V17. */
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
class ZaloOAuthPostgresTest {
    private static final String SCHEMA = "core_zalo_auth_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final OffsetDateTime NOW = OffsetDateTime.of(2026, 10, 16, 12, 0, 0, 0, ZoneOffset.UTC);
    private static final String APP_ID = "3632655625730637557";
    private static final String ORIGIN = "https://app.example.test";
    private static JdbcTemplate jdbc;
    private static DataSourceTransactionManager transactions;
    private static ZaloOAuthRepository repository;
    private static boolean schemaCreated;

    @BeforeAll
    static void schema() throws SQLException {
        try (var connection = connection(); var statement = connection.createStatement()) {
            statement.execute("create schema \"" + SCHEMA + "\"");
            schemaCreated = true;
        }
        var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
        var properties = new Properties();
        properties.setProperty("currentSchema", SCHEMA);
        source.setConnectionProperties(properties);
        Flyway.configure().dataSource(source).schemas(SCHEMA).defaultSchema(SCHEMA).load().migrate();
        jdbc = new JdbcTemplate(source);
        transactions = new DataSourceTransactionManager(source);
        repository = new ZaloOAuthRepository(jdbc, transactions);
    }

    @BeforeEach
    void reset() {
        jdbc.update("delete from oauth_login_sessions");
        jdbc.update("delete from external_auth_identities");
        jdbc.update("delete from auth_identities");
        jdbc.update("delete from users");
    }

    @Test
    void roundTripsSessionWithoutSensitiveToString() {
        var session = pending(ZaloPurpose.LOGIN);
        repository.insert(session);
        assertThat(repository.findByStateHash(session.stateHash())).contains(session);
        assertThat(session.toString()).contains(session.id().toString(), "PENDING")
                .doesNotContain(session.stateHash(), session.browserBindingHash(), session.verifierCiphertext(),
                        session.clientChallenge(), session.clientRequestId());
        assertThat(repository.findByStateHash("unknown")).isEmpty();
    }

    @Test
    void callbackRequiresBindingUnexpiredPendingAndClaimsOnlyOnce() {
        var session = pending(ZaloPurpose.LOGIN);
        repository.insert(session);
        assertThat(repository.claimCallback(session.stateHash(), "wrong", NOW)).isEmpty();
        assertThat(repository.claimCallback(session.stateHash(), session.browserBindingHash(), session.expiresAt())).isEmpty();
        assertThat(repository.claimCallback(session.stateHash(), session.browserBindingHash(), NOW))
                .get().extracting(ZaloOAuthSession::status).isEqualTo(ZaloStatus.EXCHANGING);
        assertThat(repository.claimCallback(session.stateHash(), session.browserBindingHash(), NOW)).isEmpty();
    }

    @Test
    void concurrentCallbacksHaveOnlyOneWinner() throws Exception {
        var session = pending(ZaloPurpose.LOGIN);
        repository.insert(session);
        List<Boolean> winners = race(() -> repository.claimCallback(session.stateHash(), session.browserBindingHash(), NOW).isPresent(),
                () -> repository.claimCallback(session.stateHash(), session.browserBindingHash(), NOW).isPresent());
        assertThat(winners).containsExactlyInAnyOrder(true, false);
    }

    @Test
    void verifiedProofIsBoundToPurposeOriginChallengeAndBothExpiries() {
        var session = verified(ZaloPurpose.LINK);
        assertThat(repository.consumeProof(session.proofHash(), ZaloPurpose.LOGIN, ORIGIN, session.clientChallenge(), NOW)).isEmpty();
        assertThat(repository.consumeProof(session.proofHash(), ZaloPurpose.LINK, "https://evil.example", session.clientChallenge(), NOW)).isEmpty();
        assertThat(repository.consumeProof(session.proofHash(), ZaloPurpose.LINK, ORIGIN, "wrong", NOW)).isEmpty();
        assertThat(repository.consumeProof(session.proofHash(), ZaloPurpose.LINK, ORIGIN, session.clientChallenge(), session.proofExpiresAt())).isEmpty();
        assertThat(repository.consumeProof(session.proofHash(), ZaloPurpose.LINK, ORIGIN, session.clientChallenge(), session.expiresAt())).isEmpty();
        var consumed = repository.consumeProof(session.proofHash(), ZaloPurpose.LINK, ORIGIN, session.clientChallenge(), NOW).orElseThrow();
        assertThat(consumed.status()).isEqualTo(ZaloStatus.CONSUMED);
        assertThat(consumed.providerSubject()).isEqualTo("zalo-subject");
        assertThat(consumed.displayName()).isEqualTo("Test owner");
        assertThat(consumed.verifierCiphertext()).isNull();
        assertThat(repository.consumeProof(session.proofHash(), ZaloPurpose.LINK, ORIGIN, session.clientChallenge(), NOW)).isEmpty();
    }

    @Test
    void concurrentProofExchangesHaveOnlyOneWinner() throws Exception {
        var session = verified(ZaloPurpose.LOGIN);
        List<Boolean> winners = race(() -> repository.consumeProof(session.proofHash(), session.purpose(), ORIGIN, session.clientChallenge(), NOW).isPresent(),
                () -> repository.consumeProof(session.proofHash(), session.purpose(), ORIGIN, session.clientChallenge(), NOW).isPresent());
        assertThat(winners).containsExactlyInAnyOrder(true, false);
    }

    @Test
    void verificationOnlyTransitionsClaimedLiveSessionsAndClearsVerifier() {
        var session = pending(ZaloPurpose.LOGIN);
        repository.insert(session);
        assertThat(repository.markVerified(session.id(), "subject", "Name", "proof", NOW.plusSeconds(60), NOW)).isFalse();
        repository.claimCallback(session.stateHash(), session.browserBindingHash(), NOW).orElseThrow();
        assertThat(repository.markVerified(session.id(), "subject", "Name", "proof", NOW.plusSeconds(60), session.expiresAt())).isFalse();
        assertThat(repository.markVerified(session.id(), "subject", "Name", "proof", NOW.plusSeconds(60), NOW)).isTrue();
        assertThat(repository.findByStateHash(session.stateHash()).orElseThrow().verifierCiphertext()).isNull();
        assertThat(repository.markVerified(session.id(), "different", "Changed", "other-proof", NOW.plusSeconds(60), NOW)).isFalse();
    }

    @Test
    void failureOnlyChangesPendingOrExchangingAndRemovesSensitiveValues() {
        var session = pending(ZaloPurpose.LOGIN);
        repository.insert(session);
        repository.fail(session.id(), NOW);
        var failed = repository.findByStateHash(session.stateHash()).orElseThrow();
        assertThat(failed.status()).isEqualTo(ZaloStatus.FAILED);
        assertThat(failed.verifierCiphertext()).isNull();
        assertThat(failed.proofHash()).isNull();
        assertThat(repository.claimCallback(session.stateHash(), session.browserBindingHash(), NOW)).isEmpty();
        var verified = verified(ZaloPurpose.LOGIN);
        repository.fail(verified.id(), NOW);
        assertThat(repository.findByStateHash(verified.stateHash()).orElseThrow().status()).isEqualTo(ZaloStatus.VERIFIED);
    }

    @Test
    void sessionTransitionsCommitBeforeSurroundingTransactionRollsBack() {
        var session = pending(ZaloPurpose.LOGIN);
        var outer = new TransactionTemplate(transactions);
        outer.executeWithoutResult(status -> {
            repository.insert(session);
            repository.claimCallback(session.stateHash(), session.browserBindingHash(), NOW).orElseThrow();
            status.setRollbackOnly();
        });
        assertThat(repository.findByStateHash(session.stateHash()).orElseThrow().status()).isEqualTo(ZaloStatus.EXCHANGING);
    }

    @Test
    void concurrentFirstLoginAlwaysResolvesTheSameCanonicalUid() throws Exception {
        List<String> uids = race(() -> repository.resolveLoginUid(APP_ID, "same-subject", "candidate-one", NOW),
                () -> repository.resolveLoginUid(APP_ID, "same-subject", "candidate-two", NOW));
        assertThat(uids).hasSize(2);
        assertThat(uids.getFirst()).isEqualTo(uids.getLast()).isIn("candidate-one", "candidate-two");
        assertThat(jdbc.queryForObject("select count(*) from external_auth_identities", Integer.class)).isEqualTo(1);
        assertThat(repository.resolveLoginUid(APP_ID, "same-subject", "candidate-three", NOW)).isEqualTo(uids.getFirst());
    }

    @Test
    void appScopedSubjectDoesNotReuseAnotherAppsIdentity() {
        assertThat(repository.resolveLoginUid(APP_ID, "subject", "one", NOW)).isEqualTo("one");
        assertThat(repository.resolveLoginUid("another-app", "subject", "two", NOW)).isEqualTo("two");
    }

    @Test
    void loginGuardsTheCanonicalAccountNotTheCandidate() {
        seedUser("canonical", "DISABLED", "OWNER");
        jdbc.update("insert into external_auth_identities values ('ZALO',?,?,?, ?,?)", APP_ID, "subject", "canonical", NOW, NOW);
        assertError(() -> repository.resolveLoginUid(APP_ID, "subject", "different", NOW), ErrorCode.ACCOUNT_DISABLED);
        assertThat(jdbc.queryForObject("select firebase_uid from external_auth_identities", String.class)).isEqualTo("canonical");
    }

    @Test
    void linkingRequiresActiveOwnerProfileAndNeverChangesProfile() {
        long ownerId = seedUser("owner", "ACTIVE", "OWNER");
        Map<String, Object> before = jdbc.queryForMap("select * from users where id=?", ownerId);
        repository.linkIdentity(APP_ID, "subject", "owner", NOW);
        repository.linkIdentity(APP_ID, "subject", "owner", NOW.plusSeconds(1));
        assertThat(jdbc.queryForMap("select * from users where id=?", ownerId)).isEqualTo(before);
        assertThat(jdbc.queryForObject("select count(*) from external_auth_identities", Integer.class)).isEqualTo(1);
        seedUser("disabled", "DISABLED", "OWNER");
        seedUser("admin", "ACTIVE", "ADMIN");
        assertError(() -> repository.linkIdentity(APP_ID, "other-1", "disabled", NOW), ErrorCode.ACCOUNT_DISABLED);
        assertError(() -> repository.linkIdentity(APP_ID, "other-2", "admin", NOW), ErrorCode.ZALO_ACCOUNT_NOT_ALLOWED);
        assertError(() -> repository.linkIdentity(APP_ID, "other-3", "missing", NOW), ErrorCode.AUTH_PROFILE_NOT_FOUND);
        assertThat(jdbc.queryForObject("select count(*) from external_auth_identities", Integer.class)).isEqualTo(1);
    }

    @Test
    void competingLinksCannotReassignIdentity() throws Exception {
        seedUser("owner-one", "ACTIVE", "OWNER");
        seedUser("owner-two", "ACTIVE", "OWNER");
        Callable<String> one = () -> attemptLink("owner-one");
        Callable<String> two = () -> attemptLink("owner-two");
        assertThat(race(one, two)).containsExactlyInAnyOrder("linked", "conflict");
        String canonical = jdbc.queryForObject("select firebase_uid from external_auth_identities", String.class);
        String other = canonical.equals("owner-one") ? "owner-two" : "owner-one";
        assertError(() -> repository.linkIdentity(APP_ID, "subject", other, NOW), ErrorCode.ZALO_IDENTITY_CONFLICT);
        assertThat(jdbc.queryForObject("select firebase_uid from external_auth_identities", String.class)).isEqualTo(canonical);
    }

    @Test
    void accountGuardReadsCurrentStatusAndAllowsMissingOnlyForLogin() {
        assertThat(repository.checkAccount("missing", false)).isFalse();
        assertError(() -> repository.checkAccount("missing", true), ErrorCode.AUTH_PROFILE_NOT_FOUND);
        long id = seedUser("owner", "ACTIVE", "OWNER");
        assertThat(repository.checkAccount("owner", true)).isTrue();
        jdbc.update("update users set status='DISABLED' where id=?", id);
        assertError(() -> repository.checkAccount("owner", false), ErrorCode.ACCOUNT_DISABLED);
        jdbc.update("update users set status='ACTIVE',system_role='ADMIN' where id=?", id);
        assertError(() -> repository.checkAccount("owner", false), ErrorCode.ZALO_ACCOUNT_NOT_ALLOWED);
    }

    @Test
    void linkingWaitsForConcurrentDisableAndDoesNotCommitTheNewMapping() throws Exception {
        long id = seedUser("owner", "ACTIVE", "OWNER");
        var attempt = new CountDownLatch(1);
        try (var writer = connection(); var pool = Executors.newSingleThreadExecutor()) {
            writer.setAutoCommit(false);
            int writerPid;
            try (var statement = writer.createStatement()) {
                statement.execute("set search_path to \"" + SCHEMA + "\"");
                statement.execute("set statement_timeout='10s'");
                try (var rows = statement.executeQuery("select pg_backend_pid()")) {
                    rows.next();
                    writerPid = rows.getInt(1);
                }
            }
            try (var statement = writer.prepareStatement("update users set status='DISABLED' where id=?")) {
                statement.setLong(1, id);
                assertThat(statement.executeUpdate()).isEqualTo(1);
            }
            var result = pool.submit(() -> {
                attempt.countDown();
                assertError(() -> repository.linkIdentity(APP_ID, "subject", "owner", NOW), ErrorCode.ACCOUNT_DISABLED);
            });
            try {
                assertThat(attempt.await(10, TimeUnit.SECONDS)).isTrue();
                awaitBlockedBy(writerPid);
                assertThat(result.isDone()).isFalse();
                writer.commit();
                result.get(15, TimeUnit.SECONDS);
                assertThat(jdbc.queryForObject("select count(*) from external_auth_identities", Integer.class)).isZero();
                assertThat(jdbc.queryForObject("select status from users where id=?", String.class, id)).isEqualTo("DISABLED");
            } finally {
                writer.rollback();
                result.cancel(true);
            }
        }
    }

    @Test
    void cleanupOnlyRemovesExpiredSessionsNotIdentityMappings() {
        var session = pending(ZaloPurpose.LOGIN);
        repository.insert(session);
        repository.resolveLoginUid(APP_ID, "subject", "owner", NOW);
        assertThat(repository.cleanup(NOW)).isZero();
        assertThat(repository.cleanup(session.expiresAt())).isEqualTo(1);
        assertThat(repository.findByStateHash(session.stateHash())).isEmpty();
        assertThat(jdbc.queryForObject("select count(*) from external_auth_identities", Integer.class)).isEqualTo(1);
    }

    private static String attemptLink(String uid) {
        try {
            repository.linkIdentity(APP_ID, "subject", uid, NOW);
            return "linked";
        } catch (BusinessException exception) {
            assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ZALO_IDENTITY_CONFLICT);
            return "conflict";
        }
    }

    private static long seedUser(String uid, String status, String role) {
        long id = jdbc.queryForObject("""
                insert into users(display_name,email,avatar_public_id,status,system_role)
                values ('Original owner','owner@example.test','private-avatar',?,?) returning id
                """, Long.class, status, role);
        jdbc.update("insert into auth_identities(user_id,provider,provider_subject) values (?,'FIREBASE',?)", id, uid);
        return id;
    }

    private static ZaloOAuthSession pending(ZaloPurpose purpose) {
        return new ZaloOAuthSession(UUID.randomUUID(), UUID.randomUUID().toString(), UUID.randomUUID().toString(),
                purpose, ORIGIN, UUID.randomUUID().toString(), "client-challenge", "encrypted-verifier", ZaloStatus.PENDING,
                null, null, null, NOW, NOW.plusMinutes(5), null, null, APP_ID);
    }

    private static ZaloOAuthSession verified(ZaloPurpose purpose) {
        var session = pending(purpose);
        repository.insert(session);
        repository.claimCallback(session.stateHash(), session.browserBindingHash(), NOW).orElseThrow();
        assertThat(repository.markVerified(session.id(), "zalo-subject", "Test owner", UUID.randomUUID().toString(),
                NOW.plusSeconds(90), NOW)).isTrue();
        return repository.findByStateHash(session.stateHash()).orElseThrow();
    }

    @SafeVarargs
    private static <T> List<T> race(Callable<T>... tasks) throws Exception {
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(tasks.length)) {
            var futures = new ArrayList<java.util.concurrent.Future<T>>();
            for (Callable<T> task : tasks) {
                futures.add(pool.submit(() -> {
                    assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
                    return task.call();
                }));
            }
            start.countDown();
            var result = new ArrayList<T>();
            for (var future : futures) result.add(future.get(15, TimeUnit.SECONDS));
            return result;
        }
    }

    private static void assertError(Runnable action, ErrorCode expected) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode()).isEqualTo(expected));
    }

    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }

    private static void awaitBlockedBy(int writerPid) throws SQLException {
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        try (var probe = connection(); var query = probe.prepareStatement(
                "select exists(select 1 from pg_stat_activity where ?=any(pg_blocking_pids(pid)))")) {
            query.setInt(1, writerPid);
            while (System.nanoTime() < deadline) {
                try (var rows = query.executeQuery()) {
                    rows.next();
                    if (rows.getBoolean(1)) return;
                }
                LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(10));
            }
        }
        throw new AssertionError("Expected account guard to wait for the account writer transaction");
    }

    @AfterAll
    static void cleanupSchema() throws SQLException {
        if (schemaCreated && SCHEMA.matches("core_zalo_auth_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("drop schema \"" + SCHEMA + "\" cascade");
            }
        }
    }
}
