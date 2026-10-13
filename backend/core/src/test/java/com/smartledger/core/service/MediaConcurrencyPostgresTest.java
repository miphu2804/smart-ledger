package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.enums.MediaAssetType;
import com.smartledger.core.media.*;
import com.smartledger.core.repository.*;
import com.smartledger.core.service.impl.*;
import java.sql.*;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;

@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({MediaUploadKeyRepository.class, MediaIdempotencyReplay.class, MediaCleanupJobServiceImpl.class,
        MediaWriteTransactionService.class, AuditLogServiceImpl.class, MediaConcurrencyPostgresTest.Config.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class MediaConcurrencyPostgresTest {
    private static final String SCHEMA = "core_media_test_" + UUID.randomUUID().toString().replace("-", "");
    private static boolean created;
    @Autowired JdbcTemplate jdbc;
    @Autowired MediaIdempotencyReplay replay;
    @Autowired MediaUploadKeyRepository keys;
    @Autowired MediaCleanupJobService jobs;
    @Autowired MediaWriteTransactionService writes;
    @Autowired UserAccountRepository users;
    @Autowired ShopRepository shops;
    @Autowired MediaStorage storage;
    @Autowired PlatformTransactionManager tx;
    long userId;

    @DynamicPropertySource static void schema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }

    @BeforeEach void seed() {
        reset(storage);
        userId = jdbc.queryForObject("insert into users(display_name,avatar_url) values ('Owner','https://firebase.test/avatar') returning id", Long.class);
    }

    @Test void simultaneousSameAvatarKeyOnlyReservesOnce() throws Exception {
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<Boolean> action = () -> {
                start.await(5, TimeUnit.SECONDS);
                try { reserve("parallel", "asset"); return true; }
                catch (com.smartledger.core.exception.BusinessException ex) {
                    assertThat(ex.getErrorCode()).isEqualTo(com.smartledger.core.enums.ErrorCode.MEDIA_UPLOAD_IN_PROGRESS);
                    return false;
                }
            };
            var first = pool.submit(action); var second = pool.submit(action); start.countDown();
            assertThat((first.get(10, TimeUnit.SECONDS) ? 1 : 0) + (second.get(10, TimeUnit.SECONDS) ? 1 : 0)).isEqualTo(1);
        }
    }

    @Test void expiredUploaderCannotReleaseOrWriteTheNewLease() {
        var old = reserve("lease", "lease-asset");
        jdbc.update("update media_upload_keys set expires_at=CURRENT_TIMESTAMP - interval '1 second' where scope_key=?", "USER:" + userId);
        var current = reserve("lease", "lease-asset");
        replay.release(null, userId, "USER_AVATAR_UPLOAD", old);
        assertThat(keys.findOptional("USER:" + userId, "USER_AVATAR_UPLOAD", "lease").orElseThrow().leaseToken())
                .isEqualTo(current.leaseToken());
        UserAccount user = users.findById(userId).orElseThrow();
        assertThatThrownBy(() -> writes.saveAvatar(user, old, new StoredMedia("lease-asset", "url")))
                .isInstanceOf(com.smartledger.core.exception.BusinessException.class);
        assertThat(jdbc.queryForObject("select avatar_public_id from users where id=?", String.class, userId)).isNull();
        writes.saveAvatar(user, current, new StoredMedia("lease-asset", "url"));
        assertThat(replay.reserve(null, userId, "USER_AVATAR_UPLOAD", "lease", new MediaUploadRequest("lease-asset", "hash"),
                MediaWriteTransactionService.SavedAvatar.class).isReplay()).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where actor_user_id=?", Integer.class, userId)).isEqualTo(1);
    }

    @Test void avatarAuditAndReferenceRollbackTogetherAndKeepPendingKey() {
        var reservation = reserve("rollback", "new-asset");
        jdbc.update("update users set avatar_public_id='old-asset' where id=?", userId);
        UserAccount user = users.findById(userId).orElseThrow();
        assertThatThrownBy(() -> new TransactionTemplate(tx).execute(status -> {
            writes.saveAvatar(user, reservation, new StoredMedia("new-asset", "url"));
            throw new IllegalStateException("late failure");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("select avatar_public_id from users where id=?", String.class, userId)).isEqualTo("old-asset");
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where actor_user_id=?", Integer.class, userId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from media_cleanup_jobs where public_id='old-asset'", Integer.class)).isZero();
        assertThat(keys.findOptional("USER:" + userId, "USER_AVATAR_UPLOAD", "rollback").orElseThrow().responseBody()).isNull();
    }

    @Test void twoWorkersSkipTheSameLockedJobAndRetryCannotResurrectIt() throws Exception {
        String publicId = "cleanup/" + userId;
        jobs.enqueue(publicId, MediaAssetType.USER_AVATAR);
        long id = jobId(publicId);
        var entered = new CountDownLatch(1); var finish = new CountDownLatch(1);
        doAnswer(call -> { entered.countDown(); if (!finish.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("timeout"); return null; })
                .when(storage).delete(publicId, MediaDeliveryType.AUTHENTICATED);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> jobs.process(id));
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            try { pool.submit(() -> jobs.process(id)).get(3, TimeUnit.SECONDS); }
            finally { finish.countDown(); }
            first.get(5, TimeUnit.SECONDS);
        }
        jobs.retry(id, "late failure", OffsetDateTime.now().plusMinutes(1));
        assertThat(jdbc.queryForObject("select status from media_cleanup_jobs where id=?", String.class, id)).isEqualTo("COMPLETED");
        verify(storage, times(1)).delete(publicId, MediaDeliveryType.AUTHENTICATED);
    }

    @Test void cleanupNeverDeletesAnAttachedAssetOrAnActiveUpload() {
        String publicId = "attached/" + userId;
        jdbc.update("update users set avatar_public_id=? where id=?", publicId, userId);
        jobs.enqueue(publicId, MediaAssetType.USER_AVATAR); jobs.process(jobId(publicId));
        var pending = reserve("cleanup-pending", "pending/" + userId);
        jobs.enqueue("pending/" + userId, MediaAssetType.USER_AVATAR); jobs.process(jobId("pending/" + userId));
        verifyNoInteractions(storage);
        assertThat(jdbc.queryForObject("select status from media_cleanup_jobs where public_id=?", String.class, "pending/" + userId)).isEqualTo("PENDING");
        replay.release(null, userId, "USER_AVATAR_UPLOAD", pending);
        jobs.process(jobId("pending/" + userId));
        verify(storage).delete("pending/" + userId, MediaDeliveryType.AUTHENTICATED);
    }

    @Test void finalAvatarWriteSeesDisableCommittedWhileProviderWasUploading() {
        var reservation = reserve("disabled", "disabled/" + userId);
        UserAccount beforeUpload = users.findById(userId).orElseThrow();
        jdbc.update("update users set status='DISABLED' where id=?", userId);
        assertThatThrownBy(() -> writes.saveAvatar(beforeUpload, reservation, new StoredMedia("disabled/" + userId, "url")))
                .isInstanceOfSatisfying(com.smartledger.core.exception.BusinessException.class,
                        ex -> assertThat(ex.getErrorCode()).isEqualTo(com.smartledger.core.enums.ErrorCode.ACCOUNT_DISABLED));
        assertThat(jdbc.queryForObject("select avatar_public_id from users where id=?", String.class, userId)).isNull();
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where actor_user_id=?", Integer.class, userId)).isZero();
    }

    @Test void finalLogoWriteSeesInactivationCommittedWhileProviderWasUploading() {
        long shopId = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Media Shop','Retail') returning id", Long.class, userId);
        // The caller holds the detached pre-upload identity; the writer must reload status under lock.
        var detached = shops.findById(shopId).orElseThrow();
        var reservation = replay.reserve(shopId, userId, "SHOP_LOGO_UPLOAD", "inactive",
                new MediaUploadRequest("inactive/" + shopId, "hash"), com.smartledger.core.dto.response.ShopResponse.class);
        jdbc.update("update shops set status='INACTIVE',inactive_reason='Support review' where id=?", shopId);
        assertThatThrownBy(() -> writes.saveShopLogo(detached, reservation, new StoredMedia("inactive/" + shopId, "url")))
                .isInstanceOfSatisfying(com.smartledger.core.exception.BusinessException.class,
                        ex -> assertThat(ex.getErrorCode()).isEqualTo(com.smartledger.core.enums.ErrorCode.SHOP_INACTIVE));
        assertThat(jdbc.queryForObject("select logo_public_id from shops where id=?", String.class, shopId)).isNull();
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where shop_id=?", Integer.class, shopId)).isZero();
    }

    private MediaIdempotencyReplay.Reservation<MediaWriteTransactionService.SavedAvatar> reserve(String key, String publicId) {
        return replay.reserve(null, userId, "USER_AVATAR_UPLOAD", key, new MediaUploadRequest(publicId, "hash"),
                MediaWriteTransactionService.SavedAvatar.class);
    }
    private long jobId(String publicId) {
        return jdbc.queryForObject("select id from media_cleanup_jobs where public_id=?", Long.class, publicId);
    }
    @AfterAll static void cleanup() throws SQLException {
        if (created && SCHEMA.matches("core_media_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var sql = connection.createStatement()) { sql.execute("drop schema \"" + SCHEMA + "\" cascade"); }
        }
    }
    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"), System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }
    @TestConfiguration(proxyBeanMethods = false) static class Config {
        @Bean MediaStorage mediaStorage() { return mock(MediaStorage.class); }
        @Bean ObjectMapper objectMapper() { return new ObjectMapper().findAndRegisterModules(); }
        @Bean DataSource dataSource() throws SQLException {
            try (var connection = connection(); var sql = connection.createStatement()) { sql.execute("create schema \"" + SCHEMA + "\""); created = true; }
            var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"), System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
            var properties = new Properties(); properties.setProperty("currentSchema", SCHEMA); source.setConnectionProperties(properties); return source;
        }
    }
}
