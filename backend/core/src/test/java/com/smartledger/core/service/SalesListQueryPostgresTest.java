package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.smartledger.core.enums.DraftStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.SaleDraftItemRepository;
import com.smartledger.core.repository.SaleDraftRepository;
import com.smartledger.core.repository.SaleItemRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.SaleDraftServiceImpl;
import com.smartledger.core.service.impl.SaleServiceImpl;
import com.smartledger.core.service.impl.ShopServiceImpl;
import jakarta.persistence.EntityManager;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.UUID;
import java.util.regex.Pattern;
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

/** Real list services, ownership guards and JPQL; all fixture data is synthetic and rolled back per test. */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({SaleServiceImpl.class, SaleDraftServiceImpl.class, ShopServiceImpl.class,
        SalesListQueryPostgresTest.Config.class})
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class SalesListQueryPostgresTest {
    private static final Logger LOG = LoggerFactory.getLogger(SalesListQueryPostgresTest.class);
    private static final String SCHEMA = "core_list_query_test_" + UUID.randomUUID().toString().replace("-", "");
    private static boolean schemaCreated;
    private static final int ITEMS_PER_PARENT = 5;

    @Autowired private SaleService sales;
    @Autowired private SaleDraftService drafts;
    @Autowired private SaleItemRepository saleItems;
    @Autowired private SaleDraftItemRepository draftItems;
    @Autowired private SaleRepository saleRepository;
    @Autowired private SaleDraftRepository draftRepository;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private EntityManager entityManager;
    @Autowired private SqlCounter sql;

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
    void seedOwnersAndForeignShop() {
        owner = new VerifiedFirebaseToken("list-test-" + UUID.randomUUID(), null, false, null, null, null);
        userId = jdbc.queryForObject("insert into users(display_name) values ('List owner') returning id", Long.class);
        jdbc.update("insert into auth_identities(user_id,provider,provider_subject) values (?,'FIREBASE',?)",
                userId, owner.uid());
        shopId = shop(userId, "Selected shop");
        long otherUser = jdbc.queryForObject("insert into users(display_name) values ('Other owner') returning id", Long.class);
        otherShopId = shop(otherUser, "Foreign shop");
        seedSales(otherShopId, otherUser, 3);
        seedDrafts(otherShopId, otherUser, 3);
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 20, 100, 1337, 10000})
    void saleListUsesTwoDataReadsAtEveryDatasetSize(int count) {
        seedSales(shopId, userId, count);
        startCounting();
        long start = System.nanoTime();

        var responses = sales.list(owner, Long.toString(shopId));

        assertDataReads("sales", "sale_items", 2);
        LOG.info("Sale list fixture: parents={}, items={}, dataReads=2, elapsedMs={}",
                count, count * ITEMS_PER_PARENT, (System.nanoTime() - start) / 1_000_000);
        assertThat(responses).hasSize(count);
        assertThat(responses).extracting(response -> response.id()).isSortedAccordingTo(java.util.Comparator.reverseOrder());
        assertThat(responses).allSatisfy(response -> {
            assertThat(response.shopId()).isEqualTo(shopId);
            assertThat(response.items()).hasSize(ITEMS_PER_PARENT);
            assertThat(response.items()).extracting(item -> item.id()).isSorted();
            assertThat(response.items()).allSatisfy(item -> {
                assertThat(item.productId()).isNull();
                assertThat(item.productName()).startsWith("Sale " + response.id() + " item ");
            });
        });
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 20, 100, 1337, 10000})
    void draftListUsesTwoDataReadsAtEveryDatasetSize(int count) {
        seedDrafts(shopId, userId, count);
        startCounting();
        long start = System.nanoTime();

        var responses = drafts.list(owner, Long.toString(shopId));

        assertDataReads("sale_drafts", "sale_draft_items", 2);
        LOG.info("Draft list fixture: parents={}, items={}, dataReads=2, elapsedMs={}",
                count, count * ITEMS_PER_PARENT, (System.nanoTime() - start) / 1_000_000);
        assertThat(responses).hasSize(count);
        assertThat(responses).extracting(response -> response.id()).isSortedAccordingTo(java.util.Comparator.reverseOrder());
        assertThat(responses).allSatisfy(response -> {
            assertThat(response.status()).isEqualTo(DraftStatus.DRAFT);
            assertThat(response.items()).hasSize(ITEMS_PER_PARENT);
            assertThat(response.items()).extracting(item -> item.id()).isSorted();
            assertThat(response.items()).allSatisfy(item -> {
                assertThat(item.productId()).isNull();
                assertThat(item.productName()).startsWith("Draft " + response.id() + " item ");
            });
        });
    }

    @Test
    void emptyShopDoesNotLoadItemsEvenWhenAnotherShopHasData() {
        startCounting();
        assertThat(sales.list(owner, Long.toString(shopId))).isEmpty();
        assertDataReads("sales", "sale_items", 1);

        startCounting();
        assertThat(drafts.list(owner, Long.toString(shopId))).isEmpty();
        assertDataReads("sale_drafts", "sale_draft_items", 1);
    }

    @Test
    void parentsWithoutItemsAndExpiredDraftKeepTheirResponses() {
        seedSales(shopId, userId, 1);
        seedDrafts(shopId, userId, 1);
        jdbc.update("delete from sale_items where sale_id in (select id from sales where shop_id=?)", shopId);
        jdbc.update("delete from sale_draft_items where draft_id in (select id from sale_drafts where shop_id=?)", shopId);
        jdbc.update("update sale_drafts set expires_at=current_timestamp-interval '1 day' where shop_id=?", shopId);

        startCounting();
        var saleResponses = sales.list(owner, Long.toString(shopId));
        assertDataReads("sales", "sale_items", 2);
        assertThat(saleResponses).hasSize(1);
        assertThat(saleResponses.getFirst().items()).isEmpty();

        startCounting();
        var draftResponses = drafts.list(owner, Long.toString(shopId));
        assertDataReads("sale_drafts", "sale_draft_items", 2);
        assertThat(draftResponses).hasSize(1);
        assertThat(draftResponses.getFirst().items()).isEmpty();
        assertThat(draftResponses.getFirst().status()).isEqualTo(DraftStatus.EXPIRED);
        assertThat(jdbc.queryForObject("select status from sale_drafts where shop_id=?", String.class, shopId))
                .isEqualTo("DRAFT");
    }

    @Test
    void archivedCatalogItemsKeepHistoricalSnapshotsAlongsideCustomItems() {
        seedSales(shopId, userId, 1);
        seedDrafts(shopId, userId, 1);
        long productId = jdbc.queryForObject("""
                insert into products(shop_id,name,unit,selling_price_vnd,tracked,status,archived_at,archived_by_user_id)
                values (?,'Renamed catalog product','new unit',9999,false,'ARCHIVED',current_timestamp,?) returning id
                """, Long.class, shopId, userId);
        jdbc.update("""
                update sale_items set product_id=? where id=(
                    select min(i.id) from sale_items i join sales s on s.id=i.sale_id where s.shop_id=?)
                """, productId, shopId);
        jdbc.update("""
                update sale_draft_items set product_id=?,raw_product_name=null where id=(
                    select min(i.id) from sale_draft_items i join sale_drafts d on d.id=i.draft_id where d.shop_id=?)
                """, productId, shopId);

        startCounting();
        var sale = sales.list(owner, Long.toString(shopId)).getFirst();
        assertDataReads("sales", "sale_items", 2);
        assertThat(sale.items()).hasSize(ITEMS_PER_PARENT);
        assertThat(sale.items().getFirst().productId()).isEqualTo(productId);
        assertThat(sale.items().getFirst().productName()).startsWith("Sale " + sale.id());
        assertThat(sale.items().getFirst().unit()).isEqualTo("piece");

        startCounting();
        var draft = drafts.list(owner, Long.toString(shopId)).getFirst();
        assertDataReads("sale_drafts", "sale_draft_items", 2);
        assertThat(draft.items()).hasSize(ITEMS_PER_PARENT);
        assertThat(draft.items().getFirst().productId()).isEqualTo(productId);
        assertThat(draft.items().getFirst().productName()).startsWith("Draft " + draft.id());
        assertThat(draft.items().getFirst().unit()).isEqualTo("piece");
        assertThat(sql.readsOf("products")).isEmpty();
    }

    @Test
    void counterDetectsLegacyNPlusOneForSalesAndDrafts() {
        seedSales(shopId, userId, 100);
        seedDrafts(shopId, userId, 100);

        // Reproduce the old loops as a control, proving that the counter detects N+1.
        startCounting();
        saleRepository.findAllByShopIdOrderByIdDesc(shopId).forEach(sale ->
                assertThat(saleItems.findAllBySaleIdOrderByIdAsc(sale.getId())).hasSize(ITEMS_PER_PARENT));
        assertThat(sql.readsOf("sales")).hasSize(1);
        assertThat(sql.readsOf("sale_items")).hasSize(100);

        startCounting();
        assertThat(sales.list(owner, Long.toString(shopId))).hasSize(100);
        assertDataReads("sales", "sale_items", 2);

        startCounting();
        draftRepository.findAllByShopIdOrderByIdDesc(shopId).forEach(draft ->
                assertThat(draftItems.findAllByDraftIdOrderByIdAsc(draft.getId())).hasSize(ITEMS_PER_PARENT));
        assertThat(sql.readsOf("sale_drafts")).hasSize(1);
        assertThat(sql.readsOf("sale_draft_items")).hasSize(100);

        startCounting();
        assertThat(drafts.list(owner, Long.toString(shopId))).hasSize(100);
        assertDataReads("sale_drafts", "sale_draft_items", 2);
        LOG.info("N+1 control fixture: parents=100, legacyDataReads=101, optimizedDataReads=2 (sales and drafts)");
    }

    @Test
    void foreignShopAccessIsDeniedBeforeReadingSalesOrDrafts() {
        startCounting();
        assertThatThrownBy(() -> sales.list(owner, Long.toString(otherShopId)))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SHOP_ACCESS_DENIED));
        assertThat(sql.readsOf("sales")).isEmpty();
        assertThat(sql.readsOf("sale_items")).isEmpty();

        startCounting();
        assertThatThrownBy(() -> drafts.list(owner, Long.toString(otherShopId)))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SHOP_ACCESS_DENIED));
        assertThat(sql.readsOf("sale_drafts")).isEmpty();
        assertThat(sql.readsOf("sale_draft_items")).isEmpty();
    }

    @Test
    void inactiveShopStillCannotReadLists() {
        jdbc.update("update shops set status='INACTIVE',inactive_reason='Test maintenance' where id=?", shopId);
        startCounting();
        assertThatThrownBy(() -> sales.list(owner, Long.toString(shopId)))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SHOP_INACTIVE));
        assertThatThrownBy(() -> drafts.list(owner, Long.toString(shopId)))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SHOP_INACTIVE));
        assertThat(sql.readsOf("sales")).isEmpty();
        assertThat(sql.readsOf("sale_drafts")).isEmpty();
    }

    @Test
    void detailEndpointsKeepSingleParentQueriesAndHistoricalItems() {
        seedSales(shopId, userId, 1);
        seedDrafts(shopId, userId, 1);
        long saleId = jdbc.queryForObject("select id from sales where shop_id=?", Long.class, shopId);
        long draftId = jdbc.queryForObject("select id from sale_drafts where shop_id=?", Long.class, shopId);
        startCounting();
        assertThat(sales.getById(owner, Long.toString(shopId), Long.toString(saleId)).items()).hasSize(ITEMS_PER_PARENT);
        assertThat(sql.readsOf("sale_items")).hasSize(1).allSatisfy(query -> assertThat(query).doesNotContain(" join "));

        startCounting();
        assertThat(drafts.getById(owner, Long.toString(shopId), Long.toString(draftId)).items()).hasSize(ITEMS_PER_PARENT);
        assertThat(sql.readsOf("sale_draft_items")).hasSize(1).allSatisfy(query -> assertThat(query).doesNotContain(" join "));
        assertThat(saleItems.findAllByShopId(shopId)).hasSize(ITEMS_PER_PARENT);
        assertThat(draftItems.findAllByShopId(shopId)).hasSize(ITEMS_PER_PARENT);
    }

    private long shop(long ownerId, String name) {
        return jdbc.queryForObject("insert into shops(owner_id,name,industry) values (?,?,'Retail') returning id",
                Long.class, ownerId, name);
    }

    private void seedSales(long selectedShop, long selectedOwner, int count) {
        jdbc.update("""
                insert into sales(shop_id,created_by_user_id,subtotal_vnd,discount_vnd,total_vnd,paid_vnd,payment_status)
                select ?,?,5000,0,5000,5000,'PAID' from generate_series(1,?)
                """, selectedShop, selectedOwner, count);
        jdbc.update("""
                insert into sale_items(sale_id,product_name_snapshot,unit_snapshot,quantity,unit_price_vnd,line_total_vnd,
                    stock_deducted)
                select s.id,'Sale '||s.id||' item '||g.line,'piece',1,1000,1000,false
                from sales s cross join generate_series(1,?) as g(line) where s.shop_id=? order by s.id,g.line
                """, ITEMS_PER_PARENT, selectedShop);
    }

    private void seedDrafts(long selectedShop, long selectedOwner, int count) {
        jdbc.update("""
                insert into sale_drafts(shop_id,created_by_user_id,estimated_total_vnd,expires_at)
                select ?,?,5000,current_timestamp+interval '30 days' from generate_series(1,?)
                """, selectedShop, selectedOwner, count);
        jdbc.update("""
                insert into sale_draft_items(draft_id,raw_product_name,product_name_snapshot,unit_snapshot,quantity,
                    unit_price_vnd,line_total_vnd)
                select d.id,'Draft '||d.id||' item '||g.line,'Draft '||d.id||' item '||g.line,'piece',1,1000,1000
                from sale_drafts d cross join generate_series(1,?) as g(line) where d.shop_id=? order by d.id,g.line
                """, ITEMS_PER_PARENT, selectedShop);
    }

    private void startCounting() {
        entityManager.flush();
        entityManager.clear();
        sql.clear();
    }

    private void assertDataReads(String parents, String items, int expected) {
        assertThat(sql.readsOf(parents)).hasSize(1);
        assertThat(sql.readsOf(items)).hasSize(expected - 1);
        // Auth/user/shop checks are deliberately excluded from this data-query budget.
        assertThat(sql.businessReads()).hasSize(expected);
    }

    static class SqlCounter implements StatementInspector {
        private final ThreadLocal<List<String>> statements = ThreadLocal.withInitial(ArrayList::new);

        @Override
        public String inspect(String query) {
            statements.get().add(query.toLowerCase(Locale.ROOT));
            return query;
        }

        void clear() { statements.remove(); }

        List<String> readsOf(String table) {
            return statements.get().stream().filter(query -> query.startsWith("select "))
                    .filter(query -> readsFrom(query, table)).toList();
        }

        List<String> businessReads() {
            return statements.get().stream().filter(query -> query.startsWith("select "))
                    .filter(query -> !readsFrom(query, "auth_identities") && !readsFrom(query, "users")
                            && !readsFrom(query, "shops")).toList();
        }

        private boolean readsFrom(String query, String table) {
            var from = Pattern.compile("\\bfrom\\s+(?:[\\w\"]+\\.)?\"?" + Pattern.quote(table) + "\"?\\b");
            return from.matcher(query).find();
        }
    }

    @AfterAll
    static void cleanupSchema() throws SQLException {
        if (schemaCreated && SCHEMA.matches("core_list_query_test_[a-f0-9]{32}")) {
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

        @Bean SqlCounter sqlCounter() { return new SqlCounter(); }
        @Bean HibernatePropertiesCustomizer inspectSql(SqlCounter counter) {
            return properties -> properties.put("hibernate.session_factory.statement_inspector", counter);
        }
        @Bean AuditLogService auditLogService() { return mock(AuditLogService.class); }
        @Bean AdminAccessAuditService adminAccessAuditService() { return mock(AdminAccessAuditService.class); }
        @Bean NotificationEventService notificationEventService() { return mock(NotificationEventService.class); }
    }
}
