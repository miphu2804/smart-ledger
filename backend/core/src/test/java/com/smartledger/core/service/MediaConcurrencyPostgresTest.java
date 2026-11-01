package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.dto.request.ShopUpdateRequest;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.dto.response.ShopResponse;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.MediaAssetType;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import jakarta.persistence.EntityManagerFactory;
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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.EntityManagerHolder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate",
        "smartledger.rate-limit.enabled=true"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({com.smartledger.core.ratelimit.UserRateLimitService.class, com.smartledger.core.repository.UserRateLimitRepository.class, MediaUploadKeyRepository.class, MediaIdempotencyReplay.class, MediaCleanupJobServiceImpl.class,
        MediaWriteTransactionService.class, AuditLogServiceImpl.class, AuthSessionServiceImpl.class,
        ShopServiceImpl.class, NotificationEventServiceImpl.class, MediaConcurrencyPostgresTest.Config.class})
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
    @Autowired EntityManagerFactory entityManagerFactory;
    @Autowired AuthSessionService sessions;
    @Autowired ShopService shopProfiles;
    long userId;
    String uid;

    @Test void concurrentAvatarCommitsDoNotDeadlockOrExceedSharedQuota() throws Exception {
        var accepted=new java.util.concurrent.atomic.AtomicInteger();
        try(var pool=Executors.newFixedThreadPool(12)) {
            var tasks=java.util.stream.IntStream.range(0,18).mapToObj(n->pool.submit(()->{
                try {
                    var pending=reserve("concurrent-quota-"+n,"concurrent-asset-"+n);
                    writes.saveAvatar(users.findById(userId).orElseThrow(),pending,new StoredMedia("concurrent-asset-"+n,"url"));
                    accepted.incrementAndGet();
                } catch(BusinessException error) { assertThat(error.getErrorCode()).isEqualTo(ErrorCode.RATE_LIMITED); }
            })).toList();
            for(var task:tasks) task.get(20,TimeUnit.SECONDS);
        }
        assertThat(accepted.get()).isEqualTo(10);
        assertThat(jdbc.queryForObject("SELECT sum(successful_count) FROM user_rate_limit_windows WHERE user_id=?",Integer.class,userId)).isEqualTo(10);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE actor_user_id=?",Integer.class,userId)).isEqualTo(10);
    }

    @Test void replayRemainsFreeAfterTenCommittedUploadsAndConflictStaysConflict() {
        for(int n=0;n<10;n++) {
            var pending=reserve("quota-"+n,"quota-asset-"+n);
            writes.saveAvatar(users.findById(userId).orElseThrow(),pending,new StoredMedia("quota-asset-"+n,"url"));
        }
        assertThat(replay.reserve(null,userId,"USER_AVATAR_UPLOAD","quota-0",
                new MediaUploadRequest("quota-asset-0","hash"),MediaWriteTransactionService.SavedAvatar.class).isReplay()).isTrue();
        expectCode(()->reserve("quota-0","changed-asset"),ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
        expectCode(()->reserve("quota-new","new-asset"),ErrorCode.RATE_LIMITED);
        assertThat(jdbc.queryForObject("SELECT sum(successful_count) FROM user_rate_limit_windows WHERE user_id=?",Integer.class,userId)).isEqualTo(10);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE actor_user_id=?",Integer.class,userId)).isEqualTo(10);
        assertThat(keys.findOptional("USER:"+userId,"USER_AVATAR_UPLOAD","quota-new")).isEmpty();
        verifyNoInteractions(storage);
    }

    @Test void providerFailureReleasesBothLeasesAndRetryCountsOnlyCommittedWrite() {
        var reader=mock(MultipartImageReader.class);
        var ids=mock(MediaPublicIdFactory.class);
        var file=mock(org.springframework.web.multipart.MultipartFile.class);
        var image=new ValidatedImage(new byte[]{1},"image/png",1,1,"hash");
        when(reader.read(file)).thenReturn(image);
        when(ids.createAvatar(userId,"provider-retry","hash")).thenReturn("provider-retry-asset");
        when(storage.upload(any())).thenThrow(new BusinessException(ErrorCode.MEDIA_UNAVAILABLE));
        // Quota, idempotency and final writes use real PostgreSQL; provider calls remain mocked.
        var identityLookup=mock(AuthIdentityRepository.class);
        when(identityLookup.findWithUserByProviderSubject(uid)).thenReturn(Optional.of(
                com.smartledger.core.entity.AuthIdentity.forFirebase(users.findById(userId).orElseThrow(),uid)));
        var service=new MediaServiceImpl(shopProfiles,mock(ProductRepository.class),identityLookup,reader,ids,storage,replay,writes);
        var token=new VerifiedFirebaseToken(uid,null,true,null,null,null);
        expectCode(()->service.uploadAvatar(token,"provider-retry",file),ErrorCode.MEDIA_UNAVAILABLE);
        assertThat(keys.findOptional("USER:"+userId,"USER_AVATAR_UPLOAD","provider-retry")).isEmpty();
        assertThat(jdbc.queryForObject("SELECT sum(successful_count) FROM user_rate_limit_windows WHERE user_id=?",Integer.class,userId)).isZero();
        doReturn(new StoredMedia("provider-retry-asset","url")).when(storage).upload(any());
        service.uploadAvatar(token,"provider-retry",file);
        assertThat(jdbc.queryForObject("SELECT sum(successful_count) FROM user_rate_limit_windows WHERE user_id=?",Integer.class,userId)).isEqualTo(1);
    }

    @Test void shopQuotaCommitsWithShopAndAuditAndRollsBackOnLateFailure() {
        var token=new VerifiedFirebaseToken(uid,null,true,null,null,null);
        var request=new com.smartledger.core.dto.request.ShopCreateRequest("Quota shop","IT",null,null);
        assertThatThrownBy(()->new TransactionTemplate(tx).execute(s->{
            shopProfiles.create(token,request); throw new IllegalStateException("late failure");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM shops WHERE owner_id=?",Integer.class,userId)).isZero();
        for(int n=0;n<5;n++) shopProfiles.create(token,request);
        expectCode(()->shopProfiles.create(token,request),ErrorCode.RATE_LIMITED);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM shops WHERE owner_id=?",Integer.class,userId)).isEqualTo(5);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE actor_user_id=?",Integer.class,userId)).isEqualTo(5);
    }

    @DynamicPropertySource static void schema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }

    @BeforeEach void seed() {
        reset(storage);
        userId = jdbc.queryForObject("insert into users(display_name,avatar_url) values ('Owner','https://firebase.test/avatar') returning id", Long.class);
        uid = "media-owner-" + UUID.randomUUID();
        jdbc.update("insert into auth_identities(user_id,provider,provider_subject) values (?,'FIREBASE',?)", userId, uid);
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

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void managedAvatarWriterPreservesSessionProfileCommittedDuringUpload(boolean delete) throws Exception {
        jdbc.update("update users set avatar_public_id=? where id=?", "old-avatar/" + userId, userId);
        var pending = delete ? null : reserve("managed-profile", "new-avatar/" + userId);
        withRequestContext(() -> {
            UserAccount stale = users.findById(userId).orElseThrow();
            commitElsewhere(() -> sessions.openSession(token(true), null));
            assertThat(stale.getEmail()).isNull();
            if (delete) writes.clearAvatar(stale);
            else {
                var saved = writes.saveAvatar(stale, pending, new StoredMedia("new-avatar/" + userId, "url"));
                assertThat(saved.email()).isEqualTo("updated@example.test");
            }
            return null;
        });
        assertThat(jdbc.queryForMap("select email,phone,avatar_url,status,system_role from users where id=?", userId))
                .containsEntry("email", "updated@example.test").containsEntry("phone", "+84900000001")
                .containsEntry("avatar_url", "https://firebase.test/new").containsEntry("status", "ACTIVE")
                .containsEntry("system_role", "OWNER");
        assertAvatarWrite(delete, "old-avatar/" + userId);
    }

    @ParameterizedTest
    @CsvSource({"false,DISABLED", "true,DISABLED", "false,DEMOTED", "true,DEMOTED"})
    void managedAvatarWriterSeesLatestStatusAndRole(boolean delete, String change) throws Exception {
        jdbc.update("update users set system_role='ADMIN',avatar_public_id=? where id=?", "old-avatar/" + userId, userId);
        var pending = delete ? null : reserve("managed-status", "new-avatar/" + userId);
        withRequestContext(() -> {
            UserAccount stale = users.findById(userId).orElseThrow();
            commitElsewhere(() -> jdbc.update(change.equals("DISABLED")
                    ? "update users set status='DISABLED' where id=?"
                    : "update users set system_role='OWNER' where id=?", userId));
            if (change.equals("DISABLED")) {
                expectCode(() -> {
                    if (delete) writes.clearAvatar(stale);
                    else writes.saveAvatar(stale, pending, new StoredMedia("new-avatar/" + userId, "url"));
                }, ErrorCode.ACCOUNT_DISABLED);
            } else {
                if (delete) writes.clearAvatar(stale);
                else writes.saveAvatar(stale, pending, new StoredMedia("new-avatar/" + userId, "url"));
            }
            return null;
        });
        if (change.equals("DISABLED")) {
            assertThat(jdbc.queryForObject("select status from users where id=?", String.class, userId)).isEqualTo("DISABLED");
            assertThat(jdbc.queryForObject("select avatar_public_id from users where id=?", String.class, userId))
                    .isEqualTo("old-avatar/" + userId);
            assertThat(jdbc.queryForObject("select count(*) from audit_logs where actor_user_id=?", Long.class, userId)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from media_cleanup_jobs where public_id=?", Long.class,
                    "old-avatar/" + userId)).isZero();
            if (!delete) assertThat(keys.findOptional("USER:" + userId, "USER_AVATAR_UPLOAD", "managed-status")
                    .orElseThrow().responseBody()).isNull();
        } else {
            assertThat(jdbc.queryForObject("select system_role from users where id=?", String.class, userId)).isEqualTo("OWNER");
            assertThat(jdbc.queryForObject("select actor_role from audit_logs where actor_user_id=?", String.class, userId))
                    .isEqualTo("OWNER");
            assertAvatarWrite(delete, "old-avatar/" + userId);
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void managedAvatarWriterCleansLatestReferenceNotPreloadedReference(boolean delete) throws Exception {
        var pending = delete ? null : reserve("latest-avatar", "new-avatar/" + userId);
        withRequestContext(() -> {
            UserAccount stale = users.findById(userId).orElseThrow();
            assertThat(stale.getAvatarPublicId()).isNull();
            commitElsewhere(() -> writes.saveAvatar(users.findById(userId).orElseThrow(),
                    reserve("competing-avatar", "latest-avatar/" + userId),
                    new StoredMedia("latest-avatar/" + userId, "url")));
            if (delete) writes.clearAvatar(stale);
            else writes.saveAvatar(stale, pending, new StoredMedia("new-avatar/" + userId, "url"));
            return null;
        });
        assertAvatarWrite(delete, "latest-avatar/" + userId);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where actor_user_id=?", Long.class, userId)).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void sessionAfterAvatarWritePreservesMediaReference(boolean delete) throws Exception {
        jdbc.update("update users set avatar_public_id=? where id=?", "old-avatar/" + userId, userId);
        var pending = delete ? null : reserve("avatar-first", "new-avatar/" + userId);
        withRequestContext(() -> {
            users.findById(userId).orElseThrow(); // Session will also encounter an already managed user.
            commitElsewhere(() -> {
                UserAccount user = users.findById(userId).orElseThrow();
                if (delete) writes.clearAvatar(user);
                else writes.saveAvatar(user, pending, new StoredMedia("new-avatar/" + userId, "url"));
                return null;
            });
            sessions.openSession(token(true), null);
            return null;
        });
        assertThat(jdbc.queryForObject("select email from users where id=?", String.class, userId))
                .isEqualTo("updated@example.test");
        assertAvatarWrite(delete, "old-avatar/" + userId);
    }

    @ParameterizedTest
    @CsvSource({"false,false", "true,false", "false,true", "true,true"})
    void managedLogoAndProfileWritersPreserveEachOthersChanges(boolean delete, boolean mediaFirst) throws Exception {
        long shopId = mediaShop();
        var pending = delete ? null : logoReservation(shopId, "profile-logo");
        withRequestContext(() -> {
            Shop stale = shops.findById(shopId).orElseThrow();
            if (mediaFirst) {
                commitElsewhere(() -> {
                    changeLogo(shops.findById(shopId).orElseThrow(), pending, delete);
                    return null;
                });
                shopProfiles.updateById(token(false), Long.toString(shopId), new ShopUpdateRequest("New name", null, "+84901", null));
            } else {
                commitElsewhere(() -> shopProfiles.updateById(token(false), Long.toString(shopId),
                        new ShopUpdateRequest("New name", null, "+84901", null)));
                assertThat(stale.getName()).isEqualTo("Media Shop");
                changeLogo(stale, pending, delete);
            }
            return null;
        });
        assertThat(jdbc.queryForMap("select name,phone,status from shops where id=?", shopId))
                .containsEntry("name", "New name").containsEntry("phone", "+84901").containsEntry("status", "ACTIVE");
        assertThat(jdbc.queryForObject("select logo_public_id from shops where id=?", String.class, shopId))
                .isEqualTo(delete ? null : "new-logo/" + shopId);
        assertThat(jdbc.queryForObject("select count(*) from media_cleanup_jobs where public_id=?", Long.class,
                "old-logo/" + shopId)).isEqualTo(1);
    }

    @ParameterizedTest
    @CsvSource({"false,false,INACTIVE", "true,false,INACTIVE", "false,true,INACTIVE", "true,true,INACTIVE",
            "false,false,ARCHIVED", "true,false,ARCHIVED", "false,true,ARCHIVED", "true,true,ARCHIVED"})
    void managedShopMediaWriterRejectsCommittedLifecycleChange(boolean delete, boolean productImage, String state) throws Exception {
        long shopId = mediaShop();
        long productId = mediaProduct(shopId);
        var logoPending = delete || productImage ? null : logoReservation(shopId, "inactive-logo");
        var productPending = delete || !productImage ? null : productReservation(shopId, "inactive-product");
        withRequestContext(() -> {
            Shop stale = shops.findById(shopId).orElseThrow();
            commitElsewhere(() -> {
                Shop latest = shops.findLockedByIdAndOwnerId(shopId, userId).orElseThrow();
                if (state.equals("ARCHIVED")) latest.archive("Support review");
                else latest.deactivate("Support review");
                return null;
            });
            expectCode(() -> {
                if (productImage) {
                    if (delete) writes.clearProductImage(stale, productId);
                    else writes.saveProductImage(stale, productId, productPending, new StoredMedia("new-product/" + shopId, "url"));
                } else changeLogo(stale, logoPending, delete);
            }, state.equals("INACTIVE") ? ErrorCode.SHOP_INACTIVE : ErrorCode.SHOP_NOT_FOUND);
            return null;
        });
        assertThat(jdbc.queryForObject("select status from shops where id=?", String.class, shopId)).isEqualTo(state);
        assertThat(jdbc.queryForObject("select logo_public_id from shops where id=?", String.class, shopId)).isEqualTo("old-logo/" + shopId);
        assertThat(jdbc.queryForObject("select image_public_id from products where id=?", String.class, productId)).isEqualTo("old-product/" + shopId);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where shop_id=?", Long.class, shopId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from media_cleanup_jobs where public_id in (?,?)", Long.class,
                "old-logo/" + shopId, "old-product/" + shopId)).isZero();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void managedProductMediaWriterPreservesCommittedCatalogAndStock(boolean delete) throws Exception {
        long shopId = mediaShop();
        long productId = mediaProduct(shopId);
        long categoryId = jdbc.queryForObject("insert into categories(shop_id,name) values (?,'New category') returning id", Long.class, shopId);
        var pending = delete ? null : productReservation(shopId, "catalog-image");
        withRequestContext(() -> {
            Shop shop = shops.findById(shopId).orElseThrow();
            Product stale = requestEntityManager().find(Product.class, productId);
            commitElsewhere(() -> jdbc.update("""
                    update products set name='New product',selling_price_vnd=20000,cost_price_vnd=8000,
                        category_id=?,stock_quantity=9,low_stock_threshold=2,image_public_id=?,image_url='latest-url'
                    where id=?
                    """, categoryId, "latest-product/" + shopId, productId));
            assertThat(stale.getName()).isEqualTo("Old product");
            if (delete) writes.clearProductImage(shop, productId);
            else {
                var response = writes.saveProductImage(shop, productId, pending, new StoredMedia("new-product/" + shopId, "new-url"));
                assertThat(response.name()).isEqualTo("New product");
                assertThat(response.stockQuantity()).isEqualByComparingTo("9");
            }
            return null;
        });
        assertThat(jdbc.queryForMap("select name,selling_price_vnd,cost_price_vnd,category_id from products where id=?", productId))
                .containsEntry("name", "New product").containsEntry("selling_price_vnd", 20000L)
                .containsEntry("cost_price_vnd", 8000L).containsEntry("category_id", categoryId);
        assertThat(jdbc.queryForObject("select stock_quantity from products where id=?", java.math.BigDecimal.class, productId))
                .isEqualByComparingTo("9");
        assertThat(jdbc.queryForObject("select low_stock_threshold from products where id=?", java.math.BigDecimal.class, productId))
                .isEqualByComparingTo("2");
        assertThat(jdbc.queryForObject("select count(*) from media_cleanup_jobs where public_id=?", Long.class,
                "latest-product/" + shopId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from media_cleanup_jobs where public_id=?", Long.class,
                "old-product/" + shopId)).isZero();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void managedProductMediaWriterRejectsArchivedProduct(boolean delete) throws Exception {
        long shopId = mediaShop();
        long productId = mediaProduct(shopId);
        var pending = delete ? null : productReservation(shopId, "archived-image");
        withRequestContext(() -> {
            Shop shop = shops.findById(shopId).orElseThrow();
            requestEntityManager().find(Product.class, productId);
            commitElsewhere(() -> jdbc.update("update products set status='ARCHIVED',archived_at=CURRENT_TIMESTAMP,archived_by_user_id=? where id=?", userId, productId));
            expectCode(() -> {
                if (delete) writes.clearProductImage(shop, productId);
                else writes.saveProductImage(shop, productId, pending, new StoredMedia("new-product/" + shopId, "url"));
            }, ErrorCode.PRODUCT_NOT_FOUND);
            return null;
        });
        assertThat(jdbc.queryForObject("select status from products where id=?", String.class, productId)).isEqualTo("ARCHIVED");
        assertThat(jdbc.queryForObject("select image_public_id from products where id=?", String.class, productId)).isEqualTo("old-product/" + shopId);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where shop_id=?", Long.class, shopId)).isZero();
    }

    // Mirrors OSIV: one request-bound EntityManager survives reads and independent commits,
    // then is reused by the real Spring writer transaction. No DB transaction spans upload.
    private <T> T withRequestContext(Callable<T> action) throws Exception {
        assertThat(TransactionSynchronizationManager.hasResource(entityManagerFactory)).isFalse();
        var entityManager = entityManagerFactory.createEntityManager();
        TransactionSynchronizationManager.bindResource(entityManagerFactory, new EntityManagerHolder(entityManager));
        try { return action.call(); }
        finally {
            TransactionSynchronizationManager.unbindResource(entityManagerFactory);
            entityManager.close();
        }
    }

    private jakarta.persistence.EntityManager requestEntityManager() {
        return ((EntityManagerHolder) TransactionSynchronizationManager.getResource(entityManagerFactory)).getEntityManager();
    }

    private <T> T commitElsewhere(Callable<T> action) throws Exception {
        try (var pool = Executors.newSingleThreadExecutor()) {
            return pool.submit(() -> new TransactionTemplate(tx).execute(status -> {
                jdbc.execute("set local statement_timeout='10s'");
                try { return action.call(); }
                catch (Exception error) { throw new IllegalStateException(error); }
            })).get(15, TimeUnit.SECONDS);
        }
    }

    private VerifiedFirebaseToken token(boolean changedClaims) {
        return new VerifiedFirebaseToken(uid, changedClaims ? "updated@example.test" : null, true,
                changedClaims ? "+84900000001" : null, null, changedClaims ? "https://firebase.test/new" : null);
    }

    private void assertAvatarWrite(boolean delete, String replacedPublicId) {
        assertThat(jdbc.queryForObject("select avatar_public_id from users where id=?", String.class, userId))
                .isEqualTo(delete ? null : "new-avatar/" + userId);
        assertThat(jdbc.queryForObject("select count(*) from media_cleanup_jobs where public_id=?", Long.class, replacedPublicId))
                .isEqualTo(1);
    }

    private long mediaShop() {
        long shopId = jdbc.queryForObject("""
                insert into shops(owner_id,name,industry,logo_url,logo_public_id)
                values (?,'Media Shop','Retail','old-url',?) returning id
                """, Long.class, userId, "old-logo/" + userId);
        jdbc.update("update shops set logo_public_id=? where id=?", "old-logo/" + shopId, shopId);
        return shopId;
    }

    private long mediaProduct(long shopId) {
        return jdbc.queryForObject("""
                insert into products(shop_id,name,unit,selling_price_vnd,tracked,stock_quantity,image_url,image_public_id)
                values (?,'Old product','item',10000,true,5,'old-url',?) returning id
                """, Long.class, shopId, "old-product/" + shopId);
    }

    private MediaIdempotencyReplay.Reservation<ShopResponse> logoReservation(long shopId, String key) {
        return replay.reserve(shopId, userId, "SHOP_LOGO_UPLOAD", key,
                new MediaUploadRequest("new-logo/" + shopId, "hash"), ShopResponse.class);
    }

    private MediaIdempotencyReplay.Reservation<ProductResponse> productReservation(long shopId, String key) {
        return replay.reserve(shopId, userId, "PRODUCT_IMAGE_UPLOAD", key,
                new MediaUploadRequest("new-product/" + shopId, "hash"), ProductResponse.class);
    }

    private void changeLogo(Shop shop, MediaIdempotencyReplay.Reservation<ShopResponse> pending, boolean delete) {
        if (delete) writes.clearShopLogo(shop);
        else writes.saveShopLogo(shop, pending, new StoredMedia("new-logo/" + shop.getId(), "new-url"));
    }

    private void expectCode(org.assertj.core.api.ThrowableAssert.ThrowingCallable action, ErrorCode code) {
        assertThatThrownBy(action).isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.getErrorCode()).isEqualTo(code));
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
        @Bean AdminAccessAuditService adminAccessAuditService() { return mock(AdminAccessAuditService.class); }
        @Bean DataSource dataSource() throws SQLException {
            try (var connection = connection(); var sql = connection.createStatement()) { sql.execute("create schema \"" + SCHEMA + "\""); created = true; }
            var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"), System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
            var properties = new Properties(); properties.setProperty("currentSchema", SCHEMA); source.setConnectionProperties(properties); return source;
        }
    }
}
