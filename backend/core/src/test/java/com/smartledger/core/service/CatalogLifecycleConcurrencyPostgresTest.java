package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.dto.request.CategoryWriteRequest;
import com.smartledger.core.dto.request.CustomerWriteRequest;
import com.smartledger.core.dto.request.SaleDraftItemRequest;
import com.smartledger.core.dto.request.SaleDraftWriteRequest;
import com.smartledger.core.entity.Category;
import com.smartledger.core.entity.Customer;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.PaymentMethod;
import com.smartledger.core.enums.PaymentStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.AuditLogServiceImpl;
import com.smartledger.core.service.impl.CategoryServiceImpl;
import com.smartledger.core.service.impl.CustomerServiceImpl;
import com.smartledger.core.service.impl.NotificationEventServiceImpl;
import com.smartledger.core.service.impl.SaleDraftServiceImpl;
import com.smartledger.core.service.impl.ShopServiceImpl;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Duration;
import java.util.Map;
import java.util.List;
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
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
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

/** Actual catalog writes and PostgreSQL lock waits, including preloaded persistence contexts. */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({CustomerServiceImpl.class, CategoryServiceImpl.class, ShopServiceImpl.class,
        AuditLogServiceImpl.class, AdminAccessAuditService.class, NotificationEventServiceImpl.class,
        SaleDraftServiceImpl.class, CatalogLifecycleConcurrencyPostgresTest.Config.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class CatalogLifecycleConcurrencyPostgresTest {
    private static final String SCHEMA = "core_catalog_race_test_" + UUID.randomUUID().toString().replace("-", "");
    private static boolean schemaCreated;
    @Autowired private CustomerService customers;
    @Autowired private CategoryService categories;
    @Autowired private SaleDraftService drafts;
    @Autowired private EntityManager entityManager;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactions;
    private VerifiedFirebaseToken owner;
    private long ownerId;
    private long shopId;
    private long otherShopId;
    private long customerId;
    private long categoryId;

    @DynamicPropertySource
    static void schema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }

    @BeforeEach
    void seed() {
        owner = new VerifiedFirebaseToken("catalog-race-" + UUID.randomUUID(), null, true, null, null, null);
        ownerId = jdbc.queryForObject("insert into users(display_name,system_role) values ('Catalog tester','OWNER') returning id",
                Long.class);
        jdbc.update("insert into auth_identities(user_id,provider,provider_subject) values (?,'FIREBASE',?)", ownerId, owner.uid());
        shopId = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Shop','Retail') returning id",
                Long.class, ownerId);
        otherShopId = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Other shop','Retail') returning id",
                Long.class, ownerId);
        customerId = jdbc.queryForObject("insert into customers(shop_id,name,normalized_phone) values (?,'Old name','0900') returning id",
                Long.class, shopId);
        categoryId = jdbc.queryForObject("insert into categories(shop_id,name) values (?,'Old name') returning id",
                Long.class, shopId);
    }

    @ParameterizedTest(name = "{0}: archive first, replace preloaded={1}")
    @MethodSource("raceCases")
    void archiveCommitPreventsStaleReplace(Target target, boolean preload) throws Exception {
        race(target, preload, true, false);
    }

    @ParameterizedTest(name = "{0}: replace first, archive preloaded={1}")
    @MethodSource("raceCases")
    void archiveReadsLatestCommittedProfile(Target target, boolean preload) throws Exception {
        race(target, preload, false, true);
    }

    @ParameterizedTest(name = "{0}: duplicate archive, preloaded={1}")
    @MethodSource("raceCases")
    void concurrentArchivesKeepFirstMetadataAndSingleAudit(Target target, boolean preload) throws Exception {
        race(target, preload, true, true);
    }

    private void race(Target target, boolean preload, boolean winnerArchives, boolean loserArchives) throws Exception {
        var loserReady = new CountDownLatch(1);
        var attemptLoser = new CountDownLatch(1);
        var winnerHoldsLock = new CountDownLatch(1);
        var releaseWinner = new CountDownLatch(1);
        var loserPid = new AtomicInteger();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var loser = pool.submit(() -> attempt(() -> tx(() -> {
                loserPid.set(backendPid());
                if (preload) assertActiveManaged(target);
                loserReady.countDown();
                await(attemptLoser);
                write(target, loserArchives, shopId);
                return null;
            })));
            await(loserReady);
            var winner = pool.submit(() -> tx(() -> {
                write(target, winnerArchives, shopId);
                entityManager.flush();
                winnerHoldsLock.countDown();
                await(releaseWinner);
                return null;
            }));
            try {
                await(winnerHoldsLock);
                var beforeCommit = stored(target);
                assertThat(beforeCommit.get("status")).isEqualTo("ACTIVE");
                assertThat(beforeCommit.get("name")).isEqualTo("Old name");
                attemptLoser.countDown();
                awaitBlocked(loserPid.get());
                assertThat(loser.isDone()).isFalse();
                releaseWinner.countDown();
                winner.get(15, TimeUnit.SECONDS);
                assertThat(loser.get(15, TimeUnit.SECONDS)).isEqualTo(winnerArchives ? target.notFound : null);
                var stored = stored(target);
                assertThat(stored.get("status")).isEqualTo("ARCHIVED");
                assertThat(stored.get("name")).isEqualTo(winnerArchives ? "Old name" : "New name");
                assertThat(stored.get("archived_at")).isNotNull();
                assertThat(((Number) stored.get("archived_by_user_id")).longValue()).isEqualTo(ownerId);
                if (target == Target.CUSTOMER) {
                    assertThat(stored.get("normalized_phone")).isEqualTo(winnerArchives ? "0900" : "0901234567");
                } else {
                    assertAudit("CATEGORY_ARCHIVED", 1);
                    assertAudit("CATEGORY_UPDATED", winnerArchives ? 0 : 1);
                }
                if (winnerArchives) {
                    // A subsequent failed archive/replace must not recreate archive metadata or an audit.
                    var firstArchiveTime = stored.get("archived_at");
                    assertThatThrownBy(() -> write(target, !loserArchives, shopId))
                            .isInstanceOfSatisfying(BusinessException.class, error ->
                                    assertThat(error.getErrorCode()).isEqualTo(target.notFound));
                    assertThat(stored(target).get("archived_at")).isEqualTo(firstArchiveTime);
                }
            } finally {
                attemptLoser.countDown();
                releaseWinner.countDown();
                loser.cancel(true);
                winner.cancel(true);
            }
        }
    }

    @ParameterizedTest
    @EnumSource(Target.class)
    void writesRemainScopedToSelectedShop(Target target) {
        for (boolean archive : new boolean[] {false, true}) {
            assertThatThrownBy(() -> write(target, archive, otherShopId))
                    .isInstanceOfSatisfying(BusinessException.class, error ->
                            assertThat(error.getErrorCode()).isEqualTo(target.notFound));
        }
        assertThat(stored(target).get("status")).isEqualTo("ACTIVE");
        assertThat(stored(target).get("name")).isEqualTo("Old name");
        assertAudit("CATEGORY_UPDATED", 0);
        assertAudit("CATEGORY_ARCHIVED", 0);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void categoryAuditFailureRollsBackProfileAndArchiveMetadata(boolean archive) {
        jdbc.execute("alter table audit_logs add constraint test_reject_category_audit check (shop_id <> " + shopId + ")");
        try {
            assertThatThrownBy(() -> write(Target.CATEGORY, archive, shopId))
                    .isInstanceOf(DataIntegrityViolationException.class);
            var stored = stored(Target.CATEGORY);
            assertThat(stored.get("status")).isEqualTo("ACTIVE");
            assertThat(stored.get("name")).isEqualTo("Old name");
            assertThat(stored.get("archived_at")).isNull();
            assertThat(stored.get("archived_by_user_id")).isNull();
            assertAudit("CATEGORY_UPDATED", 0);
            assertAudit("CATEGORY_ARCHIVED", 0);
        } finally {
            jdbc.execute("alter table audit_logs drop constraint test_reject_category_audit");
        }
    }

    /** A Customer lock must protect debt creation, including entities cached before a competing write. */
    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void archiveBeforeDebtConfirmationRejectsEvenPreloadedCustomer(boolean preload) throws Exception {
        confirmAfterCustomerWrite(preload, true);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void debtConfirmationSnapshotsLatestCustomerAfterWaitingForProfileWrite(boolean preload) throws Exception {
        confirmAfterCustomerWrite(preload, false);
    }

    private void confirmAfterCustomerWrite(boolean preload, boolean archive) throws Exception {
        Checkout fixture = checkout(10_000);
        var ready = new CountDownLatch(1);
        var attemptConfirm = new CountDownLatch(1);
        var writerHoldsLock = new CountDownLatch(1);
        var releaseWriter = new CountDownLatch(1);
        var confirmerPid = new AtomicInteger();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var confirmer = pool.submit(() -> attempt(() -> tx(() -> {
                confirmerPid.set(backendPid());
                if (preload) assertActiveManaged(Target.CUSTOMER);
                ready.countDown();
                await(attemptConfirm);
                return drafts.confirm(owner, Long.toString(shopId), Long.toString(fixture.draftId()));
            })));
            await(ready);
            var writer = pool.submit(() -> tx(() -> {
                write(Target.CUSTOMER, archive, shopId);
                entityManager.flush();
                writerHoldsLock.countDown();
                await(releaseWriter);
                return null;
            }));
            try {
                await(writerHoldsLock);
                attemptConfirm.countDown();
                awaitBlocked(confirmerPid.get());
                assertThat(confirmer.isDone()).isFalse();
                releaseWriter.countDown();
                writer.get(15, TimeUnit.SECONDS);
                assertThat(confirmer.get(15, TimeUnit.SECONDS))
                        .isEqualTo(archive ? ErrorCode.CUSTOMER_NOT_FOUND : null);
                if (archive) assertNoCheckoutWrites(fixture);
                else {
                    var sale = jdbc.queryForMap("select * from sales where shop_id=?", shopId);
                    assertThat(sale.get("customer_name_snapshot")).isEqualTo("New name");
                    assertThat(sale.get("customer_phone_snapshot")).isEqualTo("0901234567");
                    assertThat(((Number) sale.get("customer_id")).longValue()).isEqualTo(customerId);
                    assertDebtAndStock(fixture);
                }
            } finally {
                attemptConfirm.countDown();
                releaseWriter.countDown();
                confirmer.cancel(true);
                writer.cancel(true);
            }
        }
    }

    /** Confirm serializes first; a later archive may keep the existing historical debt. */
    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void debtConfirmationKeepsCustomerLockUntilCommitBeforeArchive(boolean preload) throws Exception {
        Checkout fixture = checkout(10_000);
        var ready = new CountDownLatch(1);
        var attemptArchive = new CountDownLatch(1);
        var confirmHoldsLock = new CountDownLatch(1);
        var releaseConfirm = new CountDownLatch(1);
        var archiverPid = new AtomicInteger();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var archiver = pool.submit(() -> tx(() -> {
                archiverPid.set(backendPid());
                if (preload) assertActiveManaged(Target.CUSTOMER);
                ready.countDown();
                await(attemptArchive);
                write(Target.CUSTOMER, true, shopId);
                return null;
            }));
            await(ready);
            var confirmer = pool.submit(() -> tx(() -> {
                var response = drafts.confirm(owner, Long.toString(shopId), Long.toString(fixture.draftId()));
                entityManager.flush();
                confirmHoldsLock.countDown();
                await(releaseConfirm);
                return response;
            }));
            try {
                await(confirmHoldsLock);
                attemptArchive.countDown();
                awaitBlocked(archiverPid.get());
                assertThat(archiver.isDone()).isFalse();
                assertThat(stored(Target.CUSTOMER).get("status")).isEqualTo("ACTIVE");
                releaseConfirm.countDown();
                var sale = confirmer.get(15, TimeUnit.SECONDS);
                archiver.get(15, TimeUnit.SECONDS);
                assertThat(stored(Target.CUSTOMER).get("status")).isEqualTo("ARCHIVED");
                assertThat(sale.customerId()).isEqualTo(customerId);
                assertThat(sale.paymentStatus()).isEqualTo(PaymentStatus.PARTIAL);
                assertDebtAndStock(fixture);
                var replay = drafts.confirm(owner, Long.toString(shopId), Long.toString(fixture.draftId()));
                assertThat(replay.id()).isEqualTo(sale.id());
                assertDebtAndStock(fixture);
            } finally {
                attemptArchive.countDown();
                releaseConfirm.countDown();
                archiver.cancel(true);
                confirmer.cancel(true);
            }
        }
    }

    @Test
    void debtConfirmationAuditFailureRollsBackAndReleasesCustomerLock() throws Exception {
        Checkout fixture = checkout(10_000);
        jdbc.execute("alter table audit_logs add constraint test_reject_checkout_audit check (shop_id <> " + shopId + ")");
        try {
            assertThatThrownBy(() -> drafts.confirm(owner, Long.toString(shopId), Long.toString(fixture.draftId())))
                    .isInstanceOf(DataIntegrityViolationException.class);
            assertNoCheckoutWrites(fixture);
        } finally {
            jdbc.execute("alter table audit_logs drop constraint test_reject_checkout_audit");
        }
        // A different connection can now update the same Customer: failed confirmation released its lock.
        try (var pool = Executors.newSingleThreadExecutor()) {
            pool.submit(() -> customers.replace(owner, Long.toString(shopId), Long.toString(customerId),
                    new CustomerWriteRequest("After rollback", null))).get(15, TimeUnit.SECONDS);
        }
        var sale = drafts.confirm(owner, Long.toString(shopId), Long.toString(fixture.draftId()));
        assertThat(sale.customerName()).isEqualTo("After rollback");
        assertDebtAndStock(fixture);
    }

    @Test
    void fullyPaidConfirmationStillAcceptsArchivedCustomerSnapshotWithoutDebt() {
        Checkout fixture = checkout(25_000);
        customers.archive(owner, Long.toString(shopId), Long.toString(customerId));

        var sale = drafts.confirm(owner, Long.toString(shopId), Long.toString(fixture.draftId()));

        assertThat(sale.customerId()).isNull();
        assertThat(sale.customerName()).isEqualTo("Old name");
        assertThat(sale.customerPhone()).isEqualTo("0900");
        assertThat(sale.paymentStatus()).isEqualTo(PaymentStatus.PAID);
        assertThat(jdbc.queryForObject("select count(*) from debts d join sales s on s.id=d.sale_id where s.shop_id=?",
                Long.class, shopId)).isZero();
        assertThat(stock(fixture)).isEqualByComparingTo("4.000");
    }

    @Test
    void debtConfirmationDoesNotLockOrLinkCustomerFromAnotherShop() {
        Checkout fixture = checkout(10_000);
        long foreignId = jdbc.queryForObject("insert into customers(shop_id,name) values (?,'Foreign') returning id",
                Long.class, otherShopId);
        jdbc.update("update sale_drafts set customer_id=? where id=?", foreignId, fixture.draftId());
        assertThatThrownBy(() -> drafts.confirm(owner, Long.toString(shopId), Long.toString(fixture.draftId())))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.CUSTOMER_NOT_FOUND));
        assertNoCheckoutWrites(fixture);
    }

    private Checkout checkout(long paid) {
        long productId = jdbc.queryForObject("""
                insert into products(shop_id,name,unit,selling_price_vnd,cost_price_vnd,tracked,stock_quantity)
                values (?,'Product','piece',25000,10000,true,5) returning id
                """, Long.class, shopId);
        long draftId = drafts.create(owner, Long.toString(shopId), new SaleDraftWriteRequest(null, null, 0L,
                paid, PaymentMethod.CASH, List.of(new SaleDraftItemRequest(productId, BigDecimal.ONE, 25000L)),
                customerId)).id();
        return new Checkout(draftId, productId);
    }

    private void assertNoCheckoutWrites(Checkout fixture) {
        assertThat(jdbc.queryForObject("select status from sale_drafts where id=?", String.class, fixture.draftId()))
                .isEqualTo("DRAFT");
        assertThat(stock(fixture)).isEqualByComparingTo("5.000");
        for (String table : List.of("sales", "audit_logs", "notification_events")) {
            assertThat(jdbc.queryForObject("select count(*) from " + table + " where shop_id=?", Long.class, shopId))
                    .as("no partial %s", table).isZero();
        }
        for (String table : List.of("sale_items", "payments", "debts")) {
            assertThat(jdbc.queryForObject("select count(*) from " + table + " t join sales s on s.id=t.sale_id where s.shop_id=?",
                    Long.class, shopId)).as("no partial %s", table).isZero();
        }
    }

    private void assertDebtAndStock(Checkout fixture) {
        assertThat(stock(fixture)).isEqualByComparingTo("4.000");
        assertThat(jdbc.queryForObject("select count(*) from sales where shop_id=?", Long.class, shopId)).isEqualTo(1);
        var debt = jdbc.queryForMap("select d.* from debts d join sales s on s.id=d.sale_id where s.shop_id=?", shopId);
        assertThat(((Number) debt.get("customer_id")).longValue()).isEqualTo(customerId);
        assertThat(((Number) debt.get("outstanding_vnd")).longValue()).isEqualTo(15_000);
        assertThat(jdbc.queryForObject("select count(*) from payments p join sales s on s.id=p.sale_id where s.shop_id=?",
                Long.class, shopId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where shop_id=? and action='SALE_CONFIRMED'",
                Long.class, shopId)).isEqualTo(1);
    }

    private BigDecimal stock(Checkout fixture) {
        return jdbc.queryForObject("select stock_quantity from products where id=?", BigDecimal.class, fixture.productId());
    }

    private record Checkout(long draftId, long productId) { }

    private void write(Target target, boolean archive, long selectedShopId) {
        String shop = Long.toString(selectedShopId);
        if (target == Target.CUSTOMER) {
            if (archive) customers.archive(owner, shop, Long.toString(customerId));
            else customers.replace(owner, shop, Long.toString(customerId), new CustomerWriteRequest("  New name  ", "090 123-4567"));
        } else {
            if (archive) categories.archive(owner, shop, Long.toString(categoryId));
            else categories.replace(owner, shop, Long.toString(categoryId), new CategoryWriteRequest("  New name  "));
        }
    }

    private void assertActiveManaged(Target target) {
        CatalogStatus status = target == Target.CUSTOMER
                ? entityManager.find(Customer.class, customerId).getStatus()
                : entityManager.find(Category.class, categoryId).getStatus();
        assertThat(status).isEqualTo(CatalogStatus.ACTIVE);
    }

    private Map<String, Object> stored(Target target) {
        return jdbc.queryForMap("select * from " + target.table + " where id=?",
                target == Target.CUSTOMER ? customerId : categoryId);
    }

    private void assertAudit(String action, long count) {
        assertThat(jdbc.queryForObject("select count(*) from audit_logs where shop_id=? and entity_id=? and action=?",
                Long.class, shopId, categoryId, action)).isEqualTo(count);
    }

    private <T> T tx(Supplier<T> operation) {
        return new TransactionTemplate(transactions).execute(status -> {
            jdbc.execute("set local statement_timeout='10s'");
            return operation.get();
        });
    }

    private ErrorCode attempt(Supplier<?> operation) {
        try {
            operation.get();
            return null;
        } catch (BusinessException error) {
            return error.getErrorCode();
        }
    }

    private int backendPid() { return jdbc.queryForObject("select pg_backend_pid()", Integer.class); }

    private static Stream<Arguments> raceCases() {
        return Stream.of(Target.values()).flatMap(target -> Stream.of(Arguments.of(target, false), Arguments.of(target, true)));
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

    @AfterAll
    static void cleanupSchema() throws SQLException {
        if (schemaCreated && SCHEMA.matches("core_catalog_race_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("drop schema \"" + SCHEMA + "\" cascade");
            }
        }
    }

    private enum Target {
        CUSTOMER("customers", ErrorCode.CUSTOMER_NOT_FOUND), CATEGORY("categories", ErrorCode.CATEGORY_NOT_FOUND);
        private final String table;
        private final ErrorCode notFound;
        Target(String table, ErrorCode notFound) { this.table = table; this.notFound = notFound; }
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
    }
}
