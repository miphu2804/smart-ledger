package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.enums.ReportItemSource;
import com.smartledger.core.enums.TopProductSort;
import com.smartledger.core.repository.ReportAggregationRepository;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Properties;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
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
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ReportAggregationRepository.class, ReportAggregationPostgresTest.PostgresConfig.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ReportAggregationPostgresTest {
    private static final String SCHEMA = "core_report_test_" + UUID.randomUUID().toString().replace("-", "");
    private static boolean schemaCreated;

    @Autowired private ReportAggregationRepository reports;
    @Autowired private JdbcTemplate jdbc;
    private long shopId;
    private long userId;
    private long productId;
    private long catalogSaleId;

    @DynamicPropertySource
    static void schema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }

    @BeforeEach
    void seed() {
        userId = jdbc.queryForObject("""
                insert into users(display_name) values ('Report owner') returning id
                """, Long.class);
        shopId = jdbc.queryForObject("""
                insert into shops(owner_id,name,industry) values (?,'Report shop','Retail') returning id
                """, Long.class, userId);
        productId = jdbc.queryForObject("""
                insert into products(shop_id,name,unit,selling_price_vnd,cost_price_vnd,tracked)
                values (?,'Coffee','cup',100000,60000,false) returning id
                """, Long.class, shopId);
        catalogSaleId = sale("2026-10-01T03:00:00Z", null, 100_000L, 10_000L, 90_000L, "CONFIRMED");
        jdbc.update("""
                insert into sale_items(sale_id,product_id,product_name_snapshot,unit_snapshot,quantity,
                    unit_price_vnd,line_total_vnd,estimated_cost_vnd)
                values (?,?,?,?,1,100000,100000,60000)
                """, catalogSaleId, productId, "Coffee", "cup");
        long customVoidedSale = sale("2026-09-20T03:00:00Z", "2026-10-02T03:00:00Z",
                40_000L, 0, 40_000L, "VOIDED");
        jdbc.update("""
                insert into sale_items(sale_id,product_id,product_name_snapshot,unit_snapshot,quantity,
                    unit_price_vnd,line_total_vnd,estimated_cost_vnd)
                values (?,null,'Cake','piece',1,40000,40000,null)
                """, customVoidedSale);
        jdbc.update("""
                insert into expenses(shop_id,created_by_user_id,description,amount_vnd,expense_at)
                values (?,?,'Rent',10000,'2026-10-03T03:00:00Z')
                """, shopId, userId);
    }

    @Test
    void aggregatesDiscountedRevenueVoidEventsCostsAndCustomItems() {
        OffsetDateTime from = OffsetDateTime.parse("2026-09-30T17:00:00Z");
        OffsetDateTime to = OffsetDateTime.parse("2026-10-04T17:00:00Z");

        var top = reports.topProducts(shopId, from, to, TopProductSort.NET_REVENUE, 10);
        var series = reports.salesSeries(shopId, from, to);
        var profit = reports.profitEstimate(shopId, from, to);

        assertThat(top).hasSize(2);
        assertThat(top.getFirst().productName()).isEqualTo("Coffee");
        assertThat(top.getFirst().grossRevenueVnd()).isEqualTo(90_000L);
        assertThat(top.getLast().source()).isEqualTo(ReportItemSource.CUSTOM);
        assertThat(top.getLast().netRevenueVnd()).isEqualTo(-40_000L);
        assertThat(series).extracting(row -> row.date().toString())
                .containsExactly("2026-10-01", "2026-10-02");
        assertThat(series.getFirst().netRevenueVnd()).isEqualTo(90_000L);
        assertThat(series.getLast().netRevenueVnd()).isEqualTo(-40_000L);
        assertThat(profit.grossRevenueVnd()).isEqualTo(90_000L);
        assertThat(profit.voidedRevenueVnd()).isEqualTo(40_000L);
        assertThat(profit.grossEstimatedCogsVnd()).isEqualTo(60_000L);
        assertThat(profit.voidedEstimatedCogsVnd()).isZero();
        assertThat(profit.expenseVnd()).isEqualTo(10_000L);
        assertThat(profit.unknownCostItemCount()).isEqualTo(1L);
        assertThat(profit.unknownCostRevenueVnd()).isEqualTo(40_000L);
    }

    @Test
    void migrationKeepsHistoricalCostNullableAndRejectsNegativeSnapshots() {
        assertThat(jdbc.queryForObject("select estimated_cost_vnd from sale_items where sale_id=?",
                Long.class, catalogSaleId)).isEqualTo(60_000L);
        assertThatThrownBy(() -> jdbc.update("update sale_items set estimated_cost_vnd=-1 where sale_id=?",
                catalogSaleId)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void allocatesMultiLineDiscountExactlyAndIgnoresCurrentProductCost() {
        long secondProductId = jdbc.queryForObject("""
                insert into products(shop_id,name,unit,selling_price_vnd,cost_price_vnd,tracked)
                values (?,'Tea','cup',66667,20000,false) returning id
                """, Long.class, shopId);
        long saleId = sale("2026-10-05T03:00:00Z", null, 100_000L, 9_999L, 90_001L,
                "CONFIRMED");
        jdbc.update("""
                insert into sale_items(sale_id,product_id,product_name_snapshot,unit_snapshot,quantity,
                    unit_price_vnd,line_total_vnd,estimated_cost_vnd)
                values (?,?, 'Coffee','cup',1,33333,33333,10000),
                       (?,?, 'Tea','cup',1,66667,66667,20000)
                """, saleId, productId, saleId, secondProductId);
        OffsetDateTime from = OffsetDateTime.parse("2026-10-04T17:00:00Z");
        OffsetDateTime to = OffsetDateTime.parse("2026-10-05T17:00:00Z");

        var before = reports.profitEstimate(shopId, from, to);
        var top = reports.topProducts(shopId, from, to, TopProductSort.NET_REVENUE, 10);
        jdbc.update("update products set cost_price_vnd=999999 where id in (?,?)",
                productId, secondProductId);
        var after = reports.profitEstimate(shopId, from, to);

        assertThat(top).hasSize(2);
        assertThat(top.stream().mapToLong(ReportAggregationRepository.TopProductRow::grossRevenueVnd).sum())
                .isEqualTo(90_001L);
        assertThat(before.grossEstimatedCogsVnd()).isEqualTo(30_000L);
        assertThat(after.grossEstimatedCogsVnd()).isEqualTo(before.grossEstimatedCogsVnd());
        assertThat(after.unknownCostItemCount()).isZero();
    }

    private long sale(String soldAt, String voidedAt, long subtotal, long discount, long total,
            String status) {
        return jdbc.queryForObject("""
                insert into sales(shop_id,created_by_user_id,subtotal_vnd,discount_vnd,total_vnd,paid_vnd,
                    sale_status,payment_status,sold_at,voided_at,voided_by_user_id,void_reason)
                values (?,?,?,?,?,? ,?,'PAID',?::timestamptz,?::timestamptz,?,?) returning id
                """, Long.class, shopId, userId, subtotal, discount, total, total, status, soldAt, voidedAt,
                voidedAt == null ? null : userId, voidedAt == null ? null : "Customer return");
    }

    @AfterAll
    static void cleanupSchema() throws SQLException {
        if (schemaCreated && SCHEMA.matches("core_report_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var sql = connection.createStatement()) {
                sql.execute("drop schema \"" + SCHEMA + "\" cascade");
            }
        }
    }

    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class PostgresConfig {
        @Bean
        DataSource dataSource() throws SQLException {
            try (var connection = connection(); var sql = connection.createStatement()) {
                sql.execute("create schema \"" + SCHEMA + "\"");
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
