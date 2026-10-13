package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.smartledger.core.dto.request.ProductPatchRequest;
import com.smartledger.core.dto.request.ProductWriteRequest;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.entity.Category;
import com.smartledger.core.entity.Product;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.CategoryRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.repository.ShopRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.SalesListQueryPostgresTest.SqlCounter;
import com.smartledger.core.service.impl.AuditLogServiceImpl;
import com.smartledger.core.service.impl.CategoryServiceImpl;
import com.smartledger.core.service.impl.NotificationEventServiceImpl;
import com.smartledger.core.service.impl.ProductServiceImpl;
import com.smartledger.core.service.impl.ShopServiceImpl;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Duration;
import java.util.List;
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
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
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

/** Category assignment/archive races with actual services, bounded lock waits and Hibernate SQL assertions. */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ProductServiceImpl.class, CategoryServiceImpl.class, ShopServiceImpl.class,
        AuditLogServiceImpl.class, AdminAccessAuditService.class, NotificationEventServiceImpl.class,
        CategoryAssignmentConcurrencyPostgresTest.Config.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class CategoryAssignmentConcurrencyPostgresTest {
    private static final String SCHEMA = "core_category_assignment_test_" + UUID.randomUUID().toString().replace("-", "");
    private static boolean schemaCreated;
    @Autowired private ProductService products;
    @Autowired private CategoryService categories;
    @Autowired private EntityManager entityManager;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private SqlCounter sql;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private ShopRepository shopRepository;
    private VerifiedFirebaseToken owner;
    private long ownerId;
    private long shopId;
    private long sourceCategoryId;
    private long targetCategoryId;
    private long foreignCategoryId;
    private long productId;

    @DynamicPropertySource
    static void schema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }

    @BeforeEach
    void seed() {
        owner = new VerifiedFirebaseToken("category-assignment-" + UUID.randomUUID(), null, true, null, null, null);
        ownerId = jdbc.queryForObject("insert into users(display_name,system_role) values ('Catalog tester','OWNER') returning id", Long.class);
        jdbc.update("insert into auth_identities(user_id,provider,provider_subject) values (?,'FIREBASE',?)", ownerId, owner.uid());
        shopId = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Shop','Retail') returning id", Long.class, ownerId);
        long foreignShopId = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Other shop','Retail') returning id", Long.class, ownerId);
        sourceCategoryId = category(shopId);
        targetCategoryId = category(shopId);
        foreignCategoryId = category(foreignShopId);
        productId = jdbc.queryForObject("""
                insert into products(shop_id,category_id,name,unit,selling_price_vnd,tracked)
                values (?,?,'Old product','piece',1000,false) returning id
                """, Long.class, shopId, sourceCategoryId);
    }

    @ParameterizedTest(name = "archive first: PATCH={0}, preloaded={1}")
    @MethodSource("raceCases")
    void archiveCommitRejectsCreateOrPatchWithoutPartialWrites(boolean patch, boolean preload) throws Exception {
        race(patch, preload, true);
    }

    @ParameterizedTest(name = "assignment first: PATCH={0}, preloaded={1}")
    @MethodSource("raceCases")
    void assignmentCommitMakesArchiveRejectActiveProducts(boolean patch, boolean preload) throws Exception {
        race(patch, preload, false);
    }

    private void race(boolean patch, boolean preload, boolean archiveFirst) throws Exception {
        var loserReady = new CountDownLatch(1);
        var attemptLoser = new CountDownLatch(1);
        var winnerHoldsLock = new CountDownLatch(1);
        var releaseWinner = new CountDownLatch(1);
        var loserPid = new AtomicInteger();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var loser = pool.submit(() -> attempt(() -> tx(() -> {
                loserPid.set(backendPid());
                if (preload) {
                    assertThat(entityManager.find(Category.class, targetCategoryId).getStatus()).isEqualTo(CatalogStatus.ACTIVE);
                    if (patch && archiveFirst) entityManager.find(Product.class, productId);
                }
                loserReady.countDown();
                await(attemptLoser);
                return archiveFirst ? assign(patch, targetCategoryId) : archive();
            })));
            await(loserReady);
            var winner = pool.submit(() -> tx(() -> {
                ProductResponse response = archiveFirst ? archive() : assign(patch, targetCategoryId);
                entityManager.flush();
                winnerHoldsLock.countDown();
                await(releaseWinner);
                return response;
            }));
            try {
                await(winnerHoldsLock);
                attemptLoser.countDown();
                awaitBlocked(loserPid.get());
                assertThat(loser.isDone()).isFalse();
                releaseWinner.countDown();
                ProductResponse committed = winner.get(15, TimeUnit.SECONDS);
                assertThat(loser.get(15, TimeUnit.SECONDS)).isEqualTo(archiveFirst
                        ? ErrorCode.PRODUCT_CATEGORY_INVALID : ErrorCode.CATEGORY_HAS_PRODUCTS);
                if (archiveFirst) {
                    assertThat(targetCategory().get("status")).isEqualTo("ARCHIVED");
                    assertThat(targetCategory().get("archived_at")).isNotNull();
                    assertProductUnchanged();
                    assertProductSideEffects(0, 0, 0);
                    assertAudit("CATEGORY_ARCHIVED", 1);
                } else {
                    assertThat(committed.categoryId()).isEqualTo(targetCategoryId);
                    assertThat(targetCategory().get("status")).isEqualTo("ACTIVE");
                    assertThat(targetCategory().get("archived_at")).isNull();
                    assertThat(jdbc.queryForObject("select count(*) from products where shop_id=? and category_id=? and status='ACTIVE'",
                            Long.class, shopId, targetCategoryId)).isEqualTo(1L);
                    assertProductSideEffects(patch ? 0 : 1, patch ? 1 : 0, 1);
                    assertAudit("STOCK_ADJUSTED", patch ? 1 : 0);
                    assertAudit("CATEGORY_ARCHIVED", 0);
                }
                assertNoActiveProductInArchivedCategory();
            } finally {
                attemptLoser.countDown();
                releaseWinner.countDown();
                loser.cancel(true);
                winner.cancel(true);
            }
        }
    }

    @ParameterizedTest
    @MethodSource("invalidReferenceCases")
    void missingForeignOrArchivedCategoryRejectsAllProductSideEffects(boolean patch, String invalidCategory) {
        long categoryId = switch (invalidCategory) {
            case "foreign" -> foreignCategoryId;
            case "archived" -> {
                archive();
                yield targetCategoryId;
            }
            default -> Long.MAX_VALUE;
        };
        assertError(() -> assign(patch, categoryId), ErrorCode.PRODUCT_CATEGORY_INVALID);
        assertProductUnchanged();
        assertProductSideEffects(0, 0, 0);
        assertNoActiveProductInArchivedCategory();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void nullCategoryNeedsNoCategoryReadOrLock(boolean patch) {
        var response = assign(patch, null);
        assertThat(response.categoryId()).isNull();
        assertThat(sql.readsOf("categories")).isEmpty();
    }

    @Test
    void categoryArchiveDoesNotDeadlockWithMediaStyleShopThenProductLocks() throws Exception {
        // Exercise the actual repository lock/FK order of a media reference write, without provider calls.
        var shopHeld = new CountDownLatch(1);
        var requestProduct = new CountDownLatch(1);
        var categoryHeld = new CountDownLatch(1);
        var proceedArchive = new CountDownLatch(1);
        var patchPid = new AtomicInteger();
        var mediaPid = new AtomicInteger();
        try (var pool = Executors.newFixedThreadPool(3)) {
            var mediaLocks = pool.submit(() -> tx(() -> {
                mediaPid.set(backendPid());
                sql.clear();
                shopRepository.findLockedByIdAndOwnerId(shopId, ownerId).orElseThrow();
                assertThat(sql.readsOf("shops")).anyMatch(this::writeLock);
                shopHeld.countDown();
                await(requestProduct);
                productRepository.findLockedByIdAndShopIdAndStatus(productId, shopId, CatalogStatus.ACTIVE).orElseThrow();
                return null;
            }));
            await(shopHeld);
            var categoryArchive = pool.submit(() -> tx(() -> {
                categoryRepository.findLockedByIdAndShopId(targetCategoryId, shopId).orElseThrow();
                categoryHeld.countDown();
                await(proceedArchive);
                return archive();
            }));
            await(categoryHeld);
            var patch = pool.submit(() -> attempt(() -> tx(() -> {
                patchPid.set(backendPid());
                return assign(true, targetCategoryId);
            })));
            try {
                awaitBlocked(patchPid);
                requestProduct.countDown();
                awaitBlocked(mediaPid.get());
                proceedArchive.countDown();
                categoryArchive.get(15, TimeUnit.SECONDS);
                assertThat(patch.get(15, TimeUnit.SECONDS)).isEqualTo(ErrorCode.PRODUCT_CATEGORY_INVALID);
                mediaLocks.get(15, TimeUnit.SECONDS);
                assertProductUnchanged();
                assertThat(targetCategory().get("status")).isEqualTo("ARCHIVED");
                assertAudit("CATEGORY_ARCHIVED", 1);
                assertProductSideEffects(0, 0, 0);
                assertNoActiveProductInArchivedCategory();
            } finally {
                requestProduct.countDown();
                proceedArchive.countDown();
                patch.cancel(true);
                categoryArchive.cancel(true);
                mediaLocks.cancel(true);
            }
        }
    }

    @Test
    void recordsActualAssignmentLockSqlAndRefreshQueries() {
        assign(true, targetCategoryId);
        assertThat(sql.readsOf("products")).hasSize(2);
        assertThat(sql.readsOf("categories")).hasSize(2);
        System.out.printf("CATEGORY ASSIGNMENT LOCK SQL: product=%s%ncategory=%s%n",
                sql.readsOf("products").getFirst(), sql.readsOf("categories").getFirst());
    }

    @Test
    void omittedCategoryKeepsLatestAssignmentAfterPreloadedProductWaitsForAnotherPatch() throws Exception {
        var ready = new CountDownLatch(1);
        var start = new CountDownLatch(1);
        var holdsLock = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var pid = new AtomicInteger();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var laterPatch = pool.submit(() -> tx(() -> {
                pid.set(backendPid());
                assertThat(entityManager.find(Product.class, productId).getCategoryId()).isEqualTo(sourceCategoryId);
                ready.countDown();
                await(start);
                sql.clear();
                ProductPatchRequest request = new ProductPatchRequest();
                request.setSellingPriceVnd(2000L);
                var response = products.patch(owner, shop(), Long.toString(productId), request);
                assertThat(sql.readsOf("categories")).isEmpty();
                return response;
            }));
            await(ready);
            var assignment = pool.submit(() -> tx(() -> {
                assign(true, targetCategoryId);
                entityManager.flush();
                holdsLock.countDown();
                await(release);
                return null;
            }));
            try {
                await(holdsLock);
                start.countDown();
                awaitBlocked(pid.get());
                release.countDown();
                assignment.get(15, TimeUnit.SECONDS);
                var response = laterPatch.get(15, TimeUnit.SECONDS);
                assertThat(response.categoryId()).isEqualTo(targetCategoryId);
                assertThat(response.name()).isEqualTo("Assigned product");
                assertThat(response.tracked()).isTrue();
                assertThat(response.stockQuantity()).isEqualByComparingTo(BigDecimal.ZERO);
                assertThat(response.sellingPriceVnd()).isEqualTo(2000L);
                // The old Category can now be archived without a stale PATCH putting the Product back in it.
                categories.archive(owner, shop(), Long.toString(sourceCategoryId));
                assertNoActiveProductInArchivedCategory();
                assertError(this::archive, ErrorCode.CATEGORY_HAS_PRODUCTS);
            } finally {
                start.countDown();
                release.countDown();
                laterPatch.cancel(true);
                assignment.cancel(true);
            }
        }
    }

    @ParameterizedTest
    @MethodSource("rollbackCases")
    void assignmentRollbackLeavesNoProductAuditOrNotification(boolean patch, boolean failAudit) {
        String table = failAudit ? "audit_logs" : "notification_recipients";
        String scope = failAudit ? "shop_id <> " + shopId : "user_id <> " + ownerId;
        jdbc.execute("alter table " + table + " add constraint test_reject_assignment check (" + scope + ")");
        try {
            assertThatThrownBy(() -> assign(patch, targetCategoryId)).isInstanceOf(DataIntegrityViolationException.class);
            assertProductUnchanged();
            assertProductSideEffects(0, 0, 0);
            assertAudit("STOCK_ADJUSTED", 0);
            assertThat(targetCategory().get("status")).isEqualTo("ACTIVE");
            assertNoActiveProductInArchivedCategory();
        } finally {
            jdbc.execute("alter table " + table + " drop constraint test_reject_assignment");
        }
        assign(patch, targetCategoryId);
        assertProductSideEffects(patch ? 0 : 1, patch ? 1 : 0, 1);
        assertError(this::archive, ErrorCode.CATEGORY_HAS_PRODUCTS);
    }

    private ProductResponse assign(boolean patch, Long categoryId) {
        sql.clear();
        try {
            if (!patch) {
                return products.create(owner, shop(), new ProductWriteRequest(categoryId, "Assigned product", null,
                        null, "piece", 1000L, null, true, BigDecimal.ZERO));
            }
            ProductPatchRequest request = new ProductPatchRequest();
            request.setCategoryId(categoryId);
            request.setName("Assigned product");
            request.setTracked(true);
            return products.patch(owner, shop(), Long.toString(productId), request);
        } finally {
            if (categoryId != null) assertAssignmentLocks(patch);
        }
    }

    private ProductResponse archive() {
        sql.clear();
        try {
            categories.archive(owner, shop(), Long.toString(targetCategoryId));
            return null;
        } finally {
            assertThat(sql.readsOf("categories")).anyMatch(this::writeLock);
            assertThat(sql.readsOf("products")).allMatch(query -> !writeLock(query));
        }
    }

    private void assertAssignmentLocks(boolean patch) {
        var categoryReads = sql.readsOf("categories");
        assertThat(categoryReads).isNotEmpty();
        assertThat(categoryReads.getFirst()).contains(".shop_id=?", ".id=?");
        assertThat(categoryReads).allMatch(this::writeLock);
        List<String> productReads = sql.readsOf("products");
        if (patch) {
            assertThat(productReads).anyMatch(this::writeLock);
            var reads = sql.businessReads();
            assertThat(reads.indexOf(productReads.getFirst())).isLessThan(reads.indexOf(categoryReads.getFirst()));
        } else {
            assertThat(productReads).noneMatch(this::writeLock);
        }
    }

    private boolean writeLock(String query) { return query.matches("(?s).*\\bfor\\s+(?:no\\s+key\\s+)?update\\b.*"); }
    private String shop() { return Long.toString(shopId); }
    private int backendPid() { return jdbc.queryForObject("select pg_backend_pid()", Integer.class); }
    private Map<String, Object> targetCategory() { return jdbc.queryForMap("select * from categories where id=?", targetCategoryId); }

    private long category(long shop) {
        return jdbc.queryForObject("insert into categories(shop_id,name) values (?,'Category') returning id", Long.class, shop);
    }

    private void assertProductUnchanged() {
        var product = jdbc.queryForMap("select * from products where id=?", productId);
        assertThat(product.get("name")).isEqualTo("Old product");
        assertThat(product.get("category_id")).isEqualTo(sourceCategoryId);
        assertThat(product.get("status")).isEqualTo("ACTIVE");
        assertThat(product.get("tracked")).isEqualTo(false);
        assertThat(product.get("stock_quantity")).isNull();
        assertThat(jdbc.queryForObject("select count(*) from products where shop_id=?", Long.class, shopId)).isEqualTo(1L);
    }

    private void assertNoActiveProductInArchivedCategory() {
        assertThat(jdbc.queryForObject("""
                select count(*) from products p join categories c on c.id=p.category_id
                where p.shop_id=? and p.status='ACTIVE' and c.status='ARCHIVED'
                """, Long.class, shopId)).isZero();
    }

    private void assertAudit(String action, long expected) {
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where shop_id=? and action=?",
                Long.class, shopId, action)).isEqualTo(expected);
    }

    private void assertProductSideEffects(long created, long updated, long events) {
        assertAudit("PRODUCT_CREATED", created);
        assertAudit("PRODUCT_UPDATED", updated);
        assertThat(jdbc.queryForObject("select count(*) from notification_events where shop_id=?", Long.class, shopId)).isEqualTo(events);
        assertThat(jdbc.queryForObject("""
                select count(*) from notification_recipients r join notification_events e on e.id=r.notification_event_id where e.shop_id=?
                """, Long.class, shopId)).isEqualTo(events);
    }

    private void assertError(org.assertj.core.api.ThrowableAssert.ThrowingCallable operation, ErrorCode code) {
        assertThatThrownBy(operation).isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.getErrorCode()).isEqualTo(code));
    }

    private <T> T tx(Supplier<T> operation) {
        return new TransactionTemplate(transactions).execute(status -> {
            jdbc.execute("set local statement_timeout='10s'");
            return operation.get();
        });
    }

    private ErrorCode attempt(Supplier<?> operation) {
        try { operation.get(); return null; }
        catch (BusinessException error) { return error.getErrorCode(); }
    }

    private static Stream<Arguments> raceCases() {
        return Stream.of(false, true).flatMap(patch -> Stream.of(Arguments.of(patch, false), Arguments.of(patch, true)));
    }

    private static Stream<Arguments> invalidReferenceCases() {
        return Stream.of(false, true).flatMap(patch -> Stream.of("missing", "foreign", "archived").map(kind -> Arguments.of(patch, kind)));
    }

    private static Stream<Arguments> rollbackCases() {
        return Stream.of(false, true).flatMap(patch -> Stream.of(Arguments.of(patch, false), Arguments.of(patch, true)));
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

    private static void awaitBlocked(AtomicInteger pid) throws SQLException {
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        while (pid.get() == 0 && System.nanoTime() < deadline) {
            LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(10));
        }
        assertThat(pid.get()).as("transaction backend initialized").isPositive();
        awaitBlocked(pid.get());
    }

    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }

    @AfterAll
    static void cleanupSchema() throws SQLException {
        if (schemaCreated && SCHEMA.matches("core_category_assignment_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("drop schema \"" + SCHEMA + "\" cascade");
            }
        }
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

        @Bean SqlCounter sqlCounter() { return new SqlCounter(); }
        @Bean HibernatePropertiesCustomizer inspectSql(SqlCounter counter) {
            return properties -> properties.put("hibernate.session_factory.statement_inspector", counter);
        }
        @Bean IdempotencyService idempotencyService() { return mock(IdempotencyService.class); }
    }
}
