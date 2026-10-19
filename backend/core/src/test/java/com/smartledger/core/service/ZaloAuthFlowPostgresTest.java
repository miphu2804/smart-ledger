package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.smartledger.core.config.ZaloConfiguration;
import com.smartledger.core.config.ZaloProperties;
import com.smartledger.core.dto.request.ZaloProofRequest;
import com.smartledger.core.dto.response.ZaloExchangeResponse;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.SystemRole;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.media.MediaStorage;
import com.smartledger.core.repository.ZaloOAuthRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.AuthSessionServiceImpl;
import com.smartledger.core.service.impl.ZaloAuthServiceImpl;
import com.smartledger.core.zalo.FirebaseZaloGateway;
import com.smartledger.core.zalo.ZaloCrypto;
import com.smartledger.core.zalo.ZaloProfile;
import com.smartledger.core.zalo.ZaloProviderGateway;
import com.smartledger.core.zalo.ZaloPurpose;
import jakarta.persistence.EntityManagerFactory;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Coordinator + real JDBC identity/session storage + existing JPA auth/session integration.
 * Provider/Firebase gateways are stubs: these tests do not claim real Zalo/Firebase acceptance.
 * V17's actual SQL is installed after Hibernate has validated V16, also proving disabled old-schema startup.
 */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.flyway.target=16", "spring.jpa.hibernate.ddl-auto=validate", "zalo.enabled=false"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ZaloConfiguration.class, ZaloCrypto.class, ZaloOAuthRepository.class, AuthSessionServiceImpl.class,
        ZaloAuthFlowPostgresTest.Config.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ZaloAuthFlowPostgresTest {
    private static final String SCHEMA = "core_zalo_flow_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final String ORIGIN = "https://owner.example.test";
    private static final String APP_ID = "3632655625730637557";
    private static final String SUBJECT = "stub-zalo-subject";
    private static final String DISPLAY_NAME = "Zalo name hint";
    private static final String CUSTOM_TOKEN_PREFIX = "synthetic-custom-token:";
    private static final String PRIVATE_AVATAR = "smartledger/test/users/owner/avatar";
    private static boolean schemaCreated;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ZaloAuthService service;
    @Autowired private AuthSessionService sessions;
    @Autowired private ZaloProperties properties;
    @Autowired private ZaloProviderGateway provider;
    @Autowired private FirebaseZaloGateway firebase;
    @Autowired private MediaStorage media;
    @Autowired private ExistingSchemaStartup startup;
    private final List<String> mintedUids = new CopyOnWriteArrayList<>();

    @DynamicPropertySource
    static void schema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }

    @BeforeEach
    void resetState() {
        assertThat(startup.validatedWithoutZaloTables()).as("Hibernate initialized against the migrated pre-Zalo schema").isTrue();
        installFixture();
        jdbc.update("delete from oauth_login_sessions");
        jdbc.update("delete from external_auth_identities");
        jdbc.update("delete from shops");
        jdbc.update("delete from auth_identities");
        jdbc.update("delete from users");
        reset(provider, firebase, media);
        properties.setEnabled(true);
        properties.setAppId(APP_ID);
        properties.setAppSecret("synthetic-test-secret");
        properties.setCallbackUrl("https://core.example.test/api/v1/auth/zalo/callback");
        properties.setClientOrigins(List.of(ORIGIN));
        properties.setSessionEncryptionKey(Base64.getEncoder().encodeToString(new byte[32]));
        when(provider.exchangeCode(anyString(), anyString())).thenAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).as("provider I/O outside DB transaction").isFalse();
            assertThat(jdbc.queryForObject("select count(*) from oauth_login_sessions where status='EXCHANGING'", Integer.class)).isPositive();
            return new ZaloProfile(SUBJECT, DISPLAY_NAME);
        });
        doAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).as("Firebase I/O outside DB transaction").isFalse();
            String uid = invocation.getArgument(0);
            mintedUids.add(uid);
            return CUSTOM_TOKEN_PREFIX + uid;
        }).when(firebase).mintCustomToken(anyString(), anyBoolean());
        when(media.authenticatedUrl(PRIVATE_AVATAR)).thenReturn("https://media.example.test/private-avatar");
    }

    @Test
    void disabledWorksWithOnlyOldSchemaAndMissingNewTablesFailClosedWhenEnabled() {
        dropFixture();
        try {
            properties.setEnabled(false);
            properties.setAppSecret(null);
            properties.setSessionEncryptionKey(null);
            assertError(() -> service.authorize(ZaloPurpose.LOGIN, ORIGIN, ZaloCrypto.randomToken(),
                    ZaloCrypto.hash(ZaloCrypto.randomToken())), ErrorCode.ZALO_UNAVAILABLE);
            service.cleanupExpiredSessions();
            var existingAuth = sessions.openSession(principal("email-owner"), "Existing email login");
            assertThat(existingAuth.role()).isEqualTo(SystemRole.OWNER);
            assertThat(existingAuth.user().displayName()).isEqualTo("Existing email login");
            assertThat(zaloTablesAbsent()).isTrue();
            verifyNoInteractions(provider, firebase);

            properties.setEnabled(true);
            properties.setAppSecret("synthetic-test-secret");
            properties.setSessionEncryptionKey(Base64.getEncoder().encodeToString(new byte[32]));
            assertError(() -> service.authorize(ZaloPurpose.LOGIN, ORIGIN, ZaloCrypto.randomToken(),
                    ZaloCrypto.hash(ZaloCrypto.randomToken())), ErrorCode.ZALO_UNAVAILABLE);
            assertThat(zaloTablesAbsent()).as("no auto-DDL when the feature is enabled without a migration").isTrue();
            verifyNoInteractions(provider, firebase);
        } finally {
            installFixture();
        }
    }

    @Test
    void repeatedLoginUsesOneFirebaseUidAndCreatesCoreOwnerOnlyThroughExistingSession() {
        var first = service.exchange(proof(ZaloPurpose.LOGIN), ORIGIN);
        String uid = uid(first);
        assertThat(count("users")).isZero();
        assertThat(count("auth_identities")).isZero();
        assertThat(count("external_auth_identities")).isEqualTo(1);
        var firstSession = sessions.openSession(principal(uid), first.displayName());
        assertThat(firstSession.user().displayName()).isEqualTo(DISPLAY_NAME);
        assertThat(firstSession.role()).isEqualTo(SystemRole.OWNER);
        assertThat(firstSession.needsOnboarding()).isTrue();

        var second = service.exchange(proof(ZaloPurpose.LOGIN), ORIGIN);
        assertThat(uid(second)).isEqualTo(uid);
        var secondSession = sessions.openSession(principal(uid), "Ignored replacement name");
        assertThat(secondSession.user().id()).isEqualTo(firstSession.user().id());
        assertThat(secondSession.user().displayName()).isEqualTo(DISPLAY_NAME);
        assertThat(mintedUids).containsExactly(uid, uid);
        verify(firebase).mintCustomToken(uid, true);
        verify(firebase).mintCustomToken(uid, false);
        assertThat(count("users")).isEqualTo(1);
        assertThat(count("auth_identities")).isEqualTo(1);
        assertThat(count("external_auth_identities")).isEqualTo(1);
    }

    @Test
    void linkedLoginKeepsExistingOwnerProfileShopRoleAndPrivateAvatar() {
        long ownerId = seedOwner("existing-owner", "ACTIVE");
        long shopId = jdbc.queryForObject("""
                insert into shops(owner_id,name,industry) values (?,'Existing shop','Grocery') returning id
                """, Long.class, ownerId);
        Map<String, Object> beforeOwner = jdbc.queryForMap("select * from users where id=?", ownerId);
        Map<String, Object> beforeShop = jdbc.queryForMap("select * from shops where id=?", shopId);
        when(firebase.verifyRecentUid("fresh-owner-proof")).thenReturn("existing-owner");

        service.link(proof(ZaloPurpose.LINK), ORIGIN, principal("existing-owner"), "fresh-owner-proof");
        verify(firebase, never()).mintCustomToken(anyString(), anyBoolean());
        assertThat(jdbc.queryForMap("select * from users where id=?", ownerId)).isEqualTo(beforeOwner);

        var exchange = service.exchange(proof(ZaloPurpose.LOGIN), ORIGIN);
        assertThat(uid(exchange)).isEqualTo("existing-owner");
        var response = sessions.openSession(principal("existing-owner"), exchange.displayName());
        assertThat(response.user().id()).isEqualTo(ownerId);
        assertThat(response.user().displayName()).isEqualTo("Original owner");
        assertThat(response.user().email()).isEqualTo("owner@example.test");
        assertThat(response.user().phone()).isEqualTo("+84900000000");
        assertThat(response.user().avatarUrl()).isEqualTo("https://media.example.test/private-avatar");
        assertThat(response.role()).isEqualTo(SystemRole.OWNER);
        assertThat(response.needsOnboarding()).isFalse();
        assertThat(response.shops()).singleElement().satisfies(shop -> assertThat(shop.id()).isEqualTo(shopId));
        assertThat(jdbc.queryForMap("select * from users where id=?", ownerId)).isEqualTo(beforeOwner);
        assertThat(jdbc.queryForMap("select * from shops where id=?", shopId)).isEqualTo(beforeShop);
        assertThat(count("users")).isEqualTo(1);
        assertThat(count("auth_identities")).isEqualTo(1);
        verify(firebase).mintCustomToken("existing-owner", false);
    }

    @Test
    void conflictingLinkNeverMovesTheIdentityOrChangesEitherOwner() {
        long firstId = seedOwner("owner-one", "ACTIVE");
        long secondId = seedOwner("owner-two", "ACTIVE");
        Map<String, Object> firstBefore = jdbc.queryForMap("select * from users where id=?", firstId);
        Map<String, Object> secondBefore = jdbc.queryForMap("select * from users where id=?", secondId);
        when(firebase.verifyRecentUid("fresh-one")).thenReturn("owner-one");
        when(firebase.verifyRecentUid("fresh-two")).thenReturn("owner-two");
        service.link(proof(ZaloPurpose.LINK), ORIGIN, principal("owner-one"), "fresh-one");
        var conflictingProof = proof(ZaloPurpose.LINK);
        assertError(() -> service.link(conflictingProof, ORIGIN, principal("owner-two"), "fresh-two"), ErrorCode.ZALO_IDENTITY_CONFLICT);
        assertThat(jdbc.queryForObject("select firebase_uid from external_auth_identities", String.class)).isEqualTo("owner-one");
        assertThat(jdbc.queryForMap("select * from users where id=?", firstId)).isEqualTo(firstBefore);
        assertThat(jdbc.queryForMap("select * from users where id=?", secondId)).isEqualTo(secondBefore);
        assertError(() -> service.link(conflictingProof, ORIGIN, principal("owner-two"), "fresh-two"), ErrorCode.ZALO_SESSION_INVALID);
        verify(firebase, never()).mintCustomToken(anyString(), anyBoolean());
    }

    @Test
    void disabledMappedOwnerCannotObtainFirebaseCustomToken() {
        long ownerId = seedOwner("existing-owner", "ACTIVE");
        when(firebase.verifyRecentUid("fresh-owner")).thenReturn("existing-owner");
        service.link(proof(ZaloPurpose.LINK), ORIGIN, principal("existing-owner"), "fresh-owner");
        jdbc.update("update users set status='DISABLED' where id=?", ownerId);
        clearInvocations(firebase);
        var loginProof = proof(ZaloPurpose.LOGIN);
        assertError(() -> service.exchange(loginProof, ORIGIN), ErrorCode.ACCOUNT_DISABLED);
        verify(firebase, never()).mintCustomToken(anyString(), anyBoolean());
        assertThat(jdbc.queryForObject("select status from users where id=?", String.class, ownerId)).isEqualTo("DISABLED");
        assertThat(jdbc.queryForObject("select firebase_uid from external_auth_identities", String.class)).isEqualTo("existing-owner");
        assertError(() -> sessions.openSession(principal("existing-owner"), DISPLAY_NAME), ErrorCode.ACCOUNT_DISABLED);
    }

    @Test
    void freshOAuthAfterFirebaseFailureReusesReservedUidWithoutReusingConsumedProof() {
        var failFirst = new AtomicBoolean(true);
        doAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            String uid = invocation.getArgument(0);
            mintedUids.add(uid);
            if (failFirst.getAndSet(false)) throw new BusinessException(ErrorCode.ZALO_PROVIDER_UNAVAILABLE);
            return CUSTOM_TOKEN_PREFIX + uid;
        }).when(firebase).mintCustomToken(anyString(), anyBoolean());
        var firstProof = proof(ZaloPurpose.LOGIN);
        assertError(() -> service.exchange(firstProof, ORIGIN), ErrorCode.ZALO_PROVIDER_UNAVAILABLE);
        String reservedUid = jdbc.queryForObject("select firebase_uid from external_auth_identities", String.class);
        assertThat(count("users")).isZero();
        assertThat(count("auth_identities")).isZero();
        assertError(() -> service.exchange(firstProof, ORIGIN), ErrorCode.ZALO_SESSION_INVALID);

        var retry = service.exchange(proof(ZaloPurpose.LOGIN), ORIGIN);
        assertThat(uid(retry)).isEqualTo(reservedUid);
        assertThat(mintedUids).containsExactly(reservedUid, reservedUid);
        sessions.openSession(principal(reservedUid), retry.displayName());
        assertThat(count("users")).isEqualTo(1);
        assertThat(count("auth_identities")).isEqualTo(1);
        assertThat(count("external_auth_identities")).isEqualTo(1);
    }

    private ZaloProofRequest proof(ZaloPurpose purpose) {
        String clientVerifier = ZaloCrypto.randomToken();
        var start = service.authorize(purpose, ORIGIN, ZaloCrypto.randomToken(), ZaloCrypto.hash(clientVerifier));
        var parameters = UriComponentsBuilder.fromUriString(start.authorizationUrl()).build().getQueryParams();
        var completed = service.callback(parameters.getFirst("state"), "stub-provider-code", null,
                parameters.getFirst("code_challenge"), start.cookieValue());
        assertThat(completed.errorCode()).isNull();
        assertThat(completed.proof()).matches("[A-Za-z0-9_-]{43}");
        return new ZaloProofRequest(completed.proof(), clientVerifier);
    }

    private long seedOwner(String uid, String status) {
        long id = jdbc.queryForObject("""
                insert into users(display_name,email,phone,avatar_url,avatar_public_id,status,system_role)
                values ('Original owner','owner@example.test','+84900000000','https://firebase.example.test/original.png',?,?,'OWNER')
                returning id
                """, Long.class, PRIVATE_AVATAR, status);
        jdbc.update("insert into auth_identities(user_id,provider,provider_subject) values (?,'FIREBASE',?)", id, uid);
        return id;
    }

    private int count(String table) {
        if (!List.of("users", "auth_identities", "external_auth_identities").contains(table)) throw new IllegalArgumentException();
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
    }

    private boolean zaloTablesAbsent() {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select to_regclass('oauth_login_sessions') is null and to_regclass('external_auth_identities') is null
                """, Boolean.class));
    }

    private void installFixture() {
        if (zaloTablesAbsent()) {
            var script = new ResourceDatabasePopulator(new ClassPathResource("db/migration/V17__create_zalo_auth_stores.sql"));
            // PostgreSQL DO blocks contain semicolons; send the complete migration as one JDBC script.
            script.setSeparator(ScriptUtils.EOF_STATEMENT_SEPARATOR);
            script.execute(jdbc.getDataSource());
        }
    }

    private void dropFixture() {
        if (!SCHEMA.matches("core_zalo_flow_test_[a-f0-9]{32}")) throw new IllegalStateException("Unsafe test schema");
        jdbc.execute("drop table \"" + SCHEMA + "\".oauth_login_sessions");
        jdbc.execute("drop table \"" + SCHEMA + "\".external_auth_identities");
    }

    private static String uid(ZaloExchangeResponse response) {
        assertThat(response.firebaseCustomToken()).startsWith(CUSTOM_TOKEN_PREFIX);
        return response.firebaseCustomToken().substring(CUSTOM_TOKEN_PREFIX.length());
    }

    private static VerifiedFirebaseToken principal(String uid) {
        return new VerifiedFirebaseToken(uid, null, false, null, null, null);
    }

    private static void assertError(Runnable action, ErrorCode code) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.getErrorCode()).isEqualTo(code));
    }

    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }

    @AfterAll
    static void cleanupSchema() throws SQLException {
        if (schemaCreated && SCHEMA.matches("core_zalo_flow_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("drop schema \"" + SCHEMA + "\" cascade");
            }
        }
    }

    private record ExistingSchemaStartup(boolean validatedWithoutZaloTables) { }

    @TestConfiguration(proxyBeanMethods = false)
    static class Config {
        @Bean
        DriverManagerDataSource dataSource() throws SQLException {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("create schema \"" + SCHEMA + "\"");
                schemaCreated = true;
            }
            var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                    System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
            var settings = new Properties();
            settings.setProperty("currentSchema", SCHEMA);
            source.setConnectionProperties(settings);
            return source;
        }

        @Bean ZaloProviderGateway zaloProviderGateway() { return mock(ZaloProviderGateway.class); }
        @Bean FirebaseZaloGateway firebaseZaloGateway() { return mock(FirebaseZaloGateway.class); }
        @Bean MediaStorage mediaStorage() { return mock(MediaStorage.class); }

        @Bean
        ZaloAuthService zaloAuthService(ZaloProperties properties, ZaloCrypto crypto, ZaloOAuthRepository repository,
                ZaloProviderGateway provider, FirebaseZaloGateway firebase) {
            return new ZaloAuthServiceImpl(properties, crypto, repository, provider, firebase,
                    Clock.fixed(Instant.parse("2026-10-16T10:00:00Z"), ZoneOffset.UTC));
        }

        @Bean
        ExistingSchemaStartup existingSchemaStartup(EntityManagerFactory factory, JdbcTemplate jdbc, ZaloProperties properties) {
            boolean absent = Boolean.TRUE.equals(jdbc.queryForObject("""
                    select to_regclass('oauth_login_sessions') is null and to_regclass('external_auth_identities') is null
                    """, Boolean.class));
            return new ExistingSchemaStartup(factory.isOpen() && !properties.isEnabled() && absent);
        }
    }
}
