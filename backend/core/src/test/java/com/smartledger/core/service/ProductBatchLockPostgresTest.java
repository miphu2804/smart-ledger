package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.dto.request.SaleVoidRequest;
import com.smartledger.core.dto.response.SaleResponse;
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

/** Actual SQL/row locks, business services, audit, notification and monetary idempotency on a disposable schema. */
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
        assertThat(sale.items()).extracting(item -> item.productId()).containsExactlyElementsOf(ids.reversed());
        assertThat(jdbc.queryForObject("select sum(estimated_cost_vnd) from sale_items where sale_id=?", Long.class, sale.id()))
                .isEqualTo(count * 500L);
        assertStocks(ids, "9");
        archive(ids.getFirst());

        sql.clear();
        var result = voids.voidSale(owner, shop(), sale.id().toString(), "batch-void", restock());

        assertProductLock(1, false);
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
    }

    @Test
    void customOnlyConfirmationAndVoidDoNotQueryProductLocks() {
        long draft = seedDraft(java.util.Arrays.asList((Long) null));
        sql.clear();
        var sale = confirm(draft);
        assertProductLock(0, false);
        assertThat(sale.items().getFirst().productId()).isNull();
        sql.clear();
        assertThat(voids.voidSale(owner, shop(), sale.id().toString(), "custom", restock()).stockRestocked()).isFalse();
        assertProductLock(0, false);
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
    void stockFailureRollsBackEarlierDeductionAndNotification() {
        var ids = seedProducts(2, 1);
        jdbc.update("update products set stock_quantity=0 where id=?", ids.getLast());
        long draft = seedDraft(ids);
        expectCode(() -> confirm(draft), ErrorCode.PRODUCT_STOCK_INSUFFICIENT);
        assertStocks(List.of(ids.getFirst()), "1");
        assertNoCheckoutWrites(draft);
        assertThat(rows("notification_events")).isZero();
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
