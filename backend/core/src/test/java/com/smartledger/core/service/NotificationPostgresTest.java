package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.dto.request.*;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.entity.*;
import com.smartledger.core.enums.*;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.*;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.*;
import java.math.BigDecimal;
import java.sql.*;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.*;

/** Real services and PostgreSQL locks in an isolated schema migrated by the actual V1–V15 Flyway scripts. */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({NotificationEventServiceImpl.class, NotificationServiceImpl.class,
        ShopServiceImpl.class, ProductServiceImpl.class, SaleDraftServiceImpl.class, SaleVoidServiceImpl.class,
        AuditLogServiceImpl.class, AdminAccessAuditService.class, IdempotencyServiceImpl.class,
        IdempotencyKeyRepository.class, NotificationPostgresTest.Config.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class NotificationPostgresTest {
    private static final String SCHEMA = "core_notification_test_" + UUID.randomUUID().toString().replace("-", "");
    private static boolean created;
    @Autowired ShopService shops;
    @Autowired ProductService products;
    @Autowired SaleDraftService drafts;
    @Autowired SaleVoidService voids;
    @Autowired NotificationService inbox;
    @Autowired UserAccountRepository users;
    @Autowired AuthIdentityRepository identities;
    @Autowired JdbcTemplate jdbc;
    VerifiedFirebaseToken owner, other, admin;
    long ownerId, otherId;
    String shopId;

    @DynamicPropertySource static void schema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }

    @BeforeEach void seed() {
        owner = token(); other = token(); admin = token();
        ownerId = user(owner, SystemRole.OWNER);
        otherId = user(other, SystemRole.OWNER);
        user(admin, SystemRole.ADMIN);
        shopId = shops.create(owner, new ShopCreateRequest("Test shop", "Retail", null, null)).id().toString();
    }

    @Test void stockAlertsCloseAndReopenWithoutSpammingOrChangingReadState() {
        var product = product("8", "5");
        confirm(product.id(), "3");
        long low = inbox.list(owner, null, null, false, 0, 20).items().getFirst().id();
        inbox.markRead(owner, List.of(low));
        OffsetDateTime read = jdbc.queryForObject("select read_at from notification_recipients where notification_event_id=?",
                OffsetDateTime.class, low);
        confirm(product.id(), "1");
        assertThat(count("LOW_STOCK")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select resolved_at from notification_events where id=?", OffsetDateTime.class, low)).isNull();
        confirm(product.id(), "4");
        assertThat(count("OUT_OF_STOCK")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select resolved_at from notification_events where id=?", OffsetDateTime.class, low)).isNotNull();
        products.stockIn(owner, shopId, product.id().toString(), "restock", new ProductStockInRequest(BigDecimal.TEN, null));
        assertThat(open()).isZero();
        confirm(product.id(), "5");
        assertThat(count("LOW_STOCK")).isEqualTo(2);
        assertThat(open()).isEqualTo(1);
        inbox.markRead(owner, List.of(low));
        assertThat(jdbc.queryForObject("select read_at from notification_recipients where notification_event_id=?",
                OffsetDateTime.class, low)).isEqualTo(read);
        assertThat(inbox.unreadCount(owner, null, null)).isEqualTo(2);
    }

    @Test void nullThresholdOnlyAlertsOnZeroAndThresholdPatchPreservesStock() {
        var product = product("4", null);
        assertThat(count(null)).isZero();
        ProductPatchRequest patch = new ProductPatchRequest(); patch.setLowStockThreshold(new BigDecimal("4.500"));
        var updated = products.patch(owner, shopId, product.id().toString(), patch);
        assertThat(updated.stockQuantity()).isEqualByComparingTo("4");
        assertThat(updated.lowStockThreshold()).isEqualByComparingTo("4.5");
        assertThat(count("LOW_STOCK")).isEqualTo(1);
        ProductPatchRequest rename = new ProductPatchRequest(); rename.setName("Renamed");
        assertThat(products.patch(owner, shopId, product.id().toString(), rename).lowStockThreshold()).isEqualByComparingTo("4.5");
        patch.setLowStockThreshold(null);
        assertThat(products.patch(owner, shopId, product.id().toString(), patch).lowStockThreshold()).isNull();
        assertThat(open()).isZero();
        confirm(product.id(), "4");
        assertThat(count("OUT_OF_STOCK")).isEqualTo(1);
    }

    @Test void disablingTrackingAndArchivingResolveExistingAlerts() {
        var first = product("1", "5");
        ProductPatchRequest patch = new ProductPatchRequest(); patch.setTracked(false);
        products.patch(owner, shopId, first.id().toString(), patch);
        assertThat(open()).isZero();
        var second = product("1", "5");
        products.archive(owner, shopId, second.id().toString());
        assertThat(open()).isZero();
        assertThat(count("LOW_STOCK")).isEqualTo(2);
    }

    @Test void voidAndStockInReplayDoNotDuplicateEventsOrRecipients() {
        var product = product("2", "1");
        var sale = confirm(product.id(), "2");
        var request = new SaleVoidRequest("Returned", true, PaymentMethod.CASH, null);
        var first = voids.voidSale(owner, shopId, Long.toString(sale), "void", request);
        var replay = voids.voidSale(owner, shopId, Long.toString(sale), "void", request);
        assertThat(replay.refund().id()).isEqualTo(first.refund().id());
        assertThat(count("SALE_VOIDED")).isEqualTo(1);
        assertThat(open()).isZero();
        products.stockIn(owner, shopId, product.id().toString(), "stock", new ProductStockInRequest(BigDecimal.ONE, null));
        long before = count(null);
        products.stockIn(owner, shopId, product.id().toString(), "stock", new ProductStockInRequest(BigDecimal.ONE, null));
        assertThat(count(null)).isEqualTo(before);
        assertThat(jdbc.queryForObject("select count(*) from notification_recipients r join notification_events e on e.id=r.notification_event_id where e.shop_id=?",
                Long.class, Long.valueOf(shopId))).isEqualTo(count(null));
    }

    @Test void concurrentConfirmationOfTheSameDraftCreatesOneSaleAndOneAlert() throws Exception {
        var product = product("1", null);
        long draft = draft(product.id(), "1");
        var results = parallel(() -> drafts.confirm(owner, shopId, Long.toString(draft)).id(),
                () -> drafts.confirm(owner, shopId, Long.toString(draft)).id());
        assertThat(results.get(0)).isEqualTo(results.get(1));
        assertThat(count("OUT_OF_STOCK")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from sales where shop_id=?", Long.class, Long.valueOf(shopId))).isEqualTo(1);
    }

    @Test void concurrentDifferentSalesProduceOnlyOneOpenStockAlert() throws Exception {
        var product = product("2", "1");
        long first = draft(product.id(), "1"), second = draft(product.id(), "1");
        parallel(() -> drafts.confirm(owner, shopId, Long.toString(first)).id(),
                () -> drafts.confirm(owner, shopId, Long.toString(second)).id());
        assertThat(count("LOW_STOCK")).isEqualTo(1);
        assertThat(count("OUT_OF_STOCK")).isEqualTo(1);
        assertThat(open()).isEqualTo(1);
    }

    @Test void concurrentVoidRetryCreatesOneNotificationAndRefund() throws Exception {
        long sale = confirm(product("1", null).id(), "1");
        var request = new SaleVoidRequest("Returned", false, PaymentMethod.CASH, null);
        var result = parallel(() -> voids.voidSale(owner, shopId, Long.toString(sale), "same-void", request).refund().id(),
                () -> voids.voidSale(owner, shopId, Long.toString(sale), "same-void", request).refund().id());
        assertThat(result.get(0)).isEqualTo(result.get(1));
        assertThat(count("SALE_VOIDED")).isEqualTo(1);
    }

    @Test void checkoutFailureRollsBackStockAndPreviouslyCreatedAlert() {
        var first = product("1", null);
        var second = product("0", null);
        long before = count(null);
        var draft = drafts.create(owner, shopId, new SaleDraftWriteRequest(null, null, 0L, 20_000L,
                PaymentMethod.CASH, List.of(new SaleDraftItemRequest(first.id(), BigDecimal.ONE, 10_000L, null, null),
                        new SaleDraftItemRequest(second.id(), BigDecimal.ONE, 10_000L, null, null)), null));
        assertThatThrownBy(() -> drafts.confirm(owner, shopId, draft.id().toString())).isInstanceOf(BusinessException.class);
        assertThat(count(null)).isEqualTo(before);
        assertThat(products.getById(owner, shopId, first.id().toString()).stockQuantity()).isEqualByComparingTo("1");
        assertThat(jdbc.queryForObject("select count(*) from sales where shop_id=?", Long.class, Long.valueOf(shopId))).isZero();
    }

    @Test void notificationWriteFailureRollsBackVoidRefundAndIdempotencyKey() {
        var product = product("1", null);
        long sale = confirm(product.id(), "1");
        jdbc.execute("alter table notification_events add constraint test_notification_fail check (shop_id <> " + shopId + " or type <> 'SALE_VOIDED')");
        try {
            assertThatThrownBy(() -> voids.voidSale(owner, shopId, Long.toString(sale), "failed-void",
                    new SaleVoidRequest("Return", true, PaymentMethod.CASH, null))).isInstanceOf(DataIntegrityViolationException.class);
            assertThat(products.getById(owner, shopId, product.id().toString()).stockQuantity()).isEqualByComparingTo("0");
            assertThat(jdbc.queryForObject("select sale_status from sales where id=?", String.class, sale)).isEqualTo("CONFIRMED");
            assertThat(jdbc.queryForObject("select count(*) from sale_refunds where sale_id=?", Long.class, sale)).isZero();
            assertThat(jdbc.queryForObject("select count(*) from api_idempotency_keys where shop_id=? and idempotency_key='failed-void'",
                    Long.class, Long.valueOf(shopId))).isZero();
            assertThat(open()).isEqualTo(1);
        } finally { jdbc.execute("alter table notification_events drop constraint test_notification_fail"); }
    }

    @Test void readBatchIsAtomicAndEventsCannotBeReadByAnotherOwnerEvenWithAnIncorrectRecipientRow() {
        product("0", null);
        long event = inbox.list(owner, null, null, false, 0, 20).items().getFirst().id();
        assertThat(inbox.list(other, null, null, false, 0, 20).items()).isEmpty();
        expectCode(() -> inbox.markRead(other, List.of(event)), ErrorCode.NOTIFICATION_NOT_FOUND);
        jdbc.update("insert into notification_recipients(notification_event_id,user_id) values (?,?)", event, otherId);
        assertThat(inbox.unreadCount(other, null, null)).isZero();
        expectCode(() -> inbox.markRead(owner, List.of(event, Long.MAX_VALUE)), ErrorCode.NOTIFICATION_NOT_FOUND);
        assertThat(inbox.unreadCount(owner, null, null)).isEqualTo(1);
        inbox.markRead(owner, List.of(event, event));
        assertThat(inbox.unreadCount(owner, null, null)).isZero();
    }

    @Test void concurrentReadRetriesPreserveOneReadTimestamp() throws Exception {
        product("0", null);
        long event = inbox.list(owner, null, null, false, 0, 20).items().getFirst().id();
        parallel(() -> { inbox.markRead(owner, List.of(event)); return true; },
                () -> { inbox.markRead(owner, List.of(event)); return true; });
        OffsetDateTime first = jdbc.queryForObject("select read_at from notification_recipients where notification_event_id=?",
                OffsetDateTime.class, event);
        assertThat(first).isNotNull();
        inbox.markRead(owner, List.of(event));
        assertThat(jdbc.queryForObject("select read_at from notification_recipients where notification_event_id=?",
                OffsetDateTime.class, event)).isEqualTo(first);
        assertThat(inbox.unreadCount(owner, null, null)).isZero();
    }

    @Test void statusNotificationsRemainVisibleOnInactiveShopsButStockAndMoneyDoNot() {
        product("0", null);
        shops.updateStatus(admin, shopId, new ShopStatusUpdateRequest(ShopStatus.INACTIVE, "Support reason"));
        shops.updateStatus(admin, shopId, new ShopStatusUpdateRequest(ShopStatus.INACTIVE, "Support reason"));
        assertThat(count("SHOP_INACTIVATED")).isEqualTo(1);
        assertThat(inbox.list(owner, Long.valueOf(shopId), null, false, 0, 20).items())
                .extracting(item -> item.type()).containsExactly(NotificationType.SHOP_INACTIVATED);
        assertThat(inbox.unreadCount(owner, null, null)).isEqualTo(1);
        long stock = jdbc.queryForObject("select id from notification_events where shop_id=? and type='OUT_OF_STOCK'", Long.class, Long.valueOf(shopId));
        expectCode(() -> inbox.markRead(owner, List.of(stock)), ErrorCode.NOTIFICATION_NOT_FOUND);
        shops.updateStatus(admin, shopId, new ShopStatusUpdateRequest(ShopStatus.ACTIVE, null));
        shops.updateStatus(admin, shopId, new ShopStatusUpdateRequest(ShopStatus.INACTIVE, "Again"));
        assertThat(count("SHOP_INACTIVATED")).isEqualTo(2);
        assertThat(count("SHOP_REACTIVATED")).isEqualTo(1);
        assertThat(inbox.unreadCount(owner, null, null)).isEqualTo(3);
    }

    @Test void adminDisabledAndMissingProfilesCannotUseTheOwnerInbox() {
        expectCode(() -> inbox.list(admin, null, null, false, 0, 20), ErrorCode.SHOP_ACCESS_DENIED);
        expectCode(() -> inbox.unreadCount(token(), null, null), ErrorCode.AUTH_PROFILE_NOT_FOUND);
        jdbc.update("update users set status='DISABLED' where id=?", ownerId);
        expectCode(() -> inbox.markRead(owner, List.of(1L)), ErrorCode.ACCOUNT_DISABLED);
    }

    @Test void paginationFiltersAndArchivedShopVisibilityAreConsistent() {
        product("0", null); product("1", "5");
        var page = inbox.list(owner, Long.valueOf(shopId), null, true, 0, 1);
        assertThat(page.items()).hasSize(1);
        assertThat(page.totalElements()).isEqualTo(2);
        assertThat(page.totalPages()).isEqualTo(2);
        assertThat(inbox.unreadCount(owner, Long.valueOf(shopId), NotificationType.LOW_STOCK)).isEqualTo(1);
        expectCode(() -> inbox.list(owner, null, null, false, -1, 20), ErrorCode.INVALID_NOTIFICATION_QUERY);
        expectCode(() -> inbox.list(owner, null, null, false, 0, 101), ErrorCode.INVALID_NOTIFICATION_QUERY);
        expectCode(() -> inbox.unreadCount(other, Long.valueOf(shopId), null), ErrorCode.SHOP_ACCESS_DENIED);
        shops.archiveById(owner, shopId, new ArchiveShopRequest("Closed"));
        assertThat(inbox.list(owner, null, null, false, 0, 20).items()).isEmpty();
        assertThat(inbox.unreadCount(owner, null, null)).isZero();
        expectCode(() -> inbox.list(owner, Long.valueOf(shopId), null, false, 0, 20), ErrorCode.SHOP_NOT_FOUND);
    }

    @Test void databaseConstraintsPreventDuplicateSourcesRecipientsAndOpenStockAlerts() {
        product("0", null);
        long event = jdbc.queryForObject("select id from notification_events where shop_id=?", Long.class, Long.valueOf(shopId));
        assertThatThrownBy(() -> jdbc.update("insert into notification_recipients(notification_event_id,user_id) values (?,?)", event, ownerId))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into notification_events(shop_id,type,title,body,entity_type,entity_id,dedup_key)
                select shop_id,type,title,body,entity_type,entity_id,'different-source' from notification_events where id=?
                """, event)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into notification_events(shop_id,type,title,body,entity_type,entity_id,dedup_key)
                select shop_id,'SALE_VOIDED',title,body,'SALE',1,dedup_key from notification_events where id=?
                """, event)).isInstanceOf(DataIntegrityViolationException.class);
    }

    private ProductResponse product(String stock, String threshold) {
        return products.create(owner, shopId, new ProductWriteRequest(null, "Product", null, null, "piece", 10_000L,
                null, true, new BigDecimal(stock), threshold == null ? null : new BigDecimal(threshold)));
    }
    private long draft(Long product, String quantity) {
        BigDecimal qty = new BigDecimal(quantity);
        return drafts.create(owner, shopId, new SaleDraftWriteRequest(null, null, 0L, qty.multiply(BigDecimal.valueOf(10_000)).longValueExact(),
                PaymentMethod.CASH, List.of(new SaleDraftItemRequest(product, qty, 10_000L, null, null)), null)).id();
    }
    private long confirm(Long product, String quantity) { return drafts.confirm(owner, shopId, Long.toString(draft(product, quantity))).id(); }
    private long count(String type) {
        return type == null ? jdbc.queryForObject("select count(*) from notification_events where shop_id=?", Long.class, Long.valueOf(shopId))
                : jdbc.queryForObject("select count(*) from notification_events where shop_id=? and type=?", Long.class, Long.valueOf(shopId), type);
    }
    private long open() { return jdbc.queryForObject("select count(*) from notification_events where shop_id=? and entity_type='PRODUCT' and resolved_at is null", Long.class, Long.valueOf(shopId)); }
    private VerifiedFirebaseToken token() { return new VerifiedFirebaseToken(UUID.randomUUID().toString(), null, false, null, null, null); }
    private long user(VerifiedFirebaseToken token, SystemRole role) {
        var user = UserAccount.createOwner("Test owner", token);
        ReflectionTestUtils.setField(user, "systemRole", role);
        user = users.saveAndFlush(user);
        identities.saveAndFlush(AuthIdentity.forFirebase(user, token.uid()));
        return user.getId();
    }
    private void expectCode(Runnable action, ErrorCode code) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getErrorCode()).isEqualTo(code));
    }
    private <T> List<T> parallel(Supplier<T> first, Supplier<T> second) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            var a = executor.submit(() -> { start.await(); return first.get(); });
            var b = executor.submit(() -> { start.await(); return second.get(); });
            start.countDown();
            return List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
        } finally { executor.shutdownNow(); }
    }
    @AfterAll static void cleanup() throws SQLException {
        if (created && SCHEMA.matches("core_notification_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("DROP SCHEMA \"" + SCHEMA + "\" CASCADE");
            }
        }
    }
    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }
    @TestConfiguration(proxyBeanMethods = false) static class Config {
        @Bean DataSource dataSource() throws SQLException {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("CREATE SCHEMA \"" + SCHEMA + "\""); created = true;
            }
            var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                    System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
            Properties properties = new Properties(); properties.setProperty("currentSchema", SCHEMA);
            source.setConnectionProperties(properties);
            return source;
        }
        @Bean ObjectMapper objectMapper() { return new ObjectMapper().findAndRegisterModules(); }
    }
}
