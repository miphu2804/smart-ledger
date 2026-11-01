package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.dto.request.ArchiveShopRequest;
import com.smartledger.core.dto.request.ShopStatusUpdateRequest;
import com.smartledger.core.dto.request.ShopUpdateRequest;
import com.smartledger.core.dto.response.ShopResponse;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.AuditLogServiceImpl;
import com.smartledger.core.service.impl.NotificationEventServiceImpl;
import com.smartledger.core.service.impl.ShopServiceImpl;
import jakarta.persistence.EntityManager;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Duration;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.LockSupport;
import java.util.function.Supplier;
import java.util.stream.Stream;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** Actual OWNER/ADMIN services, row-lock coordination and audit/notification writes in a disposable schema. */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({com.smartledger.core.ratelimit.UserRateLimitService.class, com.smartledger.core.repository.UserRateLimitRepository.class, ShopServiceImpl.class, AuditLogServiceImpl.class, AdminAccessAuditService.class,
        NotificationEventServiceImpl.class, ShopConcurrencyPostgresTest.Config.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ShopConcurrencyPostgresTest {
    private static final String SCHEMA = "core_shop_race_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final String ADMIN_REASON = "Latest administrative suspension";
    private static boolean schemaCreated;
    @Autowired private ShopService shops;
    @Autowired private EntityManager entityManager;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactions;
    private VerifiedFirebaseToken owner;
    private VerifiedFirebaseToken admin;
    private long shopId;

    @DynamicPropertySource
    static void schema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }

    @BeforeEach
    void seed() {
        owner = token();
        admin = token();
        long ownerId = user(owner, "OWNER");
        user(admin, "ADMIN");
        shopId = jdbc.queryForObject("""
                insert into shops(owner_id,name,industry,phone,address,logo_url,logo_public_id)
                values (?,'Old name','Retail','0900','Old address','https://media.test/old','old-logo') returning id
                """, Long.class, ownerId);
    }

    @ParameterizedTest(name = "ADMIN first, OWNER archive={0}, preloaded={1}")
    @MethodSource("operationCases")
    void adminSuspensionWinsBeforeOwnerWrite(boolean archive, boolean preload) throws Exception {
        var ownerReady = new CountDownLatch(1);
        var attemptOwner = new CountDownLatch(1);
        var adminHoldsLock = new CountDownLatch(1);
        var releaseAdmin = new CountDownLatch(1);
        var ownerPid = new AtomicInteger();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var ownerAttempt = pool.submit(() -> attempt(() -> tx(() -> {
                ownerPid.set(backendPid());
                if (preload) assertActiveManagedShop();
                ownerReady.countDown();
                await(attemptOwner);
                return ownerWrite(archive);
            })));
            await(ownerReady);
            var adminWrite = pool.submit(() -> tx(() -> {
                var response = suspend();
                adminHoldsLock.countDown();
                await(releaseAdmin);
                return response;
            }));
            try {
                await(adminHoldsLock);
                attemptOwner.countDown();
                awaitBlocked(ownerPid.get());
                assertThat(ownerAttempt.isDone()).isFalse();
                releaseAdmin.countDown();
                assertThat(adminWrite.get(15, TimeUnit.SECONDS).status()).isEqualTo(ShopStatus.INACTIVE);
                var result = ownerAttempt.get(15, TimeUnit.SECONDS);
                assertThat(result.error()).isEqualTo(ErrorCode.SHOP_INACTIVE);
                assertThat(result.reason()).isEqualTo(ADMIN_REASON);
                var stored = profile();
                assertThat(stored.get("status")).isEqualTo("INACTIVE");
                assertThat(stored.get("inactive_reason")).isEqualTo(ADMIN_REASON);
                assertThat(stored.get("name")).isEqualTo("Old name");
                assertThat(stored.get("archived_at")).isNull();
                assertThat(stored.get("archived_reason")).isNull();
                assertAudit("SHOP_INACTIVATED", 1);
                assertAudit("SHOP_UPDATED", 0);
                assertAudit("SHOP_ARCHIVED", 0);
                assertNotifications(1);
            } finally {
                attemptOwner.countDown();
                releaseAdmin.countDown();
                ownerAttempt.cancel(true);
                adminWrite.cancel(true);
            }
        }
    }

    @ParameterizedTest(name = "OWNER first, archive={0}, ADMIN preloaded={1}")
    @MethodSource("operationCases")
    void adminReadsOwnerCommitWithoutOverwritingProfileOrReopeningArchivedShop(boolean archive, boolean preload)
            throws Exception {
        var adminReady = new CountDownLatch(1);
        var attemptAdmin = new CountDownLatch(1);
        var ownerHoldsLock = new CountDownLatch(1);
        var releaseOwner = new CountDownLatch(1);
        var adminPid = new AtomicInteger();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var adminAttempt = pool.submit(() -> attempt(() -> tx(() -> {
                adminPid.set(backendPid());
                if (preload) assertActiveManagedShop();
                adminReady.countDown();
                await(attemptAdmin);
                return suspend();
            })));
            await(adminReady);
            var ownerWrite = pool.submit(() -> tx(() -> {
                var response = ownerWrite(archive);
                ownerHoldsLock.countDown();
                await(releaseOwner);
                return response;
            }));
            try {
                await(ownerHoldsLock);
                attemptAdmin.countDown();
                awaitBlocked(adminPid.get());
                assertThat(adminAttempt.isDone()).isFalse();
                releaseOwner.countDown();
                ownerWrite.get(15, TimeUnit.SECONDS);
                var result = adminAttempt.get(15, TimeUnit.SECONDS);
                var stored = profile();
                if (archive) {
                    assertThat(result.error()).isEqualTo(ErrorCode.SHOP_NOT_FOUND);
                    assertThat(stored.get("status")).isEqualTo("ARCHIVED");
                    assertThat(stored.get("archived_at")).isNotNull();
                    assertThat(stored.get("archived_reason")).isEqualTo("Owner closed shop");
                    assertAudit("SHOP_ARCHIVED", 1);
                    assertAudit("SHOP_INACTIVATED", 0);
                    assertNotifications(0);
                } else {
                    assertThat(result.error()).isNull();
                    assertThat(result.response().name()).isEqualTo("New name");
                    assertThat(stored.get("name")).isEqualTo("New name");
                    assertThat(stored.get("address")).isEqualTo("New address");
                    assertThat(stored.get("status")).isEqualTo("INACTIVE");
                    assertThat(stored.get("inactive_reason")).isEqualTo(ADMIN_REASON);
                    assertAudit("SHOP_UPDATED", 1);
                    assertAudit("SHOP_INACTIVATED", 1);
                    assertNotifications(1);
                }
                assertThat(stored.get("logo_public_id")).isEqualTo("old-logo");
                assertThat(stored.get("logo_url")).isEqualTo("https://media.test/old");
            } finally {
                attemptAdmin.countDown();
                releaseOwner.countDown();
                ownerWrite.cancel(true);
                adminAttempt.cancel(true);
            }
        }
    }

    @Test
    void profileEditPreservesLogoCommittedWhileItsShopWasAlreadyManaged() throws Exception {
        // A separate DB writer represents the media reference commit; no provider calls are made.
        var ownerReady = new CountDownLatch(1);
        var attemptOwner = new CountDownLatch(1);
        var ownerPid = new AtomicInteger();
        try (var pool = Executors.newSingleThreadExecutor(); var media = schemaConnection()) {
            media.setAutoCommit(false);
            var ownerWrite = pool.submit(() -> tx(() -> {
                ownerPid.set(backendPid());
                assertActiveManagedShop();
                ownerReady.countDown();
                await(attemptOwner);
                return ownerWrite(false);
            }));
            try {
                await(ownerReady);
                try (var update = media.prepareStatement("update shops set logo_url=?,logo_public_id=? where id=?")) {
                    update.setString(1, "https://media.test/new");
                    update.setString(2, "new-logo");
                    update.setLong(3, shopId);
                    assertThat(update.executeUpdate()).isEqualTo(1);
                }
                attemptOwner.countDown();
                awaitBlocked(ownerPid.get());
                media.commit();
                assertThat(ownerWrite.get(15, TimeUnit.SECONDS).logoUrl()).isEqualTo("https://media.test/new");
                var stored = profile();
                assertThat(stored.get("name")).isEqualTo("New name");
                assertThat(stored.get("logo_url")).isEqualTo("https://media.test/new");
                assertThat(stored.get("logo_public_id")).isEqualTo("new-logo");
                assertAudit("SHOP_UPDATED", 1);
                assertNotifications(0);
            } finally {
                attemptOwner.countDown();
                media.rollback();
                ownerWrite.cancel(true);
            }
        }
    }

    @Test
    void failedOwnerAuditRollsBackProfileWrite() {
        jdbc.execute("alter table audit_logs add constraint test_reject_owner_audit check (shop_id <> " + shopId + ")");
        try {
            assertThatThrownBy(() -> ownerWrite(false)).isInstanceOf(DataIntegrityViolationException.class);
            assertThat(profile().get("name")).isEqualTo("Old name");
            assertAudit("SHOP_UPDATED", 0);
            assertNotifications(0);
        } finally {
            jdbc.execute("alter table audit_logs drop constraint test_reject_owner_audit");
        }
    }

    @Test
    void failedStatusNotificationRollsBackStatusReasonAndAudit() {
        jdbc.execute("alter table notification_events add constraint test_reject_status_event check (shop_id <> " + shopId + ")");
        try {
            assertThatThrownBy(this::suspend).isInstanceOf(DataIntegrityViolationException.class);
            assertThat(profile().get("status")).isEqualTo("ACTIVE");
            assertThat(profile().get("inactive_reason")).isNull();
            assertAudit("SHOP_INACTIVATED", 0);
            assertNotifications(0);
        } finally {
            jdbc.execute("alter table notification_events drop constraint test_reject_status_event");
        }
    }

    private ShopResponse ownerWrite(boolean archive) {
        if (archive) {
            shops.archiveById(owner, Long.toString(shopId), new ArchiveShopRequest("Owner closed shop"));
            return null;
        }
        return shops.updateById(owner, Long.toString(shopId), new ShopUpdateRequest("New name", null, null, "New address"));
    }

    private ShopResponse suspend() {
        return shops.updateStatus(admin, Long.toString(shopId), new ShopStatusUpdateRequest(ShopStatus.INACTIVE, ADMIN_REASON));
    }

    private <T> T tx(Supplier<T> operation) {
        return new TransactionTemplate(transactions).execute(status -> {
            jdbc.execute("set local statement_timeout='10s'");
            return operation.get();
        });
    }

    private Attempt attempt(Supplier<ShopResponse> operation) {
        try {
            return new Attempt(operation.get(), null, null);
        } catch (BusinessException error) {
            return new Attempt(null, error.getErrorCode(), error.getDetails().isEmpty() ? null : error.getDetails().getFirst().issue());
        }
    }

    private int backendPid() { return jdbc.queryForObject("select pg_backend_pid()", Integer.class); }

    private void assertActiveManagedShop() {
        assertThat(entityManager.find(Shop.class, shopId).getStatus()).isEqualTo(ShopStatus.ACTIVE);
    }

    private Map<String, Object> profile() { return jdbc.queryForMap("select * from shops where id=?", shopId); }

    private void assertAudit(String action, long expected) {
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where shop_id=? and action=?", Long.class, shopId, action))
                .isEqualTo(expected);
    }

    private void assertNotifications(long expected) {
        assertThat(jdbc.queryForObject("select count(*) from notification_events where shop_id=?", Long.class, shopId))
                .isEqualTo(expected);
        assertThat(jdbc.queryForObject("""
                select count(*) from notification_recipients r join notification_events e on e.id=r.notification_event_id where e.shop_id=?
                """, Long.class, shopId)).isEqualTo(expected);
    }

    private long user(VerifiedFirebaseToken token, String role) {
        long id = jdbc.queryForObject("insert into users(display_name,system_role) values ('Shop tester',?) returning id", Long.class, role);
        jdbc.update("insert into auth_identities(user_id,provider,provider_subject) values (?,'FIREBASE',?)", id, token.uid());
        return id;
    }

    private static VerifiedFirebaseToken token() {
        return new VerifiedFirebaseToken("shop-race-" + UUID.randomUUID(), null, true, null, null, null);
    }

    private static Stream<Arguments> operationCases() {
        return Stream.of(false, true).flatMap(archive -> Stream.of(Arguments.of(archive, false), Arguments.of(archive, true)));
    }

    private static void await(CountDownLatch latch) {
        try {
            assertThat(latch.await(15, TimeUnit.SECONDS)).as("transaction coordination").isTrue();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted transaction coordination", error);
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
        if (schemaCreated && SCHEMA.matches("core_shop_race_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("drop schema \"" + SCHEMA + "\" cascade");
            }
        }
    }

    private record Attempt(ShopResponse response, ErrorCode error, String reason) { }

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
    }
}
