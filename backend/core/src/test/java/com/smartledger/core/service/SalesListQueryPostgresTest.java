package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.smartledger.core.dto.request.OwnerListQuery.*;
import com.smartledger.core.dto.response.SaleSummaryResponse;
import com.smartledger.core.enums.DraftStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.SaleStatus;
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
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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
import org.junit.jupiter.params.provider.EnumSource;
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

/**
 * Exercises real list services, ownership guards and JPQL with synthetic fixtures rolled back per test.
 * Requires CORE_TEST_POSTGRES_* for a dedicated database; clears the persistence context before counting
 * Hibernate reads, excluding fixture JDBC and auth/user/shop queries from the data-query budget.
 * Logged service timings are single observations, not repeated benchmarks or latency SLAs.
 */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({com.smartledger.core.ratelimit.UserRateLimitService.class, com.smartledger.core.repository.UserRateLimitRepository.class, SaleServiceImpl.class, SaleDraftServiceImpl.class, ShopServiceImpl.class,
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
    void saleListUsesBoundedPageReadsAtEveryDatasetSize(int count) {
        seedSales(shopId, userId, count);
        startCounting();
        long start = System.nanoTime();

        var page = sales.list(owner, Long.toString(shopId), new Sales(0, 100, null, null, null, null));
        var responses = page.items();
        assertThat(page.totalElements()).isEqualTo(count);
        assertThat(page.totalPages()).isEqualTo((count + 99) / 100);

        assertDataReads("sales", "sale_items", count >= 100 ? 3 : 2);
        LOG.info("Sale list fixture: parents={}, items={}, pageSize=100, elapsedMs={}",
                count, count * ITEMS_PER_PARENT, (System.nanoTime() - start) / 1_000_000);
        assertThat(responses).hasSize(Math.min(count, 100));
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
    void draftListUsesBoundedPageReadsAtEveryDatasetSize(int count) {
        seedDrafts(shopId, userId, count);
        startCounting();
        long start = System.nanoTime();

        var page = drafts.list(owner, Long.toString(shopId), new Drafts(0, 100, null));
        var responses = page.items();
        assertThat(page.totalElements()).isEqualTo(count);
        assertThat(page.totalPages()).isEqualTo((count + 99) / 100);

        assertDataReads("sale_drafts", "sale_draft_items", count >= 100 ? 3 : 2);
        LOG.info("Draft list fixture: parents={}, items={}, pageSize=100, elapsedMs={}",
                count, count * ITEMS_PER_PARENT, (System.nanoTime() - start) / 1_000_000);
        assertThat(responses).hasSize(Math.min(count, 100));
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
        assertThat(sales.list(owner, Long.toString(shopId), new Sales(0, 100, null, null, null, null)).items()).isEmpty();
        assertDataReads("sales", "sale_items", 1);

        startCounting();
        assertThat(drafts.list(owner, Long.toString(shopId), new Drafts(0, 100, null)).items()).isEmpty();
        assertDataReads("sale_drafts", "sale_draft_items", 1);
    }

    @Test
    void saleSummaryUsesOneAggregateReadForTenThousandSalesWithoutHydratingItems() {
        seedSales(shopId, userId, 10_000);
        jdbc.update("""
                update sales set sale_status='VOIDED', voided_at=current_timestamp,
                    voided_by_user_id=?, void_reason='Summary test'
                where id in (select id from sales where shop_id=? order by id limit 2_000)
                """, userId, shopId);
        startCounting();
        long start = System.nanoTime();

        var summary = sales.summary(owner, Long.toString(shopId), SalesSummary.defaults());

        assertThat(summary.matchedOrderCount()).isEqualTo(10_000L);
        assertThat(summary.confirmedOrderCount()).isEqualTo(8_000L);
        assertThat(summary.voidedOrderCount()).isEqualTo(2_000L);
        assertThat(summary.confirmedSalesVnd()).isEqualTo(40_000_000L);
        assertThat(summary.voidedSalesVnd()).isEqualTo(10_000_000L);
        assertThat(sql.businessReads()).hasSize(1);
        assertThat(sql.readsOf("sales")).hasSize(1);
        assertThat(sql.readsOf("sale_items")).isEmpty();
        LOG.info("Sale summary fixture: sales=10000, items=50000, aggregateReads=1, elapsedMs={}",
                (System.nanoTime() - start) / 1_000_000);
    }

    @Test
    void saleSummaryReusesItemSearchWithoutDuplicateCountingAndHonorsStatus() {
        seedSales(shopId, userId, 1);
        jdbc.update("""
                update sale_items set product_name_snapshot='Cà phê match'
                where sale_id=(select id from sales where shop_id=? limit 1)
                """, shopId);

        startCounting();
        var confirmed = sales.summary(owner, Long.toString(shopId),
                new SalesSummary("ca phe match", SaleStatus.CONFIRMED, null, null));

        assertThat(confirmed.matchedOrderCount()).isOne();
        assertThat(confirmed.confirmedOrderCount()).isOne();
        assertThat(confirmed.voidedOrderCount()).isZero();
        assertThat(confirmed.confirmedSalesVnd()).isEqualTo(5_000L);
        assertThat(confirmed.voidedSalesVnd()).isZero();
        assertThat(sql.businessReads()).hasSize(1);
        assertThat(sql.readsOf("sales")).hasSize(1);
    }

    @ParameterizedTest
    @EnumSource(SaleStatus.class)
    void saleSummaryRejectsAValueOutsideTheApiLongRangeInsteadOfReturningCorruptedMoney(SaleStatus status) {
        // PAID rows satisfy the real customer/debt constraint even at the monetary boundary.
        jdbc.update("""
                insert into sales(shop_id,created_by_user_id,subtotal_vnd,discount_vnd,total_vnd,paid_vnd,payment_status)
                values (?, ?, ?, 0, ?, ?, 'PAID'), (?, ?, ?, 0, ?, ?, 'PAID')
                """, shopId, userId, Long.MAX_VALUE, Long.MAX_VALUE,
                Long.MAX_VALUE, shopId, userId, Long.MAX_VALUE, Long.MAX_VALUE, Long.MAX_VALUE);
        if (status == SaleStatus.VOIDED) {
            jdbc.update("""
                    update sales set sale_status='VOIDED',voided_at=current_timestamp,
                        voided_by_user_id=?,void_reason='Overflow fixture' where shop_id=?
                    """, userId, shopId);
        }
        startCounting();

        assertThatThrownBy(() -> sales.summary(owner, Long.toString(shopId), SalesSummary.defaults()))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SALE_SUMMARY_OVERFLOW));
        assertThat(sql.businessReads()).hasSize(1);
    }

    @Test
    void saleSummaryReturnsFiveZerosForEmptyOrUnmatchedSetsAndExcludesDrafts() {
        seedDrafts(shopId, userId, 2);
        startCounting();
        assertThat(sales.summary(owner, Long.toString(shopId), SalesSummary.defaults()))
                .isEqualTo(new SaleSummaryResponse(0, 0, 0, 0, 0));
        assertThat(sql.businessReads()).hasSize(1);

        seedSales(shopId, userId, 2);
        startCounting();
        assertThat(sales.summary(owner, Long.toString(shopId),
                new SalesSummary("no matching snapshot", null, null, null)))
                .isEqualTo(new SaleSummaryResponse(0, 0, 0, 0, 0));
        assertThat(sql.businessReads()).hasSize(1);
    }

    @Test
    void saleSummaryCombinesAllFiltersWithHalfOpenBoundsAndEquivalentOffsets() {
        var from = OffsetDateTime.parse("2026-10-01T00:00:00+07:00");
        var to = from.plusDays(1);
        summarySale("Cà phê", from.minusSeconds(1), 10_000, 0, 10_000, null);
        summarySale("Cà phê", from, 20_000, 0, 20_000, null);
        summarySale("Cà phê", to.minusNanos(1_000), 30_000, 0, 30_000, null);
        summarySale("Cà phê", to, 40_000, 0, 40_000, null);
        summarySale("Tea", from.plusHours(1), 50_000, 0, 50_000, null);
        long voided = summarySale("Cà phê", from.plusHours(2), 60_000, 0, 60_000, null);
        voidSummarySale(voided, to.plusMonths(1));
        var filter = new SalesSummary("  CA PHE  ", SaleStatus.CONFIRMED, from, to);
        startCounting();

        var summary = sales.summary(owner, Long.toString(shopId), filter);

        assertThat(summary).isEqualTo(new SaleSummaryResponse(2, 2, 0, 50_000, 0));
        assertThat(sql.businessReads()).hasSize(1);
        assertThat(sales.summary(owner, Long.toString(shopId), new SalesSummary("ca phe",
                SaleStatus.CONFIRMED, from.withOffsetSameInstant(ZoneOffset.UTC),
                to.withOffsetSameInstant(ZoneOffset.UTC)))).isEqualTo(summary);
        var page = sales.list(owner, Long.toString(shopId),
                new Sales(0, 1, filter.q(), filter.saleStatus(), filter.from(), filter.to()));
        assertThat(page.totalElements()).isEqualTo(summary.matchedOrderCount());
        assertThat(page.items()).hasSize(1);
        assertThat(sales.summary(owner, Long.toString(shopId),
                new SalesSummary("ca phe", SaleStatus.CONFIRMED, from, null)))
                .isEqualTo(new SaleSummaryResponse(3, 3, 0, 90_000, 0));
        assertThat(sales.summary(owner, Long.toString(shopId),
                new SalesSummary("ca phe", SaleStatus.CONFIRMED, null, to)))
                .isEqualTo(new SaleSummaryResponse(3, 3, 0, 60_000, 0));
    }

    @Test
    void saleSummaryUsesDiscountedSaleValueForPaidPartialDebtAndCrossPeriodVoid() {
        var october = OffsetDateTime.parse("2026-10-01T00:00:00+07:00");
        long customer = jdbc.queryForObject("insert into customers(shop_id,name) values (?,'Buyer') returning id",
                Long.class, shopId);
        summarySale("Buyer", october.plusDays(1), 100_000, 10_000, 90_000, null);
        long partial = summarySale("Buyer", october.plusDays(2), 80_000, 20_000, 20_000, customer);
        long debt = summarySale("Buyer", october.plusDays(3), 50_000, 0, 0, customer);
        jdbc.update("""
                insert into debts(sale_id,customer_id,original_vnd,outstanding_vnd)
                values (?,?,40000,40000),(?,?,50000,50000)
                """, partial, customer, debt, customer);
        long previousMonth = summarySale("Buyer", october.minusHours(1), 100_000, 30_000, 70_000, null);
        voidSummarySale(previousMonth, october.plusDays(4));

        startCounting();
        assertThat(sales.summary(owner, Long.toString(shopId),
                new SalesSummary(null, null, october, october.plusMonths(1))))
                .isEqualTo(new SaleSummaryResponse(3, 3, 0, 200_000, 0));
        assertThat(sales.summary(owner, Long.toString(shopId),
                new SalesSummary(null, SaleStatus.VOIDED, october.minusMonths(1), october)))
                .isEqualTo(new SaleSummaryResponse(1, 0, 1, 0, 70_000));
        assertThat(sales.summary(owner, Long.toString(shopId), SalesSummary.defaults()))
                .isEqualTo(new SaleSummaryResponse(4, 3, 1, 200_000, 70_000));
        assertThat(sql.businessReads()).hasSize(3);
    }

    @Test
    void saleSummarySupportsExactIdLiteralWildcardsAndArchivedProductSnapshots() {
        var soldAt = OffsetDateTime.parse("2026-10-01T12:00:00+07:00");
        long saleId = summarySale("Buyer", soldAt, 5_000, 0, 5_000, null);
        summarySale("Not a match", soldAt, 6_000, 0, 6_000, null);
        long productId = jdbc.queryForObject("""
                insert into products(shop_id,name,unit,selling_price_vnd,tracked,status,archived_at,archived_by_user_id)
                values (?,'Current name','piece',1000,false,'ARCHIVED',current_timestamp,?) returning id
                """, Long.class, shopId, userId);
        jdbc.update("""
                insert into sale_items(sale_id,product_id,product_name_snapshot,unit_snapshot,quantity,
                    unit_price_vnd,line_total_vnd,stock_deducted)
                values (?,?,'Cà phê 100%_!','piece',1,5000,5000,false)
                """, saleId, productId);
        startCounting();
        var expected = new SaleSummaryResponse(1, 1, 0, 5_000, 0);
        assertThat(sales.summary(owner, Long.toString(shopId),
                new SalesSummary(Long.toString(saleId), null, null, null))).isEqualTo(expected);
        assertThat(sales.summary(owner, Long.toString(shopId),
                new SalesSummary("CA PHE 100%_!", null, null, null))).isEqualTo(expected);
        assertThat(sql.businessReads()).hasSize(2);
        assertThat(sql.readsOf("products")).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"ADMIN", "DISABLED", "FOREIGN", "INACTIVE", "ARCHIVED"})
    void saleSummaryRejectsUnauthorizedAccessBeforeAggregateRead(String scenario) {
        seedSales(shopId, userId, 1);
        long selectedShop = shopId;
        ErrorCode expected;
        switch (scenario) {
            case "ADMIN" -> {
                jdbc.update("update users set system_role='ADMIN' where id=?", userId);
                expected = ErrorCode.SHOP_ACCESS_DENIED;
            }
            case "DISABLED" -> {
                jdbc.update("update users set status='DISABLED' where id=?", userId);
                expected = ErrorCode.ACCOUNT_DISABLED;
            }
            case "FOREIGN" -> {
                selectedShop = otherShopId;
                expected = ErrorCode.SHOP_ACCESS_DENIED;
            }
            case "INACTIVE" -> {
                jdbc.update("update shops set status='INACTIVE',inactive_reason='Test maintenance' where id=?", shopId);
                expected = ErrorCode.SHOP_INACTIVE;
            }
            case "ARCHIVED" -> {
                jdbc.update("update shops set status='ARCHIVED',archived_at=current_timestamp,archived_reason='Test archive' where id=?", shopId);
                expected = ErrorCode.SHOP_NOT_FOUND;
            }
            default -> throw new IllegalArgumentException(scenario);
        }
        String selected = Long.toString(selectedShop);
        startCounting();

        assertThatThrownBy(() -> sales.summary(owner, selected, SalesSummary.defaults()))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(expected));
        assertThat(sql.businessReads()).isEmpty();
    }

    @ParameterizedTest
    @EnumSource(SaleStatus.class)
    void saleSummaryAcceptsExactlyLongMaxValue(SaleStatus status) {
        long sale = summarySale("Boundary", OffsetDateTime.parse("2026-10-01T00:00:00Z"),
                Long.MAX_VALUE, 0, Long.MAX_VALUE, null);
        if (status == SaleStatus.VOIDED) voidSummarySale(sale, OffsetDateTime.parse("2026-11-01T00:00:00Z"));
        var expected = status == SaleStatus.CONFIRMED
                ? new SaleSummaryResponse(1, 1, 0, Long.MAX_VALUE, 0)
                : new SaleSummaryResponse(1, 0, 1, 0, Long.MAX_VALUE);
        startCounting();
        assertThat(sales.summary(owner, Long.toString(shopId), SalesSummary.defaults())).isEqualTo(expected);
        assertThat(sql.businessReads()).hasSize(1);
    }

    @Test
    void parentsWithoutItemsAndExpiredDraftKeepTheirResponses() {
        seedSales(shopId, userId, 1);
        seedDrafts(shopId, userId, 1);
        jdbc.update("delete from sale_items where sale_id in (select id from sales where shop_id=?)", shopId);
        jdbc.update("delete from sale_draft_items where draft_id in (select id from sale_drafts where shop_id=?)", shopId);
        jdbc.update("update sale_drafts set expires_at=current_timestamp-interval '1 day' where shop_id=?", shopId);

        startCounting();
        var saleResponses = sales.list(owner, Long.toString(shopId), new Sales(0, 100, null, null, null, null)).items();
        assertDataReads("sales", "sale_items", 2);
        assertThat(saleResponses).hasSize(1);
        assertThat(saleResponses.getFirst().items()).isEmpty();

        startCounting();
        var draftResponses = drafts.list(owner, Long.toString(shopId), new Drafts(0, 100, null)).items();
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
        var sale = sales.list(owner, Long.toString(shopId), new Sales(0, 100, null, null, null, null)).items().getFirst();
        assertDataReads("sales", "sale_items", 2);
        assertThat(sale.items()).hasSize(ITEMS_PER_PARENT);
        assertThat(sale.items().getFirst().productId()).isEqualTo(productId);
        assertThat(sale.items().getFirst().productName()).startsWith("Sale " + sale.id());
        assertThat(sale.items().getFirst().unit()).isEqualTo("piece");

        startCounting();
        var draft = drafts.list(owner, Long.toString(shopId), new Drafts(0, 100, null)).items().getFirst();
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
        assertThat(sales.list(owner, Long.toString(shopId), new Sales(0, 100, null, null, null, null)).items()).hasSize(100);
        assertDataReads("sales", "sale_items", 3);

        startCounting();
        draftRepository.findAllByShopIdOrderByIdDesc(shopId).forEach(draft ->
                assertThat(draftItems.findAllByDraftIdOrderByIdAsc(draft.getId())).hasSize(ITEMS_PER_PARENT));
        assertThat(sql.readsOf("sale_drafts")).hasSize(1);
        assertThat(sql.readsOf("sale_draft_items")).hasSize(100);

        startCounting();
        assertThat(drafts.list(owner, Long.toString(shopId), new Drafts(0, 100, null)).items()).hasSize(100);
        assertDataReads("sale_drafts", "sale_draft_items", 3);
        LOG.info("N+1 control fixture: parents=100, legacyDataReads=101, optimizedDataReads=3 (sales and drafts, including count)");
    }

    @Test
    void foreignShopAccessIsDeniedBeforeReadingSalesOrDrafts() {
        startCounting();
        assertThatThrownBy(() -> sales.list(owner, Long.toString(otherShopId), new Sales(0, 100, null, null, null, null)).items())
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SHOP_ACCESS_DENIED));
        assertThat(sql.readsOf("sales")).isEmpty();
        assertThat(sql.readsOf("sale_items")).isEmpty();

        startCounting();
        assertThatThrownBy(() -> drafts.list(owner, Long.toString(otherShopId), new Drafts(0, 100, null)).items())
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SHOP_ACCESS_DENIED));
        assertThat(sql.readsOf("sale_drafts")).isEmpty();
        assertThat(sql.readsOf("sale_draft_items")).isEmpty();
    }

    @Test
    void inactiveShopStillCannotReadLists() {
        jdbc.update("update shops set status='INACTIVE',inactive_reason='Test maintenance' where id=?", shopId);
        startCounting();
        assertThatThrownBy(() -> sales.list(owner, Long.toString(shopId), new Sales(0, 100, null, null, null, null)).items())
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SHOP_INACTIVE));
        assertThatThrownBy(() -> drafts.list(owner, Long.toString(shopId), new Drafts(0, 100, null)).items())
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

    private long summarySale(String name, OffsetDateTime soldAt, long subtotal, long discount, long paid,
            Long customerId) {
        long total = subtotal - discount;
        String paymentStatus = paid == total ? "PAID" : paid == 0 ? "DEBT" : "PARTIAL";
        return jdbc.queryForObject("""
                insert into sales(shop_id,created_by_user_id,customer_id,customer_name_snapshot,sold_at,
                    subtotal_vnd,discount_vnd,total_vnd,paid_vnd,payment_status)
                values (?,?,?,?,?,?,?,?,?,?) returning id
                """, Long.class, shopId, userId, customerId, name, soldAt, subtotal, discount, total, paid, paymentStatus);
    }

    private void voidSummarySale(long saleId, OffsetDateTime voidedAt) {
        jdbc.update("""
                update sales set sale_status='VOIDED',voided_at=?,voided_by_user_id=?,void_reason='Summary test'
                where id=? and shop_id=?
                """, voidedAt, userId, saleId, shopId);
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

    /** Flushes fixtures and clears the first-level cache before resetting the Hibernate SQL counter. */
    private void startCounting() {
        entityManager.flush();
        entityManager.clear();
        sql.clear();
    }

    private void assertDataReads(String parents, String items, int expected) {
        assertThat(sql.readsOf(parents)).hasSize(expected == 3 ? 2 : 1);
        assertThat(sql.readsOf(items)).hasSize(expected == 1 ? 0 : 1);
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
