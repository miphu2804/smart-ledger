package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.smartledger.core.config.ZaloNativeProperties;
import com.smartledger.core.config.ZaloProperties;
import com.smartledger.core.dto.request.ZaloNativeHandoffRequest;
import com.smartledger.core.dto.request.ZaloProofRequest;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.ZaloNativeOAuthRepository;
import com.smartledger.core.repository.ZaloOAuthRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.ZaloAuthServiceImpl;
import com.smartledger.core.service.impl.ZaloNativeAuthServiceImpl;
import com.smartledger.core.zalo.*;
import java.sql.DriverManager;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.util.UriComponentsBuilder;

/** Real committed PostgreSQL transactions, stubbed provider/Firebase. Future columns exist ONLY in a test fixture. */
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
class ZaloNativeFlowPostgresTest {
    private static final String SCHEMA = "core_zalo_native_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final String CLIENT = "android-staging";
    private static final String ORIGIN = "https://owner.example.test";
    private static final Instant START = Instant.parse("2026-10-16T12:00:00Z");
    private static JdbcTemplate jdbc;
    private static ZaloNativeOAuthRepository repository;
    private static ZaloOAuthRepository identities;
    private static boolean schemaCreated;
    private ZaloProperties properties;
    private ZaloNativeProperties nativeProperties;
    private ZaloNativeAuthService service;
    private ZaloAuthService web;
    private ZaloProviderGateway provider;
    private FirebaseZaloGateway firebase;
    private TestClock clock;

    @BeforeAll
    static void schema() throws Exception {
        try (var connection = DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
                var statement = connection.createStatement()) {
            statement.execute("create schema \"" + SCHEMA + "\"");
            schemaCreated = true;
        }
        var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
        var settings = new Properties(); settings.setProperty("currentSchema", SCHEMA); source.setConnectionProperties(settings);
        Flyway.configure().dataSource(source).schemas(SCHEMA).defaultSchema(SCHEMA).load().migrate();
        jdbc = new JdbcTemplate(source);
        var manager = new DataSourceTransactionManager(source);
        repository = new ZaloNativeOAuthRepository(jdbc, manager);
        identities = new ZaloOAuthRepository(jdbc, manager);
        installProspectiveFixture();
    }

    @BeforeEach
    void resetState() {
        jdbc.update("delete from oauth_login_sessions"); jdbc.update("delete from external_auth_identities");
        jdbc.update("delete from auth_identities"); jdbc.update("delete from users");
        clock = new TestClock();
        properties = new ZaloProperties(); properties.setEnabled(true); properties.setAppId("3632655625730637557");
        properties.setAppSecret("synthetic-test-secret"); properties.setCallbackUrl("https://core.example.test/api/v1/auth/zalo/callback");
        properties.setClientOrigins(List.of(ORIGIN)); properties.setSessionEncryptionKey(Base64.getEncoder().encodeToString(new byte[32]));
        nativeProperties = new ZaloNativeProperties(); nativeProperties.setEnabled(true);
        nativeProperties.setClientId(CLIENT); nativeProperties.setReturnTargetId("core-staging");
        nativeProperties.setReturnUrl("https://core.example.test/mobile/auth/zalo/complete");
        nativeProperties.setCertificateSha256(List.of("FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C"));
        provider = mock(ZaloProviderGateway.class); firebase = mock(FirebaseZaloGateway.class);
        when(provider.exchangeCode(anyString(), anyString())).thenAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(jdbc.queryForObject("select count(*) from oauth_login_sessions where status='EXCHANGING'", Integer.class)).isPositive();
            return new ZaloProfile("subject", "Zalo name hint");
        });
        when(firebase.mintCustomToken(anyString(), anyBoolean())).thenAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return "synthetic-custom:" + invocation.getArgument(0);
        });
        var crypto = new ZaloCrypto(properties);
        service = new ZaloNativeAuthServiceImpl(properties, nativeProperties, crypto, repository, identities, provider, firebase, clock);
        web = new ZaloAuthServiceImpl(properties, crypto, identities, provider, firebase, clock);
    }

    @Test
    void nativeOffAndMissingFutureSchemaFailClosedWhileV17WebKeepsWorking() {
        dropProspectiveFixture();
        try {
            nativeProperties.setEnabled(false);
            assertError(() -> start(ZaloPurpose.LOGIN), ErrorCode.ZALO_UNAVAILABLE);
            verifyNoInteractions(provider, firebase);
            nativeProperties.setEnabled(true);
            assertError(() -> start(ZaloPurpose.LOGIN), ErrorCode.ZALO_UNAVAILABLE);
            assertThat(jdbc.queryForObject("select count(*) from information_schema.columns where table_schema=? and table_name='oauth_login_sessions' and column_name='client_type'", Integer.class, SCHEMA)).isZero();
            assertThat(jdbc.queryForObject("select max(version::integer) from flyway_schema_history where success=true", Integer.class)).isEqualTo(17);
            var proof = webProof(ZaloPurpose.LOGIN);
            assertThat(web.exchange(proof, ORIGIN).firebaseCustomToken()).startsWith("synthetic-custom:");
            properties.setEnabled(false);
            assertThat(service.isNativeCallback(ZaloCrypto.randomToken())).isFalse();
        } finally {
            jdbc.update("delete from oauth_login_sessions");
            installProspectiveFixture();
        }
    }

    @Test
    void loginUsesVerifierBoundReferenceWithoutPersistingCredentialsAndReusesWebIdentity() {
        var flow = start(ZaloPurpose.LOGIN);
        var stored = jdbc.queryForMap("select * from oauth_login_sessions");
        assertThat(stored.get("client_type")).isEqualTo("ANDROID");
        assertThat(stored.get("client_origin")).isNull();
        assertThat(stored.get("state_hash")).isEqualTo(ZaloCrypto.hash(flow.state()));
        assertThat(stored.get("browser_binding_hash")).isEqualTo(ZaloCrypto.hash(flow.start().cookieValue()));
        assertThat(stored.get("client_challenge")).isEqualTo(ZaloCrypto.hash(flow.verifier()));
        assertThat(stored.toString()).doesNotContain(flow.verifier(), flow.state(), flow.start().cookieValue());
        var result = complete(flow);
        stored = jdbc.queryForMap("select * from oauth_login_sessions");
        assertThat(stored.get("proof_hash")).isNull(); assertThat(stored.get("proof_expires_at")).isNull();
        assertThat(stored.get("verifier_ciphertext")).isNull();
        assertThat(stored.get("handoff_reference_hash")).isEqualTo(ZaloCrypto.hash(result.handoffReference()));
        var request = body(flow, result);
        String firstToken = service.exchange(request).firebaseCustomToken();
        assertThat(jdbc.queryForObject("select count(*) from users", Integer.class)).isZero();
        assertThat(jdbc.queryForMap("select * from oauth_login_sessions").get("handoff_reference_hash")).isNull();
        assertError(() -> service.exchange(request), ErrorCode.ZALO_SESSION_INVALID);
        assertThat(web.exchange(webProof(ZaloPurpose.LOGIN), ORIGIN).firebaseCustomToken()).isEqualTo(firstToken);
        assertThat(jdbc.queryForObject("select count(*) from external_auth_identities", Integer.class)).isEqualTo(1);
        assertThat(result.toString()).isEqualTo("ZaloNativeCallbackResult[redacted]");
        assertThat(request.toString()).isEqualTo("ZaloNativeHandoffRequest[redacted]");
    }

    @Test
    void wrongVerifierRequestClientPurposeOrChannelCannotConsumeNativeHandoff() {
        var flow = start(ZaloPurpose.LOGIN); var result = complete(flow); var request = body(flow, result);
        assertError(() -> service.exchange(new ZaloNativeHandoffRequest(CLIENT, flow.requestId(), result.handoffReference(), ZaloCrypto.randomToken())), ErrorCode.ZALO_SESSION_INVALID);
        assertError(() -> service.exchange(new ZaloNativeHandoffRequest(CLIENT, ZaloCrypto.randomToken(), result.handoffReference(), flow.verifier())), ErrorCode.ZALO_SESSION_INVALID);
        assertError(() -> service.exchange(new ZaloNativeHandoffRequest("android-production", flow.requestId(), result.handoffReference(), flow.verifier())), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> web.exchange(new ZaloProofRequest(result.handoffReference(), flow.verifier()), ORIGIN), ErrorCode.ZALO_SESSION_INVALID);
        seedOwner("owner", "ACTIVE", "OWNER"); when(firebase.verifyRecentUid("fresh")).thenReturn("owner");
        assertError(() -> service.link(request, principal("owner"), "fresh"), ErrorCode.ZALO_SESSION_INVALID);
        assertThat(service.exchange(request).firebaseCustomToken()).startsWith("synthetic-custom:");
        var link = start(ZaloPurpose.LINK); var linkResult = complete(link);
        assertError(() -> service.exchange(body(link, linkResult)), ErrorCode.ZALO_SESSION_INVALID);
        var webProof = webProof(ZaloPurpose.LOGIN);
        assertError(() -> service.exchange(new ZaloNativeHandoffRequest(CLIENT, flow.requestId(), webProof.proof(), webProof.clientVerifier())), ErrorCode.ZALO_SESSION_INVALID);
    }

    @Test
    void callbackRejectsWrongBindingPkceAndReplayWithoutExtraProviderCalls() {
        var flow = start(ZaloPurpose.LOGIN);
        assertError(() -> service.callback(flow.state(), "provider-code", null, null, ZaloCrypto.randomToken()), ErrorCode.ZALO_SESSION_INVALID);
        assertError(() -> web.callback(flow.state(), "provider-code", null, null, flow.start().cookieValue()), ErrorCode.ZALO_SESSION_INVALID);
        verifyNoInteractions(provider);
        var result = service.callback(flow.state(), "provider-code", null, ZaloCrypto.randomToken(), flow.start().cookieValue());
        assertThat(result.errorCode()).isEqualTo(ErrorCode.ZALO_SESSION_INVALID.getCode()); assertThat(result.handoffReference()).isNull();
        assertError(() -> complete(flow), ErrorCode.ZALO_SESSION_INVALID);
        verifyNoInteractions(provider, firebase);
    }

    @Test
    void concurrentCallbacksAndExchangesHaveExactlyOneWinner() throws Exception {
        var flow = start(ZaloPurpose.LOGIN);
        var callbacks = race(() -> attempt(() -> complete(flow)), () -> attempt(() -> complete(flow)));
        assertThat(callbacks.stream().filter(ZaloNativeCallbackResult.class::isInstance)).hasSize(1);
        var result = callbacks.stream().filter(ZaloNativeCallbackResult.class::isInstance).map(ZaloNativeCallbackResult.class::cast).findFirst().orElseThrow();
        verify(provider).exchangeCode(anyString(), anyString());
        var exchanges = race(() -> attempt(() -> service.exchange(body(flow, result))), () -> attempt(() -> service.exchange(body(flow, result))));
        assertThat(exchanges.stream().filter(com.smartledger.core.dto.response.ZaloExchangeResponse.class::isInstance)).hasSize(1);
        assertThat(exchanges).contains(ErrorCode.ZALO_SESSION_INVALID);
        verify(firebase).mintCustomToken(anyString(), anyBoolean());
    }

    @Test
    void handoffAndSessionExpiryAreExclusiveAndProviderDelayDoesNotExtendSession() {
        var flow = start(ZaloPurpose.LOGIN); var result = complete(flow);
        clock.advance(90);
        assertError(() -> service.exchange(body(flow, result)), ErrorCode.ZALO_SESSION_INVALID);
        var delayed = start(ZaloPurpose.LOGIN);
        clock.advance(299);
        var shortResult = complete(delayed);
        assertThat(jdbc.queryForObject("select handoff_expires_at=expires_at from oauth_login_sessions where state_hash=?", Boolean.class, ZaloCrypto.hash(delayed.state()))).isTrue();
        clock.advance(1);
        assertError(() -> service.exchange(body(delayed, shortResult)), ErrorCode.ZALO_SESSION_INVALID);
        var expired = start(ZaloPurpose.LOGIN); clock.advance(300);
        assertError(() -> complete(expired), ErrorCode.ZALO_SESSION_INVALID);
        var slow = start(ZaloPurpose.LOGIN);
        doAnswer(invocation -> { clock.advance(300); return new ZaloProfile("subject", "name"); }).when(provider).exchangeCode(anyString(), anyString());
        assertThat(complete(slow).errorCode()).isEqualTo(ErrorCode.ZALO_SESSION_EXPIRED.getCode());
        verifyNoInteractions(firebase);
    }

    @Test
    void cancellationProviderFailureAndFeatureDisabledNeverProduceHandoff() {
        var cancelled = start(ZaloPurpose.LOGIN);
        var denied = service.callback(cancelled.state(), null, "access_denied", null, cancelled.start().cookieValue());
        assertThat(denied.errorCode()).isEqualTo(ErrorCode.ZALO_CONSENT_DENIED.getCode()); assertThat(denied.handoffReference()).isNull();
        verifyNoInteractions(provider);
        var broken = start(ZaloPurpose.LOGIN);
        doThrow(new BusinessException(ErrorCode.ZALO_PROVIDER_UNAVAILABLE)).when(provider).exchangeCode(anyString(), anyString());
        assertThat(complete(broken).handoffReference()).isNull();
        var disabled = start(ZaloPurpose.LOGIN); nativeProperties.setEnabled(false);
        assertThat(service.isNativeCallback(disabled.state())).isTrue();
        assertError(() -> complete(disabled), ErrorCode.ZALO_UNAVAILABLE);
        verifyNoInteractions(firebase);
    }

    @Test
    void linkUsesRecentVerifiedUidPreservesProfileAndNeverMovesConflictingIdentity() {
        seedOwner("owner-one", "ACTIVE", "OWNER"); seedOwner("owner-two", "ACTIVE", "OWNER");
        var before = jdbc.queryForList("select * from users order by id");
        when(firebase.verifyRecentUid("fresh-one")).thenReturn("owner-one"); when(firebase.verifyRecentUid("fresh-two")).thenReturn("owner-two");
        var flow = start(ZaloPurpose.LINK); var result = complete(flow);
        service.link(body(flow, result), principal("owner-one"), "fresh-one");
        var repeat = start(ZaloPurpose.LINK); service.link(body(repeat, complete(repeat)), principal("owner-one"), "fresh-one");
        var conflicting = start(ZaloPurpose.LINK); var conflictingResult = complete(conflicting);
        assertError(() -> service.link(body(conflicting, conflictingResult), principal("owner-two"), "fresh-two"), ErrorCode.ZALO_IDENTITY_CONFLICT);
        assertThat(jdbc.queryForObject("select firebase_uid from external_auth_identities", String.class)).isEqualTo("owner-one");
        assertThat(jdbc.queryForList("select * from users order by id")).isEqualTo(before);
        verify(firebase, never()).mintCustomToken(anyString(), anyBoolean());
        var login = start(ZaloPurpose.LOGIN);
        assertThat(service.exchange(body(login, complete(login))).firebaseCustomToken()).isEqualTo("synthetic-custom:owner-one");
    }

    @Test
    void linkRejectsMissingStaleOrMismatchedFirebaseProofWithoutConsumingHandoff() {
        seedOwner("owner", "ACTIVE", "OWNER"); var flow = start(ZaloPurpose.LINK); var request = body(flow, complete(flow));
        assertError(() -> service.link(request, null, null), ErrorCode.ZALO_REAUTHENTICATION_REQUIRED);
        when(firebase.verifyRecentUid("stale")).thenThrow(new BusinessException(ErrorCode.ZALO_REAUTHENTICATION_REQUIRED));
        assertError(() -> service.link(request, principal("owner"), "stale"), ErrorCode.ZALO_REAUTHENTICATION_REQUIRED);
        when(firebase.verifyRecentUid("mismatch")).thenReturn("other");
        assertError(() -> service.link(request, principal("owner"), "mismatch"), ErrorCode.ZALO_REAUTHENTICATION_REQUIRED);
        when(firebase.verifyRecentUid("fresh")).thenReturn("owner"); service.link(request, principal("owner"), "fresh");
    }

    @Test
    void disabledAndAdminAccountsCannotLoginOrLinkAndNoProfileIsCreatedImplicitly() {
        seedOwner("disabled", "DISABLED", "OWNER"); seedOwner("admin", "ACTIVE", "ADMIN");
        for (String uid : List.of("disabled", "admin", "missing")) {
            when(firebase.verifyRecentUid(uid)).thenReturn(uid);
            var flow = start(ZaloPurpose.LINK); var request = body(flow, complete(flow));
            ErrorCode code = uid.equals("disabled") ? ErrorCode.ACCOUNT_DISABLED : uid.equals("admin") ? ErrorCode.ZALO_ACCOUNT_NOT_ALLOWED : ErrorCode.AUTH_PROFILE_NOT_FOUND;
            assertError(() -> service.link(request, principal(uid), uid), code);
            assertThat(jdbc.queryForObject("select count(*) from external_auth_identities", Integer.class)).isZero();
        }
        jdbc.update("insert into external_auth_identities values ('ZALO',?,'subject','disabled',?,?)", properties.getAppId(), OffsetDateTime.now(clock), OffsetDateTime.now(clock));
        var flow = start(ZaloPurpose.LOGIN);
        assertError(() -> service.exchange(body(flow, complete(flow))), ErrorCode.ACCOUNT_DISABLED);
        verify(firebase, never()).mintCustomToken(anyString(), anyBoolean());
    }

    @Test
    void firebaseFailureKeepsCanonicalUidAndFreshFlowRecoversWithoutReferenceReplay() {
        when(firebase.mintCustomToken(anyString(), anyBoolean())).thenThrow(new BusinessException(ErrorCode.ZALO_PROVIDER_UNAVAILABLE));
        var flow = start(ZaloPurpose.LOGIN); var request = body(flow, complete(flow));
        assertError(() -> service.exchange(request), ErrorCode.ZALO_PROVIDER_UNAVAILABLE);
        String uid = jdbc.queryForObject("select firebase_uid from external_auth_identities", String.class);
        assertError(() -> service.exchange(request), ErrorCode.ZALO_SESSION_INVALID);
        doReturn("retry-token").when(firebase).mintCustomToken(uid, true);
        var retry = start(ZaloPurpose.LOGIN);
        assertThat(service.exchange(body(retry, complete(retry))).firebaseCustomToken()).isEqualTo("retry-token");
        assertThat(jdbc.queryForObject("select count(*) from external_auth_identities", Integer.class)).isEqualTo(1);
    }

    @Test
    void changedReturnTargetOrProviderAppCannotRedirectOrConsumeOldSession() {
        var pending = start(ZaloPurpose.LOGIN); nativeProperties.setReturnTargetId("changed-target");
        assertError(() -> complete(pending), ErrorCode.ZALO_SESSION_INVALID);
        nativeProperties.setReturnTargetId("core-staging");
        var result = complete(pending); properties.setAppId("999");
        assertError(() -> service.exchange(body(pending, result)), ErrorCode.ZALO_SESSION_INVALID);
        verifyNoInteractions(firebase);
    }

    @Test
    void competingNativeLinksHaveOneOwnerAndSuspensionDuringMintDoesNotReturnToken() throws Exception {
        seedOwner("one", "ACTIVE", "OWNER"); seedOwner("two", "ACTIVE", "OWNER");
        when(firebase.verifyRecentUid("one")).thenReturn("one"); when(firebase.verifyRecentUid("two")).thenReturn("two");
        var first = start(ZaloPurpose.LINK); var firstBody = body(first, complete(first));
        var second = start(ZaloPurpose.LINK); var secondBody = body(second, complete(second));
        var outcomes = race(() -> attempt(() -> { service.link(firstBody, principal("one"), "one"); return "linked"; }),
                () -> attempt(() -> { service.link(secondBody, principal("two"), "two"); return "linked"; }));
        assertThat(outcomes).containsExactlyInAnyOrder("linked", ErrorCode.ZALO_IDENTITY_CONFLICT);
        String uid = jdbc.queryForObject("select firebase_uid from external_auth_identities", String.class);
        doAnswer(invocation -> {
            jdbc.update("update users set status='DISABLED' where id=(select user_id from auth_identities where provider='FIREBASE' and provider_subject=?)", uid);
            return "must-not-return-this-token";
        }).when(firebase).mintCustomToken(uid, false);
        var login = start(ZaloPurpose.LOGIN);
        assertError(() -> service.exchange(body(login, complete(login))), ErrorCode.ACCOUNT_DISABLED);
        assertThat(jdbc.queryForObject("select firebase_uid from external_auth_identities", String.class)).isEqualTo(uid);
    }

    @Test
    void prospectiveFixtureEnforcesChannelIsolationReferenceUniquenessAndExpiry() {
        var first = start(ZaloPurpose.LOGIN); complete(first);
        String hash = ZaloCrypto.hash(first.state());
        assertThatThrownBy(() -> jdbc.update("update oauth_login_sessions set client_origin=? where state_hash=?", ORIGIN, hash))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("update oauth_login_sessions set proof_hash='web-proof' where state_hash=?", hash))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("update oauth_login_sessions set client_type='WEB' where state_hash=?", hash))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("update oauth_login_sessions set handoff_expires_at=expires_at+interval '1 second' where state_hash=?", hash))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        var second = start(ZaloPurpose.LOGIN); complete(second);
        assertThatThrownBy(() -> jdbc.update("update oauth_login_sessions set handoff_reference_hash=(select handoff_reference_hash from oauth_login_sessions where state_hash=?) where state_hash=?",
                hash, ZaloCrypto.hash(second.state()))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    private Flow start(ZaloPurpose purpose) {
        String verifier = ZaloCrypto.randomToken(), requestId = ZaloCrypto.randomToken();
        var start = service.authorize(CLIENT, purpose, requestId, ZaloCrypto.hash(verifier));
        var params = UriComponentsBuilder.fromUriString(start.authorizationUrl()).build().getQueryParams();
        assertThat(params.getFirst("redirect_uri")).contains("/api/v1/auth/zalo/callback");
        assertThat(service.isNativeCallback(params.getFirst("state"))).isTrue();
        return new Flow(start, params.getFirst("state"), params.getFirst("code_challenge"), requestId, verifier);
    }
    private ZaloNativeCallbackResult complete(Flow flow) { return service.callback(flow.state(), "provider-code", null, flow.challenge(), flow.start().cookieValue()); }
    private static ZaloNativeHandoffRequest body(Flow flow, ZaloNativeCallbackResult result) { return new ZaloNativeHandoffRequest(CLIENT, flow.requestId(), result.handoffReference(), flow.verifier()); }
    private ZaloProofRequest webProof(ZaloPurpose purpose) {
        String verifier = ZaloCrypto.randomToken(); var start = web.authorize(purpose, ORIGIN, ZaloCrypto.randomToken(), ZaloCrypto.hash(verifier));
        var params = UriComponentsBuilder.fromUriString(start.authorizationUrl()).build().getQueryParams();
        assertThat(service.isNativeCallback(params.getFirst("state"))).isFalse();
        return new ZaloProofRequest(web.callback(params.getFirst("state"), "provider-code", null, params.getFirst("code_challenge"), start.cookieValue()).proof(), verifier);
    }
    private static void seedOwner(String uid, String status, String role) {
        Long id = jdbc.queryForObject("insert into users(display_name,status,system_role) values ('Original owner',?,?) returning id", Long.class, status, role);
        jdbc.update("insert into auth_identities(user_id,provider,provider_subject) values (?,'FIREBASE',?)", id, uid);
    }
    private static VerifiedFirebaseToken principal(String uid) { return new VerifiedFirebaseToken(uid, null, false, null, null, null); }
    private static void assertError(Runnable action, ErrorCode expected) { assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class, error -> assertThat(error.getErrorCode()).isEqualTo(expected)); }
    private static Object attempt(Callable<Object> task) throws Exception { try { return task.call(); } catch (BusinessException error) { return error.getErrorCode(); } }
    @SafeVarargs
    private static List<Object> race(Callable<Object>... tasks) throws Exception {
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(tasks.length)) {
            List<Future<Object>> futures = new ArrayList<>();
            for (var task : tasks) futures.add(pool.submit(() -> { assertThat(start.await(10, TimeUnit.SECONDS)).isTrue(); return task.call(); }));
            start.countDown(); var results = new ArrayList<>();
            for (var future : futures) results.add(future.get(15, TimeUnit.SECONDS));
            return results;
        }
    }
    private record Flow(ZaloAuthorizationResult start, String state, String challenge, String requestId, String verifier) { }
    private static class TestClock extends Clock {
        private Instant instant = START;
        void advance(long seconds) { instant = instant.plusSeconds(seconds); }
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return instant; }
    }
    private static void installProspectiveFixture() { new ResourceDatabasePopulator(new ClassPathResource("fixtures/zalo-native-schema.sql")).execute(jdbc.getDataSource()); }
    private static void dropProspectiveFixture() {
        jdbc.execute("""
                alter table oauth_login_sessions drop constraint ck_test_oauth_channel,drop constraint ck_test_oauth_handoff_expiry,
                drop constraint ck_test_oauth_verified,drop column client_type,drop column native_client_id,drop column return_target_id,
                drop column handoff_reference_hash,drop column handoff_expires_at,alter column client_origin set not null,
                add constraint ck_oauth_login_sessions_verified_proof check (status<>'VERIFIED' or
                    (proof_hash is not null and provider_subject is not null and proof_expires_at is not null))
                """);
    }
    @AfterAll
    static void cleanup() throws Exception {
        if (schemaCreated && SCHEMA.matches("core_zalo_native_test_[a-f0-9]{32}")) {
            try (var connection = DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                    System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD")); var statement = connection.createStatement()) {
                statement.execute("drop schema \"" + SCHEMA + "\" cascade");
            }
        }
    }
}
