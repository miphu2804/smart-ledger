package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.mock;

import com.smartledger.core.dto.request.OwnerListQuery.*;
import com.smartledger.core.enums.*;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.SalesListQueryPostgresTest.SqlCounter;
import com.smartledger.core.service.impl.*;
import jakarta.persistence.EntityManager;
import java.sql.*;
import java.time.*;
import java.util.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Real PostgreSQL filtering/count/tenant tests. All fixtures live in a disposable isolated schema. */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ProductServiceImpl.class, SaleServiceImpl.class, SaleDraftServiceImpl.class,
        CustomerServiceImpl.class, DebtServiceImpl.class, ExpenseServiceImpl.class, ShopServiceImpl.class,
        OwnerListPaginationPostgresTest.Config.class})
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class OwnerListPaginationPostgresTest {
    private static final String SCHEMA = "core_owner_page_test_" + UUID.randomUUID().toString().replace("-", "");
    private static boolean schemaCreated;
    @Autowired ProductService products;
    @Autowired SaleService sales;
    @Autowired SaleDraftService drafts;
    @Autowired CustomerService customers;
    @Autowired DebtService debts;
    @Autowired ExpenseService expenses;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager entityManager;
    @Autowired TestCounter sql;
    private VerifiedFirebaseToken owner;
    private long userId;
    private long shopId;
    private long otherShopId;

    @DynamicPropertySource
    static void schema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }

    @BeforeEach
    void seed() {
        owner = new VerifiedFirebaseToken("pagination-" + UUID.randomUUID(), null, false, null, null, null);
        userId = jdbc.queryForObject("insert into users(display_name) values ('Owner') returning id", Long.class);
        jdbc.update("insert into auth_identities(user_id,provider,provider_subject) values (?,'FIREBASE',?)", userId, owner.uid());
        shopId = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Selected','Retail') returning id", Long.class, userId);
        long other = jdbc.queryForObject("insert into users(display_name) values ('Other') returning id", Long.class);
        otherShopId = jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,'Foreign','Retail') returning id", Long.class, other);
    }

    @Test
    void productsPageAndCountApplyTheSameTenantSearchCategoryAndActivePredicates() {
        long category = jdbc.queryForObject("insert into categories(shop_id,name) values (?,'Food') returning id", Long.class, shopId);
        long first = product(shopId, "Đường cà phê", "ABC%_!", true, "2", "3");
        long second = product(shopId, "Dường cà phê", "other", true, "0", "3");
        jdbc.update("update products set category_id=? where id in (?,?)", category, first, second);
        product(shopId, "Đường other category", null, true, "1", "3");
        product(otherShopId, "Đường cà phê", null, true, "1", "3");
        long archived = product(shopId, "Đường cà phê", null, true, "1", "3");
        jdbc.update("update products set status='ARCHIVED',archived_at=current_timestamp,archived_by_user_id=? where id=?", userId, archived);
        clear();
        var page = products.list(owner, shop(), new Products(0, 1, " DUONG CA PHE ", category, null, null));
        assertThat(page.totalElements()).isEqualTo(2);
        assertThat(page.totalPages()).isEqualTo(2);
        assertThat(page.items()).extracting(p -> p.id()).containsExactly(first);
        assertSimpleBudget(2);
        var next = products.list(owner, shop(), new Products(1, 1, "duong ca phe", category, null, null));
        assertThat(next.items()).extracting(p -> p.id()).containsExactly(second);
        assertThat(next.totalElements()).isEqualTo(2);
        assertThat(products.list(owner, shop(), new Products(0, 20, "%_!", null, null, null)).items())
                .extracting(p -> p.id()).containsExactly(first);
        assertThat(products.list(owner, shop(), new Products(0, 20, "ABC", null, null, null)).items())
                .extracting(p -> p.id()).containsExactly(first);
    }

    @Test
    void lowOutAndNeedsRestockRespectEachProductsThresholdAndTracking() {
        long low = product(shopId, "Low", null, true, "3", "3");
        long out = product(shopId, "Out", null, true, "0", null);
        long high = product(shopId, "High", null, true, "4", "3");
        product(shopId, "No threshold", null, true, "1", null);
        long untracked = product(shopId, "Untracked", null, false, null, null);
        assertThat(products.list(owner, shop(), new Products(0, 20, null, null, StockStatus.LOW, null)).items())
                .extracting(p -> p.id()).containsExactly(low);
        assertThat(products.list(owner, shop(), new Products(0, 20, null, null, StockStatus.OUT, null)).items())
                .extracting(p -> p.id()).containsExactly(out);
        assertThat(products.list(owner, shop(), new Products(0, 1, null, null, StockStatus.NEEDS_RESTOCK, null)).totalElements())
                .isEqualTo(2);
        var sorted = products.list(owner, shop(), new Products(0, 20, null, null, null, ProductSort.STOCK_DESC)).items();
        assertThat(sorted.getFirst().id()).isEqualTo(high);
        assertThat(sorted.getLast().id()).isEqualTo(untracked);
    }

    @Test
    void customersSearchNamePhoneAndLiteralWildcardsBeforePaging() {
        long a = customer(shopId, "Đặng An", "0901234567");
        customer(shopId, "Đặng An second", "0910000000");
        customer(shopId, "100%_! literal", null);
        customer(otherShopId, "Đặng An", "0901234567");
        long archived = customer(shopId, "Đặng An archived", null);
        jdbc.update("update customers set status='ARCHIVED',archived_at=current_timestamp,archived_by_user_id=? where id=?", userId, archived);
        clear();
        var page = customers.list(owner, shop(), new Customers(0, 1, "dang an"));
        assertThat(page.totalElements()).isEqualTo(2);
        assertThat(page.items()).extracting(c -> c.id()).containsExactly(a);
        assertSimpleBudget(2);
        assertThat(customers.list(owner, shop(), new Customers(0, 20, "1234567")).items()).hasSize(1);
        assertThat(customers.list(owner, shop(), new Customers(0, 20, "%_!")).items()).hasSize(1);
    }

    @Test
    void saleSearchUsesHistoricalItemSnapshotWithoutDuplicateParentsOrCounts() {
        long before = sale(shopId, "2026-10-08T16:59:59Z", "Wrong day");
        long match = sale(shopId, "2026-10-08T17:00:00Z", "Khách Đặng");
        long late = sale(shopId, "2026-10-09T16:59:59Z", "Khách Đặng");
        long after = sale(shopId, "2026-10-09T17:00:00Z", "Wrong day");
        long foreign = sale(otherShopId, "2026-10-09T00:00:00Z", "Khách Đặng");
        for (long id : List.of(before, match, late, after, foreign)) {
            saleItem(id, "Cà phê đã đổi tên", 1);
            saleItem(id, "Cà phê đã đổi tên", 2);
        }
        OffsetDateTime from = OffsetDateTime.parse("2026-10-09T00:00:00+07:00");
        OffsetDateTime to = from.plusDays(1);
        clear();
        var page = sales.list(owner, shop(), new Sales(0, 1, "ca phe", SaleStatus.CONFIRMED, from, to));
        assertThat(page.totalElements()).isEqualTo(2);
        assertThat(page.items()).extracting(s -> s.id()).containsExactly(late);
        assertThat(page.items().getFirst().items()).hasSize(2);
        assertThat(sql.businessReads()).hasSize(3);
        assertThat(sql.readsOf("sale_items").getLast()).contains(" in (");
        var next = sales.list(owner, shop(), new Sales(1, 1, "khach dang", null, from, to));
        assertThat(next.items()).extracting(s -> s.id()).containsExactly(match);
        assertThat(next.totalElements()).isEqualTo(2);
        assertThat(sales.list(owner, shop(), new Sales(0, 20, Long.toString(match), null, null, null)).items())
                .extracting(s -> s.id()).containsExactly(match);
        clear();
        var empty = sales.list(owner, shop(), new Sales(5, 1, "ca phe", null, from, to));
        assertThat(empty.items()).isEmpty();
        assertThat(empty.totalElements()).isEqualTo(2);
        // Search subqueries use sale_items; there must be no separate item-batch read on an empty page.
        assertThat(sql.businessReads()).hasSize(2);
    }

    @Test
    void salesTimestampRangeIsHalfOpenAndEquivalentOffsetsHaveTheSameResult() {
        long before = sale(shopId, "2026-10-09T05:29:59Z", "Before");
        long first = sale(shopId, "2026-10-09T05:30:00Z", "At from");
        long last = sale(shopId, "2026-10-09T06:29:59.999999Z", "Inside");
        long after = sale(shopId, "2026-10-09T06:30:00Z", "At to");
        sale(otherShopId, "2026-10-09T06:00:00Z", "Foreign");
        var from = OffsetDateTime.parse("2026-10-09T12:30:00+07:00");
        var to = OffsetDateTime.parse("2026-10-09T06:30:00Z");
        clear();
        var page = sales.list(owner, shop(), new Sales(0, 1, null, null, from, to));
        assertThat(page.items()).extracting(s -> s.id()).containsExactly(last);
        assertThat(page.totalElements()).isEqualTo(2);
        assertThat(page.totalPages()).isEqualTo(2);
        assertThat(sql.businessReads()).hasSize(3);
        assertThat(sales.list(owner, shop(), new Sales(1, 1, null, null,
                from.withOffsetSameInstant(ZoneOffset.UTC), to.withOffsetSameInstant(ZoneOffset.ofHours(-5)))).items())
                .extracting(s -> s.id()).containsExactly(first);
        assertThat(sales.list(owner, shop(), new Sales(0, 20, null, null, from, null)).items())
                .extracting(s -> s.id()).containsExactly(after, last, first);
        assertThat(sales.list(owner, shop(), new Sales(0, 20, null, null, null, to)).items())
                .extracting(s -> s.id()).containsExactly(last, first, before);
        var beyond = sales.list(owner, shop(), new Sales(2, 1, null, null, from, to));
        assertThat(beyond.items()).isEmpty();
        assertThat(beyond.totalElements()).isEqualTo(2);
    }

    @Test
    void expensesTimestampRangeIsHalfOpenAndEquivalentOffsetsHaveTheSameResult() {
        long before = expense(shopId, "Rent", "2026-10-09T05:29:59Z");
        long first = expense(shopId, "Rent", "2026-10-09T05:30:00Z");
        long last = expense(shopId, "Rent", "2026-10-09T06:29:59.999999Z");
        long after = expense(shopId, "Rent", "2026-10-09T06:30:00Z");
        expense(otherShopId, "Rent", "2026-10-09T06:00:00Z");
        var from = OffsetDateTime.parse("2026-10-09T12:30:00+07:00");
        var to = OffsetDateTime.parse("2026-10-09T06:30:00Z");
        clear();
        var page = expenses.list(owner, shop(), new Expenses(0, 1, null, null, from, to));
        assertThat(page.items()).extracting(e -> e.id()).containsExactly(last);
        assertThat(page.totalElements()).isEqualTo(2);
        assertThat(page.totalPages()).isEqualTo(2);
        assertSimpleBudget(2);
        assertThat(expenses.list(owner, shop(), new Expenses(1, 1, null, null,
                from.withOffsetSameInstant(ZoneOffset.UTC), to.withOffsetSameInstant(ZoneOffset.ofHours(-5)))).items())
                .extracting(e -> e.id()).containsExactly(first);
        assertThat(expenses.list(owner, shop(), new Expenses(0, 20, null, null, from, null)).items())
                .extracting(e -> e.id()).containsExactly(after, last, first);
        assertThat(expenses.list(owner, shop(), new Expenses(0, 20, null, null, null, to)).items())
                .extracting(e -> e.id()).containsExactly(last, first, before);
        var beyond = expenses.list(owner, shop(), new Expenses(2, 1, null, null, from, to));
        assertThat(beyond.items()).isEmpty();
        assertThat(beyond.totalElements()).isEqualTo(2);
    }

    @Test
    void effectiveDraftExpiryIsFilteredBeforeCountWithoutMutatingTheStoredStatus() {
        long expired = draft("DRAFT", "2026-01-01T00:00:00Z");
        long expiredStored = draft("EXPIRED", "2026-01-01T00:00:00Z");
        long current = draft("DRAFT", "2099-01-01T00:00:00Z");
        draft("CANCELLED", "2026-01-01T00:00:00Z");
        clear();
        var page = drafts.list(owner, shop(), new Drafts(0, 1, DraftStatus.EXPIRED));
        assertThat(page.totalElements()).isEqualTo(2);
        assertThat(page.items()).extracting(d -> d.id()).containsExactly(expiredStored);
        assertThat(page.items().getFirst().status()).isEqualTo(DraftStatus.EXPIRED);
        assertThat(sql.businessReads()).hasSize(3);
        var next = drafts.list(owner, shop(), new Drafts(1, 1, DraftStatus.EXPIRED));
        assertThat(next.items()).extracting(d -> d.id()).containsExactly(expired);
        assertThat(next.items().getFirst().status()).isEqualTo(DraftStatus.EXPIRED);
        assertThat(jdbc.queryForObject("select status from sale_drafts where id=?", String.class, expired)).isEqualTo("DRAFT");
        assertThat(drafts.list(owner, shop(), new Drafts(0, 20, DraftStatus.DRAFT)).items())
                .extracting(d -> d.id()).containsExactly(current);
    }

    @Test
    void debtsAreScopedThroughSaleAndFilteredBeforeCount() {
        long customer = customer(shopId, "An", null);
        long another = customer(shopId, "Other", null);
        for (int i = 0; i < 3; i++) {
            long sale = sale(shopId, "2026-10-09T00:00:00Z", "An");
            debt(sale, i == 2 ? another : customer);
        }
        debt(sale(otherShopId, "2026-10-09T00:00:00Z", "Foreign"), customer(otherShopId, "An", null));
        clear();
        var page = debts.list(owner, shop(), new Debts(0, 1, DebtStatus.OPEN, customer));
        assertThat(page.totalElements()).isEqualTo(2);
        assertThat(page.items()).allSatisfy(d -> assertThat(d.customerId()).isEqualTo(customer));
        assertSimpleBudget(2);
        assertThat(debts.list(owner, shop(), new Debts(0, 20, DebtStatus.SETTLED, null)).items()).isEmpty();
    }

    @Test
    void expensesApplyCategoryOffsetRangeAndActiveStatusBeforeCount() {
        expense(shopId, "Rent", "2026-10-08T16:59:59Z");
        long first = expense(shopId, "Rent", "2026-10-08T17:00:00Z");
        long last = expense(shopId, "Rent", "2026-10-09T16:59:59Z");
        expense(shopId, "Rent", "2026-10-09T17:00:00Z");
        expense(shopId, "Other", "2026-10-09T00:00:00Z");
        expense(otherShopId, "Rent", "2026-10-09T00:00:00Z");
        long archived = expense(shopId, "Rent", "2026-10-09T00:00:00Z");
        jdbc.update("update expenses set status='ARCHIVED',archived_at=current_timestamp,archived_by_user_id=? where id=?", userId, archived);
        OffsetDateTime from = OffsetDateTime.parse("2026-10-09T00:00:00+07:00");
        OffsetDateTime to = from.plusDays(1);
        clear();
        var page = expenses.list(owner, shop(), new Expenses(0, 1, null, "Rent", from, to));
        assertThat(page.items()).extracting(e -> e.id()).containsExactly(last);
        assertThat(page.totalElements()).isEqualTo(2);
        assertSimpleBudget(2);
        assertThat(expenses.list(owner, shop(), new Expenses(1, 1, null, "Rent", from, to)).items())
                .extracting(e -> e.id()).containsExactly(first);
        assertThatThrownBy(() -> expenses.list(owner, shop(), new Expenses(0, 20, "all_time", null, null, null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_REPORT_PERIOD));
    }

    @Test
    void allListsRejectForeignShopBeforeAnyBusinessRead() {
        clear();
        List<Runnable> calls = List.of(
                () -> products.list(owner, Long.toString(otherShopId), Products.defaults()),
                () -> sales.list(owner, Long.toString(otherShopId), Sales.defaults()),
                () -> drafts.list(owner, Long.toString(otherShopId), Drafts.defaults()),
                () -> customers.list(owner, Long.toString(otherShopId), Customers.defaults()),
                () -> debts.list(owner, Long.toString(otherShopId), Debts.defaults()),
                () -> expenses.list(owner, Long.toString(otherShopId), Expenses.defaults()));
        for (Runnable call : calls) assertThatThrownBy(call::run).isInstanceOfSatisfying(BusinessException.class,
                e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.SHOP_ACCESS_DENIED));
        assertThat(sql.businessReads()).isEmpty();
    }

    @Test
    void hundredThousandProductsHaveBoundedPayloadAndTwoQueriesAtDeepOffset() throws Exception {
        jdbc.update("""
                insert into products(shop_id,name,unit,selling_price_vnd,tracked)
                select ?,'Product '||g,'piece',1000,false from generate_series(1,100000) as g
                """, shopId);
        jdbc.execute("analyze products");
        clear();
        long start = System.nanoTime();
        var first = products.list(owner, shop(), Products.defaults());
        long firstMs = (System.nanoTime() - start) / 1_000_000;
        assertThat(first.items()).hasSize(20);
        assertThat(first.totalElements()).isEqualTo(100000);
        assertThat(first.totalPages()).isEqualTo(5000);
        assertSimpleBudget(2);
        assertThat(sql.businessReads().getFirst()).contains("fetch first").doesNotContain(" join ");
        int bytes = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules()
                .writeValueAsBytes(first).length;
        clear();
        start = System.nanoTime();
        var deep = products.list(owner, shop(), new Products(4999, 20, null, null, null, null));
        long deepMs = (System.nanoTime() - start) / 1_000_000;
        assertThat(deep.items()).hasSize(20);
        assertThat(deep.totalElements()).isEqualTo(100000);
        assertThat(deep.items().getFirst().id()).isGreaterThan(first.items().getLast().id());
        assertSimpleBudget(2);
        clear();
        var beyond = products.list(owner, shop(), new Products(5000, 20, null, null, null, null));
        assertThat(beyond.items()).isEmpty();
        assertThat(beyond.totalElements()).isEqualTo(100000);
        assertSimpleBudget(2);
        String plan = String.join("\n", jdbc.queryForList("""
                explain (analyze,buffers) select id from products
                where shop_id=? and status='ACTIVE' order by id offset 99980 limit 20
                """, String.class, shopId));
        String countPlan = String.join("\n", jdbc.queryForList("""
                explain (analyze,buffers) select count(*) from products where shop_id=? and status='ACTIVE'
                """, String.class, shopId));
        org.slf4j.LoggerFactory.getLogger(getClass()).info(
                "Pagination observation (not SLA): products=100000, firstMs={}, deepMs={}, pageBytes={}, dataQueries=2; deepPlan={} countPlan={}",
                firstMs, deepMs, bytes, plan, countPlan);
    }

    @Test
    @org.springframework.transaction.annotation.Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void contentAndCountUseOneSnapshotEvenWhenAnotherRequestInsertsBetweenThem() {
        product(shopId, "Before 1", null, false, null, null);
        product(shopId, "Before 2", null, false, null, null);
        sql.beforeCount = () -> {
            try (Connection connection = connection()) {
                connection.setSchema(SCHEMA);
                try (PreparedStatement insert = connection.prepareStatement(
                        "insert into products(shop_id,name,unit,selling_price_vnd,tracked) values (?,'Concurrent','piece',1000,false)")) {
                    insert.setLong(1, shopId);
                    insert.executeUpdate();
                }
            } catch (SQLException error) { throw new IllegalStateException(error); }
        };
        try {
            var page = products.list(owner, shop(), new Products(0, 1, null, null, null, null));
            assertThat(page.items()).hasSize(1);
            assertThat(page.totalElements()).isEqualTo(2);
            assertThat(jdbc.queryForObject("select count(*) from products where shop_id=?", Long.class, shopId)).isEqualTo(3);
            // This is per-request consistency, not a stable snapshot across separate page requests.
            assertThat(products.list(owner, shop(), new Products(0, 1, null, null, null, null)).totalElements()).isEqualTo(3);
        } finally { sql.beforeCount = null; }
    }

    static class TestCounter extends SqlCounter {
        Runnable beforeCount;
        @Override public String inspect(String statement) {
            String result = super.inspect(statement);
            if (statement.toLowerCase(Locale.ROOT).startsWith("select count(") && beforeCount != null) {
                Runnable hook = beforeCount;
                beforeCount = null;
                hook.run();
            }
            return result;
        }
    }

    private String shop() { return Long.toString(shopId); }
    private void clear() { entityManager.flush(); entityManager.clear(); sql.clear(); }
    private void assertSimpleBudget(int expected) { assertThat(sql.businessReads()).hasSize(expected); }
    private long product(long shop, String name, String barcode, boolean tracked, String stock, String threshold) {
        return jdbc.queryForObject("""
                insert into products(shop_id,name,barcode,unit,selling_price_vnd,tracked,stock_quantity,low_stock_threshold)
                values (?,?,?,'piece',1000,?,?::numeric,?::numeric) returning id
                """, Long.class, shop, name, barcode, tracked, stock, threshold);
    }
    private long customer(long shop, String name, String phone) {
        return jdbc.queryForObject("insert into customers(shop_id,name,normalized_phone) values (?,?,?) returning id", Long.class, shop, name, phone);
    }
    private long sale(long shop, String at, String name) {
        long customer = customer(shop, name, null);
        return jdbc.queryForObject("""
                insert into sales(shop_id,created_by_user_id,customer_id,customer_name_snapshot,subtotal_vnd,discount_vnd,total_vnd,paid_vnd,payment_status,sold_at)
                values (?,?,?,?,1000,0,1000,0,'DEBT',?::timestamptz) returning id
                """, Long.class, shop, userId, customer, name, at);
    }
    private void saleItem(long sale, String name, int line) {
        jdbc.update("""
                insert into sale_items(sale_id,product_name_snapshot,unit_snapshot,quantity,unit_price_vnd,line_total_vnd,stock_deducted)
                values (?,?,'piece',1,500,500,false)
                """, sale, name);
    }
    private long draft(String status, String expires) {
        return jdbc.queryForObject("""
                insert into sale_drafts(shop_id,created_by_user_id,estimated_total_vnd,status,expires_at,expired_at,cancelled_at)
                values (?,?,1000,?,?::timestamptz,
                    case when ?='EXPIRED' then current_timestamp end,
                    case when ?='CANCELLED' then current_timestamp end) returning id
                """, Long.class, shopId, userId, status, expires, status, status);
    }
    private void debt(long sale, long customer) {
        jdbc.update("update sales set customer_id=? where id=?", customer, sale);
        jdbc.update("insert into debts(sale_id,customer_id,original_vnd,outstanding_vnd) values (?,?,1000,1000)", sale, customer);
    }
    private long expense(long shop, String category, String at) {
        return jdbc.queryForObject("""
                insert into expenses(shop_id,created_by_user_id,category,amount_vnd,expense_at)
                values (?,?,?,1000,?::timestamptz) returning id
                """, Long.class, shop, userId, category, at);
    }

    @AfterAll
    static void cleanupSchema() throws SQLException {
        if (schemaCreated && SCHEMA.matches("core_owner_page_test_[a-f0-9]{32}")) {
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

        @Bean TestCounter sqlCounter() { return new TestCounter(); }
        @Bean HibernatePropertiesCustomizer inspectSql(SqlCounter counter) {
            return properties -> properties.put("hibernate.session_factory.statement_inspector", counter);
        }
        @Bean IdempotencyService idempotencyService() { return mock(IdempotencyService.class); }
        @Bean AuditLogService auditLogService() { return mock(AuditLogService.class); }
        @Bean AdminAccessAuditService adminAccessAuditService() { return mock(AdminAccessAuditService.class); }
        @Bean NotificationEventService notificationEventService() { return mock(NotificationEventService.class); }
    }
}
