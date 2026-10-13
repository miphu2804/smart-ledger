package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.dto.request.SaleVoidRequest;
import com.smartledger.core.dto.request.SaleDraftItemRequest;
import com.smartledger.core.dto.request.SaleDraftWriteRequest;
import com.smartledger.core.dto.response.SaleResponse;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.PaymentMethod;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.IdempotencyKeyRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.AuditLogServiceImpl;
import com.smartledger.core.service.impl.IdempotencyServiceImpl;
import com.smartledger.core.service.impl.NotificationEventServiceImpl;
import com.smartledger.core.service.impl.SaleDraftServiceImpl;
import com.smartledger.core.service.impl.SaleVoidServiceImpl;
import com.smartledger.core.service.impl.ShopServiceImpl;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 * Exercises real SQL/row locks, business services, audit, notifications and monetary idempotency.
 * Requires CORE_TEST_POSTGRES_* pointing to a dedicated test database; fixture schemas are disposable.
 * Query assertions inspect Hibernate SQL, not fixture JDBC or total HTTP request traffic.
 * Benchmark medians discard one warmup and use three samples; timings are observations, never SLAs.
 */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({SaleDraftServiceImpl.class, SaleVoidServiceImpl.class, ShopServiceImpl.class,
        AuditLogServiceImpl.class, AdminAccessAuditService.class, NotificationEventServiceImpl.class,
        IdempotencyServiceImpl.class, IdempotencyKeyRepository.class, ProductBatchLockPostgresTest.Config.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ProductBatchLockPostgresTest {
    private static final Logger LOG = LoggerFactory.getLogger(ProductBatchLockPostgresTest.class);
    private static final String SCHEMA = "core_batch_lock_test_" + UUID.randomUUID().toString().replace("-", "");
    private static boolean created;
    @Autowired private SaleDraftService drafts;
    @Autowired private SaleVoidService voids;
    @Autowired private ProductRepository products;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private SqlProbe sql;
    @Autowired private ObjectMapper mapper;
    @Autowired private NotificationEventService notifications;
    @Autowired private ShopService shops;
    private VerifiedFirebaseToken owner;
    private long userId;
    private long shopId;

    @DynamicPropertySource
    static void isolatedSchema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }

    @BeforeEach
    void seedOwner() {
        owner = new VerifiedFirebaseToken("batch-" + UUID.randomUUID(), null, false, null, null, null);
        userId = jdbc.queryForObject("insert into users(display_name) values ('Batch owner') returning id", Long.class);
        jdbc.update("insert into auth_identities(user_id,provider,provider_subject) values (?,'FIREBASE',?)", userId, owner.uid());
        shopId = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Batch shop','Retail') returning id",
                Long.class, userId);
        sql.clear();
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 20, 100})
    void confirmAndVoidEachUseOneOrderedLockQuery(int count) {
        var ids = seedProducts(count, 10);
        long draft = seedDraft(ids.reversed());
        sql.clear();
        var sale = confirm(draft);
        assertProductLock(1, true);
        assertThat(sql.openStockReads()).hasSize(1);
        assertThat(sale.items()).extracting(item -> item.productId()).containsExactlyElementsOf(ids.reversed());
        assertThat(jdbc.queryForObject("select sum(estimated_cost_vnd) from sale_items where sale_id=?", Long.class, sale.id()))
                .isEqualTo(count * 500L);
        assertStocks(ids, "9");
        archive(ids.getFirst());

        sql.clear();
        var result = voids.voidSale(owner, shop(), sale.id().toString(), "batch-void", restock());

        assertProductLock(1, false);
        assertThat(sql.openStockReads()).hasSize(1);
        assertLockOrder();
        assertThat(result.stockRestocked()).isTrue();
        assertThat(result.cancelledDebtVnd()).isEqualTo(count * 600L);
        assertThat(result.refund().amountVnd()).isEqualTo(count * 400L);
        assertStocks(ids, "10");
        assertThat(countAudit("STOCK_RESTORED_ON_VOID")).isEqualTo(count);
        assertThat(jdbc.queryForObject("select status from products where id=?", String.class, ids.getFirst())).isEqualTo("ARCHIVED");
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void generatedSqlAndPostgresPlanOrderRowsBeforeTakingLocks(boolean activeOnly) throws Exception {
        var ids = seedProducts(20, 10);
        sql.clear();
        tx(() -> activeOnly
                ? products.findAllLockedByIdInAndShopIdAndStatus(ids.reversed(), shopId, CatalogStatus.ACTIVE)
                : products.findAllLockedByIdInAndShopId(ids.reversed(), shopId));
        assertProductLock(1, activeOnly);
        String query = sql.productLocks().getFirst();
        var arguments = new ArrayList<Object>(ids.reversed());
        arguments.add(shopId);
        if (activeOnly) arguments.add("ACTIVE");
        String planJson = jdbc.queryForObject("explain (format json) " + query, String.class, arguments.toArray());
        JsonNode plan = mapper.readTree(planJson).get(0).get("Plan");
        LOG.info("Batch lock SQL: {}", query);
        LOG.info("Batch lock EXPLAIN: {}", planJson);
        assertThat(plan.get("Node Type").asText()).isEqualTo("LockRows");
        assertThat(hasIdOrdering(plan)).as("Sort on id or ordered primary-key scan below LockRows").isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"ARCHIVED", "FOREIGN"})
    void confirmRejectsArchivedOrForeignProductsWithoutPartialWrites(String kind) {
        var ids = seedProducts(2, 10);
        long draft = seedDraft(ids);
        if (kind.equals("ARCHIVED")) archive(ids.getLast());
        else {
            long foreignShop = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Foreign','Retail') returning id",
                    Long.class, userId);
            jdbc.update("update products set shop_id=? where id=?", foreignShop, ids.getLast());
        }
        sql.clear();

        expectCode(() -> confirm(draft), ErrorCode.DRAFT_ITEM_INVALID);

        assertProductLock(1, true);
        assertStocks(ids, "10");
        assertNoCheckoutWrites(draft);
        assertThat(rows("notification_events")).isZero();
        assertThat(sql.notificationStatements()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"STOCK_THEN_ARCHIVED", "STOCK_THEN_FOREIGN", "ARCHIVED_THEN_STOCK", "FOREIGN_THEN_STOCK"})
    void confirmPreservesErrorPrecedenceForStockAndInvalidProducts(String scenario) {
        var ids = seedProducts(2, 0);
        long draft = seedDraft(ids.reversed());
        boolean invalidFirst = !scenario.startsWith("STOCK_");
        long invalidId = invalidFirst ? ids.getFirst() : ids.getLast();
        if (scenario.contains("ARCHIVED")) archive(invalidId);
        else {
            long foreignShop = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Foreign','Retail') returning id",
                    Long.class, userId);
            jdbc.update("update products set shop_id=? where id=?", foreignShop, invalidId);
        }
        sql.clear();

        expectCode(() -> confirm(draft), invalidFirst ? ErrorCode.DRAFT_ITEM_INVALID : ErrorCode.PRODUCT_STOCK_INSUFFICIENT);

        assertProductLock(1, true);
        assertStocks(ids, "0");
        assertNoCheckoutWrites(draft);
        assertThat(rows("notification_events")).isZero();
        assertThat(sql.notificationStatements()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"ARCHIVED", "FOREIGN"})
    void confirmRejectsEarlierCostOverflowBeforeStockOrLaterInvalidProduct(String kind) {
        var ids = seedProducts(2, 0);
        long draft = seedDraft(ids.reversed());
        jdbc.update("update products set cost_price_vnd=? where id=?", Long.MAX_VALUE, ids.getFirst());
        jdbc.update("update sale_draft_items set quantity=2,line_total_vnd=2000 where draft_id=? and product_id=?",
                draft, ids.getFirst());
        jdbc.update("update sale_drafts set estimated_total_vnd=3000,initial_paid_vnd=1200 where id=?", draft);
        if (kind.equals("ARCHIVED")) archive(ids.getLast());
        else {
            long foreignShop = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Foreign','Retail') returning id",
                    Long.class, userId);
            jdbc.update("update products set shop_id=? where id=?", foreignShop, ids.getLast());
        }
        sql.clear();

        expectCode(() -> confirm(draft), ErrorCode.DRAFT_TOTAL_INVALID);

        assertProductLock(1, true);
        assertStocks(ids, "0");
        assertNoCheckoutWrites(draft);
        assertThat(rows("notification_events")).isZero();
        assertThat(sql.notificationStatements()).isEmpty();
    }

    @Test
    void customOnlyConfirmationAndVoidDoNotQueryProductLocks() {
        long draft = seedDraft(java.util.Arrays.asList((Long) null));
        sql.clear();
        var sale = confirm(draft);
        assertProductLock(0, false);
        assertThat(sql.openStockReads()).isEmpty();
        assertThat(sale.items().getFirst().productId()).isNull();
        sql.clear();
        assertThat(voids.voidSale(owner, shop(), sale.id().toString(), "custom", restock()).stockRestocked()).isFalse();
        assertProductLock(0, false);
        assertThat(sql.openStockReads()).isEmpty();
    }

    @Test
    void nonDeductedCatalogItemIsNotLockedOrRestockedOnVoid() {
        var ids = seedProducts(1, 10);
        jdbc.update("update products set tracked=false,stock_quantity=null where id=?", ids.getFirst());
        var sale = confirm(seedDraft(ids));
        assertThat(jdbc.queryForObject("select stock_deducted from sale_items where sale_id=?", Boolean.class, sale.id())).isFalse();
        sql.clear();
        assertThat(voids.voidSale(owner, shop(), sale.id().toString(), "untracked", restock()).stockRestocked()).isFalse();
        assertProductLock(0, false);
    }

    @Test
    void unknownSnapshotIsRejectedBeforeAnyProductLock() {
        var ids = seedProducts(2, 10);
        var sale = confirm(seedDraft(ids));
        jdbc.update("update sale_items set stock_deducted=null where sale_id=? and product_id=?", sale.id(), ids.getLast());
        sql.clear();
        expectCode(() -> voids.voidSale(owner, shop(), sale.id().toString(), "unknown", restock()), ErrorCode.SALE_RESTOCK_UNAVAILABLE);
        assertProductLock(0, false);
        assertStocks(ids, "9");
        assertThat(rows("api_idempotency_keys")).isZero();
        assertThat(rows("sale_refunds")).isZero();
    }

    @Test
    void foreignRestockProductRejectsTheWholeBatch() {
        var ids = seedProducts(2, 10);
        var sale = confirm(seedDraft(ids));
        long foreignShop = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Foreign','Retail') returning id",
                Long.class, userId);
        jdbc.update("update products set shop_id=? where id=?", foreignShop, ids.getLast());
        sql.clear();
        expectCode(() -> voids.voidSale(owner, shop(), sale.id().toString(), "foreign", restock()), ErrorCode.SALE_RESTOCK_UNAVAILABLE);
        assertProductLock(1, false);
        assertStocks(ids, "9");
        assertThat(rows("sale_refunds")).isZero();
        assertThat(rows("api_idempotency_keys")).isZero();
    }

    @Test
    void stockFailureRollsBackEarlierDeductionWithoutCreatingNotifications() {
        var ids = seedProducts(2, 1);
        jdbc.update("update products set stock_quantity=0 where id=?", ids.getLast());
        long draft = seedDraft(ids);
        expectCode(() -> confirm(draft), ErrorCode.PRODUCT_STOCK_INSUFFICIENT);
        assertStocks(List.of(ids.getFirst()), "1");
        assertNoCheckoutWrites(draft);
        assertThat(rows("notification_events")).isZero();
    }

    /**
     * Compares 100 Product reconciliations against 100,000 resolved and 10,000 open synthetic alerts.
     * Counts open-alert reads separately from Product locks; both timed paths include the transaction
     * and Product locks. Unchanged alerts isolate the read optimization without notification writes.
     */
    @Test
    void unchangedBatchReadsOpenAlertsOnceDespiteLargeResolvedHistory() {
        var catalog = seedProducts(10_000, 9);
        var ids = catalog.subList(0, 100);
        jdbc.update("update products set low_stock_threshold=10 where shop_id=?", shopId);
        jdbc.update("""
                insert into notification_events(shop_id,type,title,body,entity_type,entity_id,dedup_key,created_at,resolved_at)
                select ?,'LOW_STOCK','Old','Old','PRODUCT',?,'old-'||g.n,
                    current_timestamp-interval '1 day',current_timestamp from generate_series(1,100000) g(n)
                """, shopId, ids.getFirst());
        jdbc.update("""
                insert into notification_events(shop_id,type,title,body,entity_type,entity_id,dedup_key)
                select shop_id,'LOW_STOCK','Open','Open','PRODUCT',id,'open-'||id from products where shop_id=?
                """, shopId);
        jdbc.update("""
                insert into notification_recipients(notification_event_id,user_id)
                select id,? from notification_events where shop_id=?
                """, userId, shopId);
        jdbc.execute("analyze notification_events");
        var perProductMs = new ArrayList<Double>();
        var batchMs = new ArrayList<Double>();
        for (int round = 0; round < 4; round++) {
            sql.clear();
            double perProduct = timedStockReconciliation(ids, false);
            assertProductLock(1, true);
            assertThat(sql.openStockReads()).hasSize(100);
            assertThat(sql.notificationStatements()).hasSize(100);
            sql.clear();
            double batch = timedStockReconciliation(ids, true);
            assertProductLock(1, true);
            assertThat(sql.openStockReads()).hasSize(1);
            assertThat(sql.notificationStatements()).hasSize(1);
            if (round > 0) { perProductMs.add(perProduct); batchMs.add(batch); }
        }
        assertThat(rows("notification_events")).isEqualTo(110_000);
        assertThat(jdbc.queryForObject("select count(*) from notification_recipients where user_id=?", Long.class, userId))
                .isEqualTo(110_000);
        Collections.sort(perProductMs);
        Collections.sort(batchMs);
        LOG.info("Stock alert batch: catalog=10000, history=100000, open=10000, selected=100, "
                + "perProductReads=100, batchReads=1, notificationWrites=0, perProductMedianMs={}, batchMedianMs={}, "
                + "samples=3, warmup=1, includesProductLocksAndTransaction=true", perProductMs.get(1), batchMs.get(1));
    }

    private double timedStockReconciliation(List<Long> ids, boolean batch) {
        long start = System.nanoTime();
        tx(() -> {
            Shop shop = shops.requireOwnedActiveShop(owner, shop());
            var locked = products.findAllLockedByIdInAndShopIdAndStatus(ids, shopId, CatalogStatus.ACTIVE);
            if (batch) notifications.reconcileStock(shop, locked);
            else locked.forEach(product -> notifications.reconcileStock(shop, product));
            return null;
        });
        return (System.nanoTime() - start) / 1_000_000.0;
    }

    @Test
    void restoreFailureRollsBackEarlierRestockAndKeepsMoneyAndDebt() {
        var ids = seedProducts(2, 10);
        var sale = confirm(seedDraft(ids));
        jdbc.update("update products set tracked=false,stock_quantity=null where id=?", ids.getLast());
        long auditBefore = rows("audit_logs");
        expectCode(() -> voids.voidSale(owner, shop(), sale.id().toString(), "restore-fail", restock()), ErrorCode.SALE_RESTOCK_UNAVAILABLE);
        assertStocks(List.of(ids.getFirst()), "9");
        assertSaleStillConfirmed(sale.id(), 1200);
        assertThat(rows("audit_logs")).isEqualTo(auditBefore);
        assertThat(rows("api_idempotency_keys")).isZero();
    }

    @Test
    void lateConfirmationAuditFailureRollsBackMoneyDebtStockAndNotifications() {
        var ids = seedProducts(2, 1);
        long draft = seedDraft(ids);
        failOnAudit("SALE_CONFIRMED");
        try {
            assertThatThrownBy(() -> confirm(draft)).isInstanceOf(RuntimeException.class)
                    .hasStackTraceContaining("Synthetic late audit failure");
        } finally { removeAuditFailure(); }
        assertStocks(ids, "1");
        assertNoCheckoutWrites(draft);
        assertThat(rows("notification_events")).isZero();
    }

    @Test
    void lateVoidAuditFailureRollsBackRefundDebtRestockAndIdempotencyReservation() {
        var ids = seedProducts(2, 1);
        var sale = confirm(seedDraft(ids));
        long auditBefore = rows("audit_logs");
        long notificationsBefore = rows("notification_events");
        failOnAudit("SALE_VOIDED");
        try {
            assertThatThrownBy(() -> voids.voidSale(owner, shop(), sale.id().toString(), "late-void-fail", restock()))
                    .isInstanceOf(RuntimeException.class).hasStackTraceContaining("Synthetic late audit failure");
        } finally { removeAuditFailure(); }
        assertStocks(ids, "0");
        assertSaleStillConfirmed(sale.id(), 1200);
        assertThat(rows("audit_logs")).isEqualTo(auditBefore);
        assertThat(rows("notification_events")).isEqualTo(notificationsBefore);
        assertThat(rows("api_idempotency_keys")).isZero();
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2})
    void reverseItemOrderConcurrentConfirmationsNeverOversellOrLoseUpdates(int initialStock) throws Exception {
        var ids = seedProducts(2, initialStock);
        long first = seedDraft(ids), second = seedDraft(ids.reversed());
        sql.clear();
        var outcomes = parallel(() -> confirmationOutcome(first), () -> confirmationOutcome(second));
        assertProductLock(2, true);
        assertThat(Collections.frequency(outcomes, "OK")).isEqualTo(initialStock);
        assertThat(Collections.frequency(outcomes, ErrorCode.PRODUCT_STOCK_INSUFFICIENT.name())).isEqualTo(2 - initialStock);
        assertStocks(ids, "0");
        assertThat(rows("sales")).isEqualTo(initialStock);
        assertThat(rows("payments")).isEqualTo(initialStock);
        assertThat(rows("debts")).isEqualTo(initialStock);
        assertThat(rows("customers")).isEqualTo(initialStock);
        assertThat(countAudit("SALE_CONFIRMED")).isEqualTo(initialStock);
        assertThat(countAudit("STOCK_ADJUSTED")).isEqualTo(initialStock * 2L);
    }

    @Test
    void concurrentVoidsWithReverseItemOrderRestoreBothSalesWithoutLostUpdates() throws Exception {
        var ids = seedProducts(2, 2);
        var first = confirm(seedDraft(ids));
        var second = confirm(seedDraft(ids.reversed()));
        sql.clear();
        parallel(() -> voids.voidSale(owner, shop(), first.id().toString(), "parallel-first", restock()),
                () -> voids.voidSale(owner, shop(), second.id().toString(), "parallel-second", restock()));
        assertProductLock(2, false);
        assertStocks(ids, "2");
        assertThat(rows("sale_refunds")).isEqualTo(2);
        assertThat(countAudit("STOCK_RESTORED_ON_VOID")).isEqualTo(4);
        assertThat(jdbc.queryForObject("select sum(outstanding_vnd) from debts where sale_id in (select id from sales where shop_id=?)",
                Long.class, shopId)).isZero();
    }

    /**
     * Samples IDs across 100,000 Products and verifies actual ordered lock SQL and returned order.
     * Both timed paths include transaction boundaries; only query counts/order, not elapsed time,
     * are pass/fail criteria, since local and CI database latency varies.
     */
    @ParameterizedTest
    @ValueSource(ints = {1, 20, 100})
    void compareLockRoundTripsOnLargeCatalog(int selectedCount) {
        var catalog = seedProducts(100_000, 10);
        jdbc.execute("analyze products");
        // Sample across the whole catalog, not only the first IDs.
        var ids = java.util.stream.IntStream.range(0, selectedCount)
                .mapToObj(index -> catalog.get(index * (catalog.size() / selectedCount))).toList();
        var legacyMs = new ArrayList<Double>();
        var batchMs = new ArrayList<Double>();
        for (int round = 0; round < 4; round++) {
            sql.clear();
            long start = System.nanoTime();
            tx(() -> {
                ids.forEach(id -> products.findLockedByIdAndShopIdAndStatus(id, shopId, CatalogStatus.ACTIVE).orElseThrow());
                return null;
            });
            double legacy = (System.nanoTime() - start) / 1_000_000.0;
            assertThat(sql.productLocks()).hasSize(selectedCount);
            sql.clear();
            start = System.nanoTime();
            var locked = tx(() -> products.findAllLockedByIdInAndShopIdAndStatus(ids.reversed(), shopId, CatalogStatus.ACTIVE));
            double batch = (System.nanoTime() - start) / 1_000_000.0;
            assertProductLock(1, true);
            assertThat(locked).extracting(product -> product.getId()).containsExactlyElementsOf(ids);
            if (round > 0) { legacyMs.add(legacy); batchMs.add(batch); }
        }
        // Timings are observations only: no flaky latency assertion on CI/shared machines.
        Collections.sort(legacyMs);
        Collections.sort(batchMs);
        LOG.info("Batch lock benchmark: catalog=100000, selected={}, legacyQueries={}, batchQueries=1, "
                        + "legacyMedianMs={}, batchMedianMs={}, samples=3, warmup=1, includesTransaction=true",
                selectedCount, selectedCount, legacyMs.get(1), batchMs.get(1));
    }

    /**
     * Checks one Product read for create/replace on a 100,000-Product catalog without stock deduction.
     * Logs service timings separately from the legacy/batch repository medians, which include
     * transaction boundaries but not the whole create/replace flow. No latency threshold is asserted.
     */
    @ParameterizedTest
    @ValueSource(ints = {1, 20, 100})
    void draftCreateAndReplaceReadCatalogOnceOnLargeCatalog(int selectedCount) {
        var catalog = seedProducts(100_000, 10);
        jdbc.execute("analyze products");
        var ids = java.util.stream.IntStream.range(0, selectedCount)
                .mapToObj(index -> catalog.get(index * (catalog.size() / selectedCount))).toList().reversed();
        var lines = ids.stream().map(id -> new SaleDraftItemRequest(id, new BigDecimal("1.005"), 100L)).toList();
        var request = new SaleDraftWriteRequest("Buyer", null, 1L, 50L, PaymentMethod.CASH, lines);
        sql.clear();
        long start = System.nanoTime();
        var createdDraft = drafts.create(owner, shop(), request);
        double createMs = (System.nanoTime() - start) / 1_000_000.0;
        assertDraftProductRead(1);
        assertThat(createdDraft.items()).extracting(item -> item.productId()).containsExactlyElementsOf(ids);
        assertThat(createdDraft.items()).allSatisfy(item -> {
            assertThat(item.unit()).isEqualTo("piece");
            assertThat(item.lineTotalVnd()).isEqualTo(101L);
        });
        assertThat(createdDraft.estimatedTotalVnd()).isEqualTo(selectedCount * 101L - 1);
        assertThat(createdDraft.initialPaidVnd()).isEqualTo(50);
        assertThat(createdDraft.initialPaymentMethod()).isEqualTo(PaymentMethod.CASH);

        sql.clear();
        start = System.nanoTime();
        var replaced = drafts.replace(owner, shop(), createdDraft.id().toString(), request);
        double replaceMs = (System.nanoTime() - start) / 1_000_000.0;
        assertDraftProductRead(1);
        assertThat(replaced.items()).extracting(item -> item.productId()).containsExactlyElementsOf(ids);
        assertThat(replaced.estimatedTotalVnd()).isEqualTo(createdDraft.estimatedTotalVnd());
        assertThat(replaced.items()).extracting(item -> item.productName())
                .containsExactlyElementsOf(createdDraft.items().stream().map(item -> item.productName()).toList());
        assertStocks(ids, "10");
        assertThat(jdbc.queryForObject("select count(*) from sale_draft_items where draft_id=?", Long.class, replaced.id()))
                .isEqualTo(selectedCount);
        for (String table : List.of("sales", "payments", "debts", "audit_logs", "notification_events")) {
            assertThat(rows(table)).isZero();
        }

        var legacyMs = new ArrayList<Double>();
        var batchMs = new ArrayList<Double>();
        for (int round = 0; round < 4; round++) {
            sql.clear();
            start = System.nanoTime();
            tx(() -> {
                ids.forEach(id -> products.findByIdAndShopIdAndStatus(id, shopId, CatalogStatus.ACTIVE).orElseThrow());
                return null;
            });
            double legacy = (System.nanoTime() - start) / 1_000_000.0;
            assertThat(sql.productReads()).hasSize(selectedCount);
            sql.clear();
            start = System.nanoTime();
            var loaded = tx(() -> products.findAllByIdInAndShopIdAndStatus(ids, shopId, CatalogStatus.ACTIVE));
            double batch = (System.nanoTime() - start) / 1_000_000.0;
            assertDraftProductRead(1);
            assertThat(loaded).extracting(product -> product.getId()).containsExactlyInAnyOrderElementsOf(ids);
            if (round > 0) { legacyMs.add(legacy); batchMs.add(batch); }
        }
        Collections.sort(legacyMs);
        Collections.sort(batchMs);
        // Repository round-trip observations, not a latency SLA or HTTP benchmark.
        LOG.info("Draft product read benchmark: catalog=100000, selected={}, legacyQueries={}, batchQueries=1, "
                        + "legacyMedianMs={}, batchMedianMs={}, samples=3, warmup=1, includesTransaction=true, "
                        + "createServiceMs={}, replaceServiceMs={}",
                selectedCount, selectedCount, legacyMs.get(1), batchMs.get(1), createMs, replaceMs);
    }

    @Test
    void customOnlyDraftCreateAndReplaceDoNotReadProducts() {
        var lines = java.util.stream.IntStream.range(0, 100).mapToObj(index ->
                new SaleDraftItemRequest(null, BigDecimal.ONE, 100L, "Custom " + index, "piece")).toList();
        var request = new SaleDraftWriteRequest(null, null, 0L, 0L, null, lines);
        sql.clear();
        var createdDraft = drafts.create(owner, shop(), request);
        assertDraftProductRead(0);
        sql.clear();
        var replaced = drafts.replace(owner, shop(), createdDraft.id().toString(), request);
        assertDraftProductRead(0);
        assertThat(replaced.items()).hasSize(100).allSatisfy(item -> assertThat(item.productId()).isNull());
    }

    @ParameterizedTest
    @ValueSource(strings = {"ARCHIVED", "FOREIGN", "MISSING"})
    void invalidDraftCatalogBatchCannotCreateOrReplaceExistingDraft(String kind) {
        var ids = seedProducts(2, 10);
        var valid = new SaleDraftWriteRequest("Original", null, 0L, 0L, null,
                List.of(new SaleDraftItemRequest(ids.getFirst(), BigDecimal.ONE, 100L)));
        var original = drafts.create(owner, shop(), valid);
        // Compare persisted snapshots, including PostgreSQL timestamp precision and NUMERIC scale.
        var persisted = drafts.getById(owner, shop(), original.id().toString());
        Long invalidId = ids.getLast();
        if (kind.equals("ARCHIVED")) archive(invalidId);
        else if (kind.equals("FOREIGN")) {
            long foreignShop = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Foreign','Retail') returning id",
                    Long.class, userId);
            jdbc.update("update products set shop_id=? where id=?", foreignShop, invalidId);
        } else invalidId = Long.MAX_VALUE;
        var invalid = new SaleDraftWriteRequest("Replacement", null, 0L, 0L, null,
                List.of(new SaleDraftItemRequest(ids.getFirst(), BigDecimal.ONE, 200L),
                        new SaleDraftItemRequest(invalidId, BigDecimal.ONE, 200L)));
        sql.clear();
        expectCode(() -> drafts.create(owner, shop(), invalid), ErrorCode.DRAFT_ITEM_INVALID);
        assertDraftProductRead(1);
        sql.clear();
        expectCode(() -> drafts.replace(owner, shop(), original.id().toString(), invalid), ErrorCode.DRAFT_ITEM_INVALID);
        assertDraftProductRead(1);

        assertThat(jdbc.queryForObject("select count(*) from sale_drafts where shop_id=?", Long.class, shopId)).isEqualTo(1);
        assertThat(drafts.getById(owner, shop(), original.id().toString())).isEqualTo(persisted);
        assertStocks(ids, "10");
    }

    private void assertDraftProductRead(int count) {
        assertThat(sql.productReads()).hasSize(count).allSatisfy(query -> {
            assertThat(query).contains(".id in (", ".shop_id=?", ".status=?");
            assertThat(SqlProbe.isLock(query)).isFalse();
        });
    }

    private List<Long> seedProducts(int count, int stock) {
        String prefix = UUID.randomUUID() + "-";
        jdbc.update("""
                insert into products(shop_id,name,unit,selling_price_vnd,cost_price_vnd,tracked,stock_quantity)
                select ?,?||g.n,'piece',1000,500,true,? from generate_series(1,?) g(n)
                """, shopId, prefix, stock, count);
        return jdbc.queryForList("select id from products where shop_id=? and name like ? order by id", Long.class, shopId, prefix + "%");
    }

    private long seedDraft(List<Long> ids) {
        long total = ids.size() * 1000L;
        long id = jdbc.queryForObject("""
                insert into sale_drafts(shop_id,created_by_user_id,customer_name,estimated_total_vnd,initial_paid_vnd,
                    initial_payment_method,expires_at)
                values (?,?,'Buyer',?,?,'CASH',current_timestamp+interval '1 day') returning id
                """, Long.class, shopId, userId, total, total * 4 / 10);
        for (Long productId : ids) {
            jdbc.update("""
                    insert into sale_draft_items(draft_id,product_id,raw_product_name,product_name_snapshot,unit_snapshot,
                        quantity,unit_price_vnd,line_total_vnd)
                    values (?,?,?,'Historical name','piece',1,1000,1000)
                    """, id, productId, productId == null ? "Custom" : null);
        }
        return id;
    }

    private void archive(long id) {
        jdbc.update("update products set status='ARCHIVED',archived_at=current_timestamp,archived_by_user_id=? where id=?", userId, id);
    }

    private SaleResponse confirm(long draft) { return drafts.confirm(owner, shop(), Long.toString(draft)); }
    private String shop() { return Long.toString(shopId); }
    private SaleVoidRequest restock() { return new SaleVoidRequest("Returned", true, PaymentMethod.CASH, null); }
    private <T> T tx(Supplier<T> action) { return new TransactionTemplate(transactions).execute(status -> action.get()); }

    private void assertStocks(List<Long> ids, String expected) {
        ids.forEach(id -> assertThat(jdbc.queryForObject("select stock_quantity from products where id=?", BigDecimal.class, id))
                .isEqualByComparingTo(expected));
    }

    private long rows(String table) {
        return switch (table) {
            case "payments", "debts", "sale_refunds" -> jdbc.queryForObject("select count(*) from " + table
                    + " where sale_id in (select id from sales where shop_id=?)", Long.class, shopId);
            case "sales", "customers", "audit_logs", "notification_events", "api_idempotency_keys" ->
                    jdbc.queryForObject("select count(*) from " + table + " where shop_id=?", Long.class, shopId);
            default -> throw new IllegalArgumentException("Unsupported fixture table");
        };
    }

    private long countAudit(String action) {
        return jdbc.queryForObject("select count(*) from audit_logs where shop_id=? and action=?", Long.class, shopId, action);
    }

    private void assertNoCheckoutWrites(long draft) {
        for (String table : List.of("sales", "payments", "debts", "audit_logs", "customers")) assertThat(rows(table)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from sale_items where sale_id in (select id from sales where shop_id=?)",
                Long.class, shopId)).isZero();
        assertThat(jdbc.queryForObject("select confirmed_sale_id from sale_drafts where id=?", Long.class, draft)).isNull();
        assertThat(jdbc.queryForObject("select status from sale_drafts where id=?", String.class, draft)).isEqualTo("DRAFT");
    }

    private void assertSaleStillConfirmed(long id, long debt) {
        assertThat(jdbc.queryForObject("select sale_status from sales where id=?", String.class, id)).isEqualTo("CONFIRMED");
        assertThat(jdbc.queryForObject("select outstanding_vnd from debts where sale_id=?", Long.class, id)).isEqualTo(debt);
        assertThat(rows("sale_refunds")).isZero();
        assertThat(rows("payments")).isEqualTo(1);
    }

    private void assertProductLock(int count, boolean activeOnly) {
        assertThat(sql.productLocks()).hasSize(count).allSatisfy(query -> {
            assertThat(query).containsPattern("order by \\w+\\.id(?: asc)? for (?:no key )?update");
            assertThat(query).contains(".shop_id=?", ".id in (");
            if (activeOnly) assertThat(query).contains(".status=?");
            else assertThat(query).doesNotContain(".status=?");
        });
    }

    private void assertLockOrder() {
        var locks = sql.statements.stream().filter(SqlProbe::isLock).toList();
        int sale = firstFrom(locks, "sales"), debt = firstFrom(locks, "debts"), product = firstFrom(locks, "products");
        assertThat(sale).isNotNegative();
        assertThat(debt).isGreaterThan(sale);
        assertThat(product).isGreaterThan(debt);
    }

    private int firstFrom(List<String> statements, String table) {
        for (int i = 0; i < statements.size(); i++) if (statements.get(i).contains("." + table + " ")) return i;
        return -1;
    }

    private boolean hasIdOrdering(JsonNode plan) {
        if (plan.has("Sort Key") && !plan.get("Sort Key").isEmpty()
                && plan.get("Sort Key").get(0).asText().matches("(?:\\w+\\.)?id")) return true;
        if (List.of("Index Scan", "Index Only Scan").contains(plan.path("Node Type").asText())
                && plan.path("Index Name").asText().equals("products_pkey")
                && plan.path("Scan Direction").asText().equals("Forward")) return true;
        if (plan.has("Plans")) for (JsonNode child : plan.get("Plans")) if (hasIdOrdering(child)) return true;
        return false;
    }

    private String confirmationOutcome(long draft) {
        try { confirm(draft); return "OK"; }
        catch (BusinessException error) { return error.getErrorCode().name(); }
    }

    private void expectCode(Runnable action, ErrorCode code) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class, error -> assertThat(error.getErrorCode()).isEqualTo(code));
    }

    private <T> List<T> parallel(Supplier<T> first, Supplier<T> second) throws Exception {
        var executor = Executors.newFixedThreadPool(2);
        // Both transactions must reach the actual product-lock SQL before either can execute it.
        sql.gate = new CyclicBarrier(2);
        try {
            var a = executor.submit(first::get);
            var b = executor.submit(second::get);
            return List.of(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS));
        } finally {
            sql.gate = null;
            executor.shutdownNow();
            assertThat(executor.awaitTermination(10, TimeUnit.SECONDS)).isTrue();
        }
    }

    private void failOnAudit(String action) {
        // Trusted test constants only; trigger is scoped to this generated schema and this test's shop.
        assertThat(action).isIn("SALE_CONFIRMED", "SALE_VOIDED");
        jdbc.execute("create function fail_batch_audit() returns trigger language plpgsql as $$ begin if NEW.shop_id="
                + shopId + " and NEW.action='" + action + "' then raise exception 'Synthetic late audit failure'; end if; return NEW; end $$");
        jdbc.execute("create trigger fail_batch_audit before insert on audit_logs for each row execute function fail_batch_audit()");
    }

    private void removeAuditFailure() {
        jdbc.execute("drop trigger fail_batch_audit on audit_logs");
        jdbc.execute("drop function fail_batch_audit()");
    }

    static class SqlProbe implements StatementInspector {
        private final List<String> statements = new CopyOnWriteArrayList<>();
        private volatile CyclicBarrier gate;
        @Override public String inspect(String query) {
            String normalized = query.toLowerCase(Locale.ROOT);
            statements.add(normalized);
            if (gate != null && isProductLock(normalized)) {
                try { gate.await(10, TimeUnit.SECONDS); }
                catch (Exception error) { throw new IllegalStateException("Parallel requests did not both reach product lock", error); }
            }
            return query;
        }
        void clear() { statements.clear(); }
        List<String> productLocks() { return statements.stream().filter(SqlProbe::isProductLock).toList(); }
        List<String> productReads() {
            return statements.stream().filter(query -> query.startsWith("select ") && query.contains(".products ")).toList();
        }
        List<String> notificationStatements() {
            return statements.stream().filter(query -> query.contains(".notification_events ")
                    || query.contains(".notification_recipients ")).toList();
        }
        List<String> openStockReads() {
            return notificationStatements().stream().filter(query -> query.startsWith("select ")
                    && query.contains(".resolved_at is null")).toList();
        }
        static boolean isLock(String query) { return query.matches("(?s).* for (?:no key )?update.*"); }
        static boolean isProductLock(String query) { return query.contains(".products ") && isLock(query); }
    }

    @AfterAll
    static void cleanup() throws SQLException {
        if (created && SCHEMA.matches("core_batch_lock_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("drop schema \"" + SCHEMA + "\" cascade");
            }
        }
    }

    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Config {
        @Bean DataSource dataSource() throws SQLException {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("create schema \"" + SCHEMA + "\"");
                created = true;
            }
            var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                    System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
            var properties = new Properties();
            properties.setProperty("currentSchema", SCHEMA);
            source.setConnectionProperties(properties);
            return source;
        }
        @Bean ObjectMapper objectMapper() { return new ObjectMapper().findAndRegisterModules(); }
        @Bean SqlProbe sqlProbe() { return new SqlProbe(); }
        @Bean HibernatePropertiesCustomizer inspect(SqlProbe probe) {
            return properties -> properties.put("hibernate.session_factory.statement_inspector", probe);
        }
    }
}
