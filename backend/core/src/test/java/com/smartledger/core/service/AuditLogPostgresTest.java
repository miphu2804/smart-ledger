package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.dto.request.*;
import com.smartledger.core.dto.request.OwnerListQuery.*;
import com.smartledger.core.entity.*;
import com.smartledger.core.enums.*;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.*;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.*;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.InvalidDataAccessApiUsageException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** Real services/auth mapping/idempotency with real PostgreSQL transactions.
 * Flyway migrates ONLY a generated test schema; no user DB changes. */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({AuditLogServiceImpl.class, AuditLogQueryServiceImpl.class, ShopServiceImpl.class,
        AdminAccessAuditService.class, NotificationEventServiceImpl.class,
        CategoryServiceImpl.class, ProductServiceImpl.class, SaleDraftServiceImpl.class, DebtServiceImpl.class,
        SaleVoidServiceImpl.class, SaleServiceImpl.class, PaymentServiceImpl.class,
        ExpenseServiceImpl.class, CustomerServiceImpl.class, IdempotencyServiceImpl.class,
        IdempotencyKeyRepository.class, AuditLogPostgresTest.PostgresConfig.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AuditLogPostgresTest {
    private static final String SCHEMA = "core_audit_test_" + UUID.randomUUID().toString().replace("-", "");
    private static boolean schemaCreated;
    @Autowired private ShopService shops;
    @Autowired private CategoryService categories;
    @Autowired private ProductService products;
    @Autowired private SaleDraftService drafts;
    @Autowired private DebtService debts;
    @Autowired private SaleVoidService voids;
    @Autowired private SaleService sales;
    @Autowired private PaymentService payments;
    @Autowired private ExpenseService expenses;
    @Autowired private CustomerService customers;
    @Autowired private AuditLogService audit;
    @Autowired private AuditLogQueryService query;
    @Autowired private AuditLogRepository auditRepository;
    @Autowired private UserAccountRepository users;
    @Autowired private AuthIdentityRepository identities;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private JdbcTemplate jdbc;
    private VerifiedFirebaseToken owner;
    private VerifiedFirebaseToken other;
    private Long ownerId;
    private Long otherId;
    private String shop;

    @DynamicPropertySource
    static void isolatedSchema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
    }

    @BeforeEach
    void seedTrustedActorsAndShop() {
        owner = token("owner");
        other = token("other");
        ownerId = saveUser(owner);
        otherId = saveUser(other);
        shop = shops.create(owner, new ShopCreateRequest("Private shop", "Retail", "0909999999", "Private address")).id().toString();
    }

    @Test
    void confirmationAndFullVoidAreAuditedOnceAndContainNoCustomerPii() {
        Fixture fixture = sale(40_000L, false);
        var first = voids.voidSale(owner, shop, fixture.saleId(), "void-retry",
                new SaleVoidRequest("Returned", true, PaymentMethod.CASH, "private-bank-reference"));
        var replay = voids.voidSale(owner, shop, fixture.saleId(), "void-retry",
                new SaleVoidRequest("Returned", true, PaymentMethod.CASH, "private-bank-reference"));
        assertThat(replay.refund().id()).isEqualTo(first.refund().id());
        assertThat(count(AuditAction.SALE_CONFIRMED)).isEqualTo(1);
        assertThat(count(AuditAction.SALE_VOIDED)).isEqualTo(1);
        assertThat(count(AuditAction.SALE_REFUND_RECORDED)).isEqualTo(1);
        assertThat(count(AuditAction.DEBT_VOIDED)).isEqualTo(1);
        assertThat(count(AuditAction.STOCK_RESTORED_ON_VOID)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(distinct request_id) FROM audit_logs WHERE shop_id=? AND idempotency_key='void-retry'", Integer.class, Long.valueOf(shop))).isEqualTo(1);
        var event = query.list(owner, shop, AuditAction.SALE_VOIDED, Long.valueOf(fixture.saleId()), null, null, 0, 20).content().getFirst();
        assertThat(event.actorUserId()).isEqualTo(ownerId);
        assertThat(event.metadata()).containsEntry("refundedVnd", 40_000).containsEntry("cancelledDebtVnd", 60_000);
        assertThat(event.createdAt().getOffset()).isEqualTo(ZoneOffset.UTC);
        String json = jdbc.queryForObject("SELECT string_agg(metadata::text, ' ') FROM audit_logs WHERE shop_id=?", String.class, Long.valueOf(shop));
        assertThat(json).doesNotContain("Sensitive customer", "0901234567", "private-bank-reference", "Private address", "0909999999", "@example.test");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE shop_id=? AND (old_data IS NOT NULL OR new_data IS NOT NULL OR ip_address IS NOT NULL)", Integer.class, Long.valueOf(shop))).isZero();
        assertThatThrownBy(() -> voids.voidSale(owner, shop, fixture.saleId(), "new-key",
                new SaleVoidRequest("Returned", true, PaymentMethod.CASH, null))).isInstanceOf(BusinessException.class);
        assertThat(count(AuditAction.SALE_VOIDED)).isEqualTo(1);
    }

    @Test
    void repaymentAndExpenseReplayDoNotDuplicateAudit() {
        Fixture fixture = sale(40_000L, false);
        var request = new DebtRepaymentRequest(20_000L, PaymentMethod.CASH, null);
        var first = debts.repay(owner, shop, fixture.debtId(), "repay", request);
        assertThat(debts.repay(owner, shop, fixture.debtId(), "repay", request).payment().id()).isEqualTo(first.payment().id());
        assertThat(count(AuditAction.DEBT_REPAYMENT_RECORDED)).isEqualTo(1);
        var write = new ExpenseWriteRequest("Rent", "Private memo", 10_000L, PaymentMethod.CASH, null);
        var expense = expenses.create(owner, shop, "expense", write);
        assertThat(expenses.create(owner, shop, "expense", write).id()).isEqualTo(expense.id());
        assertThat(count(AuditAction.EXPENSE_CREATED)).isEqualTo(1);
        long before = total();
        assertThatThrownBy(() -> expenses.create(owner, shop, "expense",
                new ExpenseWriteRequest("Rent", "Changed", 20_000L, PaymentMethod.CASH, null))).isInstanceOf(BusinessException.class);
        assertThat(total()).isEqualTo(before);
    }

    @Test
    void auditInsertFailureRollsBackAllVoidChangesAndIdempotencyReservation() {
        Fixture fixture = sale(40_000L, false);
        long before = total();
        jdbc.execute("ALTER TABLE audit_logs ADD CONSTRAINT test_reject_void CHECK (shop_id <> "
                + Long.valueOf(shop) + " OR action <> 'SALE_VOIDED')");
        try {
            assertThatThrownBy(() -> voids.voidSale(owner, shop, fixture.saleId(), "retry-after-failure",
                    new SaleVoidRequest("Returned", true, PaymentMethod.CASH, null))).isInstanceOf(DataIntegrityViolationException.class);
        } finally {
            jdbc.execute("ALTER TABLE audit_logs DROP CONSTRAINT test_reject_void");
        }
        assertThat(total()).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT sale_status FROM sales WHERE id=?", String.class, Long.valueOf(fixture.saleId()))).isEqualTo("CONFIRMED");
        assertThat(jdbc.queryForObject("SELECT outstanding_vnd FROM debts WHERE id=?", Long.class, Long.valueOf(fixture.debtId()))).isEqualTo(60_000L);
        assertThat(jdbc.queryForObject("SELECT stock_quantity FROM products WHERE id=?", BigDecimal.class, fixture.productId())).isEqualByComparingTo("8");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM sale_refunds WHERE sale_id=?", Integer.class, Long.valueOf(fixture.saleId()))).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM api_idempotency_keys WHERE shop_id=? AND idempotency_key='retry-after-failure'", Integer.class, Long.valueOf(shop))).isZero();
        voids.voidSale(owner, shop, fixture.saleId(), "retry-after-failure", new SaleVoidRequest("Returned", true, PaymentMethod.CASH, null));
        assertThat(count(AuditAction.SALE_VOIDED)).isEqualTo(1);
    }

    @Test
    void lateCheckoutFailureRollsBackEveryBusinessWriteAndCanBeRetried() {
        var product = products.create(owner, shop, new ProductWriteRequest(null, "Checkout product", null, null,
                "piece", 50_000L, null, true, BigDecimal.TEN));
        var draft = drafts.create(owner, shop, new SaleDraftWriteRequest("New checkout customer", null, 0L,
                40_000L, PaymentMethod.CASH,
                List.of(new SaleDraftItemRequest(product.id(), BigDecimal.valueOf(2), 50_000L, null, null)), null));
        long auditBefore = total();
        Map<String, Long> rowsBefore = businessRowCounts();
        // SALE_CONFIRMED is inserted after stock, customer, sale/items, payment and debt writes.
        // The database rejects that insert, not a mock. Reads below run after the service transaction ends.
        jdbc.execute("ALTER TABLE audit_logs ADD CONSTRAINT test_reject_checkout CHECK (shop_id <> "
                + Long.valueOf(shop) + " OR action <> 'SALE_CONFIRMED')");
        try {
            assertThatThrownBy(() -> drafts.confirm(owner, shop, draft.id().toString()))
                    .isInstanceOf(DataIntegrityViolationException.class)
                    .hasStackTraceContaining("test_reject_checkout");
        } finally {
            jdbc.execute("ALTER TABLE audit_logs DROP CONSTRAINT test_reject_checkout");
        }
        assertCheckoutRolledBack(draft.id(), product.id(), auditBefore);
        assertThat(businessRowCounts()).isEqualTo(rowsBefore);

        var sale = drafts.confirm(owner, shop, draft.id().toString());
        assertThat(sale.paidVnd()).isEqualTo(40_000L);
        assertThat(sale.outstandingVnd()).isEqualTo(60_000L);
        assertThat(drafts.confirm(owner, shop, draft.id().toString()).id()).isEqualTo(sale.id());
        assertThat(rowsInShop("sales")).isEqualTo(1);
        assertThat(rowsInShop("customers")).isEqualTo(1);
        assertThat(rowsForShopSales("sale_items")).isEqualTo(1);
        assertThat(rowsForShopSales("payments")).isEqualTo(1);
        assertThat(rowsForShopSales("debts")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT outstanding_vnd FROM debts WHERE sale_id=?", Long.class, sale.id()))
                .isEqualTo(60_000L);
        assertThat(jdbc.queryForObject("SELECT stock_quantity FROM products WHERE id=?", BigDecimal.class, product.id()))
                .isEqualByComparingTo("8");
        assertThat(count(AuditAction.SALE_CONFIRMED)).isEqualTo(1);
        assertThat(count(AuditAction.STOCK_ADJUSTED)).isEqualTo(1);
    }

    @Test
    void laterProductFailureRollsBackEarlierStockChangeAndCustomer() {
        var first = products.create(owner, shop, new ProductWriteRequest(null, "First product", null, null,
                "piece", 50_000L, null, true, BigDecimal.TEN));
        var second = products.create(owner, shop, new ProductWriteRequest(null, "Insufficient product", null, null,
                "piece", 50_000L, null, true, BigDecimal.ONE));
        var draft = drafts.create(owner, shop, new SaleDraftWriteRequest("New customer", null, 0L,
                40_000L, PaymentMethod.CASH, List.of(
                        new SaleDraftItemRequest(first.id(), BigDecimal.valueOf(2), 50_000L, null, null),
                        new SaleDraftItemRequest(second.id(), BigDecimal.valueOf(2), 50_000L, null, null)), null));
        long auditBefore = total();
        Map<String, Long> rowsBefore = businessRowCounts();
        assertThatThrownBy(() -> drafts.confirm(owner, shop, draft.id().toString()))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_STOCK_INSUFFICIENT));
        assertCheckoutRolledBack(draft.id(), first.id(), auditBefore);
        assertThat(businessRowCounts()).isEqualTo(rowsBefore);
        assertThat(jdbc.queryForObject("SELECT stock_quantity FROM products WHERE id=?", BigDecimal.class, second.id()))
                .isEqualByComparingTo("1");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM sale_draft_items WHERE draft_id=?", Integer.class, draft.id()))
                .isEqualTo(2);
    }

    private void assertCheckoutRolledBack(Long draftId, Long productId, long auditBefore) {
        assertThat(total()).isEqualTo(auditBefore);
        assertThat(rowsInShop("sales")).isZero();
        assertThat(rowsInShop("customers")).isZero();
        for (String table : List.of("sale_items", "payments", "debts", "sale_refunds")) {
            assertThat(rowsForShopSales(table)).as(table).isZero();
        }
        assertThat(rowsInShop("api_idempotency_keys")).isZero(); // confirm uses draftId, not a key
        assertThat(jdbc.queryForObject("SELECT stock_quantity FROM products WHERE id=?", BigDecimal.class, productId))
                .isEqualByComparingTo("10");
        Map<String, Object> draft = jdbc.queryForMap(
                "SELECT status, confirmed_sale_id, confirmed_at FROM sale_drafts WHERE id=?", draftId);
        assertThat(draft.get("status")).isEqualTo("DRAFT");
        assertThat(draft.get("confirmed_sale_id")).isNull();
        assertThat(draft.get("confirmed_at")).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM sale_draft_items WHERE draft_id=?", Integer.class, draftId))
                .isPositive();
    }

    private long rowsInShop(String table) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE shop_id=?", Long.class, Long.valueOf(shop));
    }

    private Map<String, Long> businessRowCounts() {
        var counts = new java.util.HashMap<String, Long>();
        for (String table : List.of("customers", "sale_drafts", "sale_draft_items", "sales", "sale_items",
                "payments", "debts", "sale_refunds", "api_idempotency_keys", "audit_logs")) {
            counts.put(table, jdbc.queryForObject("SELECT count(*) FROM " + table, Long.class));
        }
        return counts;
    }

    private long rowsForShopSales(String table) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table
                + " WHERE sale_id IN (SELECT id FROM sales WHERE shop_id=?)", Long.class, Long.valueOf(shop));
    }

    @Test
    void foreignOwnerCannotReadOrMutateCatalogOrCheckout() {
        Fixture fixture = sale(40_000L, false);
        String productId = fixture.productId().toString();
        String categoryId = jdbc.queryForObject("SELECT category_id FROM products WHERE id=?", Long.class,
                fixture.productId()).toString();
        String draftId = jdbc.queryForObject("SELECT id FROM sale_drafts WHERE confirmed_sale_id=?", Long.class,
                Long.valueOf(fixture.saleId())).toString();
        String paymentId = payments.listForSale(owner, shop, fixture.saleId()).getFirst().id().toString();
        var categoryRequest = new CategoryWriteRequest("Changed");
        var productRequest = new ProductWriteRequest(null, "Changed", null, null, "piece", 1L, null, false, null);
        var patch = new ProductPatchRequest();
        patch.setName("Changed");
        var draftRequest = new SaleDraftWriteRequest("Other customer", null, 0L, 0L, null,
                List.of(new SaleDraftItemRequest(null, BigDecimal.ONE, 1L, "Custom", "piece")), null);
        var voidRequest = new SaleVoidRequest("Returned", true, PaymentMethod.CASH, null);
        Map<String, Object> before = checkoutSnapshot(fixture);
        List<Runnable> operations = List.of(
                () -> categories.create(other, shop, categoryRequest),
                () -> categories.list(other, shop),
                () -> categories.getById(other, shop, categoryId),
                () -> categories.replace(other, shop, categoryId, categoryRequest),
                () -> categories.archive(other, shop, categoryId),
                () -> products.create(other, shop, productRequest),
                () -> products.list(other, shop, Products.defaults()).items(),
                () -> products.getById(other, shop, productId),
                () -> products.patch(other, shop, productId, patch),
                () -> products.archive(other, shop, productId),
                () -> drafts.create(other, shop, draftRequest),
                () -> drafts.list(other, shop, new Drafts(0, 100, null)).items(),
                () -> drafts.getById(other, shop, draftId),
                () -> drafts.replace(other, shop, draftId, draftRequest),
                () -> drafts.cancel(other, shop, draftId),
                () -> drafts.confirm(other, shop, draftId),
                () -> sales.list(other, shop, new Sales(0, 100, null, null, null, null)).items(),
                () -> sales.getById(other, shop, fixture.saleId()),
                () -> payments.listForSale(other, shop, fixture.saleId()),
                () -> payments.getById(other, shop, fixture.saleId(), paymentId),
                () -> voids.voidSale(other, shop, fixture.saleId(), "foreign-void", voidRequest),
                () -> voids.getRefund(other, shop, fixture.saleId()));
        for (int index = 0; index < operations.size(); index++) {
            Runnable operation = operations.get(index);
            assertThatThrownBy(operation::run).as("foreign-owner operation %s", index)
                    .isInstanceOfSatisfying(BusinessException.class,
                            exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SHOP_ACCESS_DENIED));
        }
        assertThat(checkoutSnapshot(fixture)).isEqualTo(before);
    }

    @Test
    void foreignRecordIdsAreRejectedEvenWhenBothShopsBelongToOwner() {
        Fixture fixture = sale(40_000L, false);
        String secondShop = shops.create(owner, new ShopCreateRequest("Second shop", "Retail", null, null)).id().toString();
        String productId = fixture.productId().toString();
        String categoryId = jdbc.queryForObject("SELECT category_id FROM products WHERE id=?", Long.class,
                fixture.productId()).toString();
        String draftId = jdbc.queryForObject("SELECT id FROM sale_drafts WHERE confirmed_sale_id=?", Long.class,
                Long.valueOf(fixture.saleId())).toString();
        String paymentId = payments.listForSale(owner, shop, fixture.saleId()).getFirst().id().toString();
        Map<String, Object> before = checkoutSnapshot(fixture);
        assertError(() -> categories.getById(owner, secondShop, categoryId), ErrorCode.CATEGORY_NOT_FOUND);
        assertError(() -> products.getById(owner, secondShop, productId), ErrorCode.PRODUCT_NOT_FOUND);
        assertError(() -> drafts.getById(owner, secondShop, draftId), ErrorCode.DRAFT_NOT_FOUND);
        assertError(() -> drafts.confirm(owner, secondShop, draftId), ErrorCode.DRAFT_NOT_FOUND);
        assertError(() -> sales.getById(owner, secondShop, fixture.saleId()), ErrorCode.SALE_NOT_FOUND);
        assertError(() -> payments.listForSale(owner, secondShop, fixture.saleId()), ErrorCode.SALE_NOT_FOUND);
        assertError(() -> payments.getById(owner, secondShop, fixture.saleId(), paymentId), ErrorCode.SALE_NOT_FOUND);
        assertError(() -> voids.getRefund(owner, secondShop, fixture.saleId()), ErrorCode.SALE_NOT_FOUND);
        assertError(() -> voids.voidSale(owner, secondShop, fixture.saleId(), "wrong-shop-void",
                new SaleVoidRequest("Returned", true, PaymentMethod.CASH, null)), ErrorCode.SALE_NOT_FOUND);
        assertError(() -> drafts.create(owner, secondShop, new SaleDraftWriteRequest("Customer", null, 0L, 0L,
                null, List.of(new SaleDraftItemRequest(fixture.productId(), BigDecimal.ONE, 50_000L)), null)),
                ErrorCode.DRAFT_ITEM_INVALID);
        assertThat(checkoutSnapshot(fixture)).isEqualTo(before);
        assertThat(sales.list(owner, secondShop, new Sales(0, 100, null, null, null, null)).items()).isEmpty();
        assertThat(drafts.list(owner, secondShop, new Drafts(0, 100, null)).items()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM api_idempotency_keys WHERE shop_id=?", Long.class,
                Long.valueOf(secondShop))).isZero();
    }

    private void assertError(Runnable operation, ErrorCode error) {
        assertThatThrownBy(operation::run).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode()).isEqualTo(error));
    }

    private Map<String, Object> checkoutSnapshot(Fixture fixture) {
        var snapshot = new java.util.HashMap<String, Object>();
        for (String table : List.of("categories", "products", "customers", "sale_drafts", "sales", "api_idempotency_keys")) {
            snapshot.put(table, rowsInShop(table));
        }
        for (String table : List.of("sale_items", "payments", "debts", "sale_refunds")) {
            snapshot.put(table, rowsForShopSales(table));
        }
        snapshot.put("audit", total());
        snapshot.put("stock", jdbc.queryForObject("SELECT stock_quantity FROM products WHERE id=?", BigDecimal.class,
                fixture.productId()));
        snapshot.put("sale", jdbc.queryForMap("SELECT sale_status, paid_vnd FROM sales WHERE id=?", Long.valueOf(fixture.saleId())));
        snapshot.put("debt", jdbc.queryForMap("SELECT status, outstanding_vnd FROM debts WHERE id=?", Long.valueOf(fixture.debtId())));
        return snapshot;
    }

    @Test
    void businessFailureAlsoLeavesNoSuccessAuditOrExpenseReservation() {
        var category = categories.create(owner, shop, new CategoryWriteRequest("Category"));
        var product = products.create(owner, shop, new ProductWriteRequest(category.id(), "Product", null, null,
                "piece", 50_000L, null, true, BigDecimal.ONE));
        var draft = drafts.create(owner, shop, new SaleDraftWriteRequest("Sensitive customer", "0901234567", 0L,
                40_000L, PaymentMethod.CASH, List.of(new SaleDraftItemRequest(product.id(), BigDecimal.valueOf(2), 50_000L, null, null)), null));
        long before = total();
        assertThatThrownBy(() -> drafts.confirm(owner, shop, draft.id().toString())).isInstanceOf(BusinessException.class);
        assertThat(total()).isEqualTo(before);
        jdbc.execute("ALTER TABLE audit_logs ADD CONSTRAINT test_reject_expense CHECK (shop_id <> "
                + Long.valueOf(shop) + " OR action <> 'EXPENSE_CREATED')");
        try {
            assertThatThrownBy(() -> expenses.create(owner, shop, "expense-fail",
                    new ExpenseWriteRequest(null, "Memo", 1_000L, null, null))).isInstanceOf(DataIntegrityViolationException.class);
        } finally { jdbc.execute("ALTER TABLE audit_logs DROP CONSTRAINT test_reject_expense"); }
        assertThat(total()).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM expenses WHERE shop_id=?", Integer.class, Long.valueOf(shop))).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM api_idempotency_keys WHERE shop_id=?", Integer.class, Long.valueOf(shop))).isZero();
    }

    @Test
    void settledDebtAndCustomItemsDoNotInventCancellationOrStockEvents() {
        Fixture fixture = sale(40_000L, true);
        debts.repay(owner, shop, fixture.debtId(), "settle", new DebtRepaymentRequest(60_000L, PaymentMethod.CASH, null));
        var response = voids.voidSale(owner, shop, fixture.saleId(), "void-custom", new SaleVoidRequest("Cancelled", true, PaymentMethod.CASH, null));
        assertThat(response.refund().amountVnd()).isEqualTo(100_000L);
        assertThat(count(AuditAction.DEBT_VOIDED)).isZero();
        assertThat(count(AuditAction.STOCK_ADJUSTED)).isZero();
        assertThat(count(AuditAction.STOCK_RESTORED_ON_VOID)).isZero();
        assertThat(debts.getById(owner, shop, fixture.debtId()).status()).isEqualTo(DebtStatus.SETTLED);
    }

    @Test
    void unpaidVoidCancelsDebtWithoutInventingARefundOrRestoringStock() {
        Fixture fixture = sale(0L, false);
        var response = voids.voidSale(owner, shop, fixture.saleId(), "unpaid-void",
                new SaleVoidRequest("Cancelled before payment", false, null, null));
        assertThat(response.refund()).isNull();
        assertThat(response.cancelledDebtVnd()).isEqualTo(100_000L);
        assertThat(count(AuditAction.SALE_VOIDED)).isEqualTo(1);
        assertThat(count(AuditAction.DEBT_VOIDED)).isEqualTo(1);
        assertThat(count(AuditAction.SALE_REFUND_RECORDED)).isZero();
        assertThat(count(AuditAction.STOCK_RESTORED_ON_VOID)).isZero();
        assertThat(jdbc.queryForObject("SELECT stock_quantity FROM products WHERE id=?", BigDecimal.class,
                fixture.productId())).isEqualByComparingTo("8");
    }

    @Test
    void catalogExpenseAndShopChangesCaptureFieldsNotPrivateValues() {
        var category = categories.create(owner, shop, new CategoryWriteRequest("Category"));
        var product = products.create(owner, shop, new ProductWriteRequest(category.id(), "Product", null, null,
                "piece", 50_000L, null, true, BigDecimal.TEN));
        var rename = new ProductPatchRequest();
        rename.setName("Private new product name");
        products.patch(owner, shop, product.id().toString(), rename);
        assertThat(count(AuditAction.STOCK_ADJUSTED)).isZero();
        products.stockIn(owner, shop, product.id().toString(), "catalog-stock-in",
                new ProductStockInRequest(new BigDecimal("2.125"), null));
        var event = query.list(owner, shop, AuditAction.STOCK_ADJUSTED, product.id(), null, null, 0, 20).content().getFirst();
        assertThat(new BigDecimal(event.metadata().get("afterStock").toString())).isEqualByComparingTo("12.125");
        categories.replace(owner, shop, category.id().toString(), new CategoryWriteRequest("Private category name"));
        long before = total();
        assertThatThrownBy(() -> categories.archive(owner, shop, category.id().toString())).isInstanceOf(BusinessException.class);
        assertThat(total()).isEqualTo(before);
        products.archive(owner, shop, product.id().toString());
        categories.archive(owner, shop, category.id().toString());
        assertThat(count(AuditAction.PRODUCT_CREATED)).isEqualTo(1);
        assertThat(count(AuditAction.PRODUCT_UPDATED)).isEqualTo(1);
        assertThat(count(AuditAction.PRODUCT_ARCHIVED)).isEqualTo(1);
        assertThat(count(AuditAction.CATEGORY_UPDATED)).isEqualTo(1);
        assertThat(count(AuditAction.CATEGORY_ARCHIVED)).isEqualTo(1);

        var expense = expenses.create(owner, shop, "catalog-expense",
                new ExpenseWriteRequest(null, "Private expense memo", 10_000L, null, null));
        var patch = new ExpensePatchRequest();
        patch.setAmountVnd(15_000L);
        patch.setDescription("Private expense replacement");
        expenses.patch(owner, shop, expense.id().toString(), patch);
        expenses.archive(owner, shop, expense.id().toString());
        assertThat(count(AuditAction.EXPENSE_UPDATED)).isEqualTo(1);
        assertThat(count(AuditAction.EXPENSE_ARCHIVED)).isEqualTo(1);
        shops.updateById(owner, shop, new ShopUpdateRequest("Private shop rename", null, "0911111111", null));
        shops.archiveById(owner, shop, new ArchiveShopRequest("Closed"));
        assertThat(count(AuditAction.SHOP_UPDATED)).isEqualTo(1);
        assertThat(count(AuditAction.SHOP_ARCHIVED)).isEqualTo(1);
        String json = jdbc.queryForObject("SELECT string_agg(metadata::text, ' ') FROM audit_logs WHERE shop_id=?",
                String.class, Long.valueOf(shop));
        assertThat(json).doesNotContain("Private", "0911111111");
    }

    @Test
    void concurrentExpenseRetryCreatesOneBusinessRowAndOneAuditEvent() throws Exception {
        var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
        var ready = new java.util.concurrent.CyclicBarrier(2);
        var request = new ExpenseWriteRequest(null, "Memo", 10_000L, PaymentMethod.CASH, null);
        java.util.concurrent.Callable<Long> action = () -> {
            ready.await(10, java.util.concurrent.TimeUnit.SECONDS);
            return expenses.create(owner, shop, "concurrent-expense", request).id();
        };
        try {
            var first = executor.submit(action);
            var second = executor.submit(action);
            assertThat(first.get(20, java.util.concurrent.TimeUnit.SECONDS))
                    .isEqualTo(second.get(20, java.util.concurrent.TimeUnit.SECONDS));
        } finally {
            executor.shutdownNow();
            executor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS);
        }
        assertThat(count(AuditAction.EXPENSE_CREATED)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM expenses WHERE shop_id=?", Integer.class,
                Long.valueOf(shop))).isEqualTo(1);
    }

    @Test
    void paginationFiltersAndAuthorizationUseRealOwnerMapping() {
        Fixture fixture = sale(40_000L, false);
        var page = query.list(owner, shop, null, null, null, null, 0, 2);
        assertThat(page.content()).hasSize(2);
        assertThat(page.totalElements()).isEqualTo(total());
        var event = query.list(owner, shop, AuditAction.SALE_CONFIRMED, Long.valueOf(fixture.saleId()), null, null, 0, 20).content().getFirst();
        assertThat(query.list(owner, shop, AuditAction.SALE_CONFIRMED, null, event.createdAt(), event.createdAt().plusSeconds(1), 0, 20).content()).hasSize(1);
        assertThat(query.list(owner, shop, AuditAction.SALE_CONFIRMED, null, event.createdAt().minusSeconds(1), event.createdAt(), 0, 20).content()).isEmpty();
        long before = total();
        assertThatThrownBy(() -> query.list(other, shop, null, null, null, null, 0, 20))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.SHOP_ACCESS_DENIED));
        assertThat(total()).isEqualTo(before); // OWNER reads are deliberately not audited.
    }

    @Test
    void adminStatusAuditRecordsAdminNotOwnerAndOwnerCannotImpersonate() {
        assertThatThrownBy(() -> shops.updateStatus(owner, shop, new ShopStatusUpdateRequest(ShopStatus.INACTIVE, "Policy"))).isInstanceOf(BusinessException.class);
        jdbc.update("UPDATE users SET system_role='ADMIN' WHERE id=?", otherId);
        shops.updateStatus(other, shop, new ShopStatusUpdateRequest(ShopStatus.INACTIVE, "Policy"));
        var event = jdbc.queryForMap("SELECT actor_user_id, actor_role, reason FROM audit_logs WHERE shop_id=? AND action='SHOP_INACTIVATED'", Long.valueOf(shop));
        assertThat(event.get("actor_user_id")).isEqualTo(otherId);
        assertThat(event.get("actor_role")).isEqualTo("ADMIN");
        assertThat(event.get("reason")).isEqualTo("Policy");
        assertThatThrownBy(() -> query.list(owner, shop, null, null, null, null, 0, 20)).isInstanceOf(BusinessException.class);
        shops.updateStatus(other, shop, new ShopStatusUpdateRequest(ShopStatus.ACTIVE, null));
        assertThat(count(AuditAction.SHOP_REACTIVATED)).isEqualTo(1);
    }

    @Test
    void writerRequiresTransactionAndRepositoryCannotRewriteEvents() {
        assertThatThrownBy(() -> audit.record(Long.valueOf(shop), ownerId, SystemRole.OWNER,
                AuditAction.SHOP_UPDATED, Long.valueOf(shop), null, null, Map.of())).isInstanceOf(IllegalTransactionStateException.class);
        assertThatThrownBy(() -> audit.recordOwner(shops.requireOwnedActiveShop(owner, shop),
                AuditAction.SHOP_UPDATED, Long.valueOf(shop), null, null, Map.of())).isInstanceOf(IllegalTransactionStateException.class);
        var event = auditRepository.search(Long.valueOf(shop), AuditAction.SHOP_CREATED, null, null, null,
                org.springframework.data.domain.PageRequest.of(0, 20)).getContent().getFirst();
        assertThatThrownBy(() -> new TransactionTemplate(transactions).execute(status -> {
            auditRepository.append(event); return null;
        })).isInstanceOf(InvalidDataAccessApiUsageException.class).hasRootCauseInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> event.getMetadata().put("token", "secret")).isInstanceOf(UnsupportedOperationException.class);
        assertThat(java.util.Arrays.stream(AuditLogRepository.class.getMethods()).map(java.lang.reflect.Method::getName))
                .noneMatch(name -> name.startsWith("delete") || name.startsWith("save") || name.startsWith("update"));
    }

    @Test
    void paidCheckoutWithArchivedCustomerPreservesSnapshotWithoutOpeningDebt() {
        var customer = customers.create(owner, shop, new CustomerWriteRequest("Snapshot customer", "0901234567"));
        var draft = customDraftForCustomer(customer.id(), 100_000L);
        customers.archive(owner, shop, customer.id().toString());

        var result = drafts.confirm(owner, shop, draft.id().toString());
        assertThat(result.customerId()).isNull();
        assertThat(result.customerName()).isEqualTo("Snapshot customer");
        assertThat(result.customerPhone()).isEqualTo("0901234567");
        assertThat(result.paymentStatus()).isEqualTo(PaymentStatus.PAID);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM debts WHERE sale_id=?", Long.class, result.id())).isZero();
        assertThat(jdbc.queryForObject("SELECT sum(amount_vnd) FROM payments WHERE sale_id=?", Long.class,
                result.id())).isEqualTo(100_000L);
        assertThat(drafts.confirm(owner, shop, draft.id().toString()).id()).isEqualTo(result.id());
        assertThat(count(AuditAction.SALE_CONFIRMED)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM customers WHERE shop_id=?", Long.class,
                Long.valueOf(shop))).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(longs = {0, 40_000})
    void debtCheckoutWithArchivedCustomerLeavesNoBusinessWrites(long paid) {
        var customer = customers.create(owner, shop, new CustomerWriteRequest("Snapshot customer", "0901234567"));
        var draft = customDraftForCustomer(customer.id(), paid);
        customers.archive(owner, shop, customer.id().toString());
        long before = total();

        assertThatThrownBy(() -> drafts.confirm(owner, shop, draft.id().toString()))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.CUSTOMER_NOT_FOUND));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM sales WHERE shop_id=?", Long.class,
                Long.valueOf(shop))).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM sale_drafts WHERE id=?", String.class,
                draft.id())).isEqualTo("DRAFT");
        assertThat(total()).isEqualTo(before);
    }

    private com.smartledger.core.dto.response.SaleDraftResponse customDraftForCustomer(Long customerId, long paid) {
        return drafts.create(owner, shop, new SaleDraftWriteRequest(null, null, 0L, paid,
                paid == 0 ? null : PaymentMethod.CASH,
                List.of(new SaleDraftItemRequest(null, BigDecimal.ONE, 100_000L, "Custom", "piece")), customerId));
    }

    @Test
    void concurrentExpensePatchesPreserveBothChangesAndAccurateAudit() throws Exception {
        var expense = expenses.create(owner, shop, "patch-race", new ExpenseWriteRequest(null, "Original", 10_000L, null, null));
        var amount = new ExpensePatchRequest();
        amount.setAmountVnd(20_000L);
        var description = new ExpensePatchRequest();
        description.setDescription("Updated description");
        var executor = java.util.concurrent.Executors.newSingleThreadExecutor();
        var second = new java.util.concurrent.atomic.AtomicReference<java.util.concurrent.Future<?>>();
        try {
            new TransactionTemplate(transactions).executeWithoutResult(status -> {
                expenses.patch(owner, shop, expense.id().toString(), amount);
                int holderPid = jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class);
                second.set(executor.submit(() -> expenses.patch(owner, shop, expense.id().toString(), description)));
                awaitExpenseLock(holderPid);
            });
            second.get().get(15, java.util.concurrent.TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
            executor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS);
        }
        var result = expenses.getById(owner, shop, expense.id().toString());
        assertThat(result.amountVnd()).isEqualTo(20_000L);
        assertThat(result.description()).isEqualTo("Updated description");
        assertThat(count(AuditAction.EXPENSE_UPDATED)).isEqualTo(2);
        var metadata = jdbc.queryForMap("SELECT metadata->>'beforeAmountVnd' AS before_amount, metadata->>'afterAmountVnd' AS after_amount FROM audit_logs WHERE shop_id=? AND action='EXPENSE_UPDATED' ORDER BY id DESC LIMIT 1", Long.valueOf(shop));
        assertThat(metadata).containsEntry("before_amount", "20000").containsEntry("after_amount", "20000");
    }

    @Test
    void expensePatchWaitingForArchiveCannotResurrectOrAuditArchivedExpense() throws Exception {
        var expense = expenses.create(owner, shop, "archive-race", new ExpenseWriteRequest(null, "Original", 10_000L, null, null));
        var patch = new ExpensePatchRequest();
        patch.setAmountVnd(20_000L);
        var executor = java.util.concurrent.Executors.newSingleThreadExecutor();
        var second = new java.util.concurrent.atomic.AtomicReference<java.util.concurrent.Future<?>>();
        try {
            new TransactionTemplate(transactions).executeWithoutResult(status -> {
                expenses.archive(owner, shop, expense.id().toString());
                int holderPid = jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class);
                second.set(executor.submit(() -> expenses.patch(owner, shop, expense.id().toString(), patch)));
                awaitExpenseLock(holderPid);
            });
            assertThatThrownBy(() -> second.get().get(15, java.util.concurrent.TimeUnit.SECONDS))
                    .isInstanceOf(java.util.concurrent.ExecutionException.class)
                    .hasCauseInstanceOf(BusinessException.class)
                    .satisfies(error -> assertThat(((BusinessException) error.getCause()).getErrorCode())
                            .isEqualTo(ErrorCode.EXPENSE_NOT_FOUND));
        } finally {
            executor.shutdownNow();
            executor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS);
        }
        var row = jdbc.queryForMap("SELECT status, amount_vnd FROM expenses WHERE id=?", expense.id());
        assertThat(row).containsEntry("status", "ARCHIVED").containsEntry("amount_vnd", 10_000L);
        assertThat(count(AuditAction.EXPENSE_ARCHIVED)).isEqualTo(1);
        assertThat(count(AuditAction.EXPENSE_UPDATED)).isZero();
    }

    private void awaitExpenseLock(int holderPid) {
        awaitRowLock(holderPid, "expenses");
    }

    private void awaitRowLock(int holderPid, String table) {
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(8);
        while (System.nanoTime() < deadline) {
            // Observe a real PostgreSQL lock wait instead of relying on thread timing/sleep alone.
            jdbc.execute("SELECT pg_stat_clear_snapshot()");
            Long blocked = jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE ? = ANY(pg_blocking_pids(pid)) AND query ILIKE ?", Long.class, holderPid, "%" + table + "%");
            if (blocked != null && blocked > 0) { return; }
            try { Thread.sleep(20); }
            catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new AssertionError("Interrupted while waiting for " + table + " lock", error);
            }
        }
        throw new AssertionError("Second " + table + " writer did not wait for the first transaction's row lock");
    }

    @Test
    void stockInCanonicalReplayReturnsOriginalSnapshotWithoutDuplicatingAuditOrMoney() {
        var product = stockProduct();
        var first = stockIn(product.id(), "stock-retry", "2.125", " Delivery ");
        stockIn(product.id(), "stock-next", "1", null);
        var replay = stockIn(product.id(), "stock-retry", "2.125", "Delivery");
        assertThat(replay.stockQuantity()).isEqualByComparingTo(first.stockQuantity());
        assertThat(replay.updatedAt().toInstant()).isEqualTo(first.updatedAt().toInstant());
        assertThat(products.getById(owner, shop, product.id().toString()).stockQuantity())
                .isEqualByComparingTo("13.125");
        assertThat(first.updatedAt().isBefore(first.createdAt())).isFalse();
        assertThat(count(AuditAction.STOCK_ADJUSTED)).isEqualTo(2);
        assertThat(rowsInShop("api_idempotency_keys")).isEqualTo(2);
        assertThat(jdbc.queryForMap("SELECT operation, response_status, resource_type, resource_id FROM api_idempotency_keys WHERE shop_id=? AND idempotency_key='stock-retry'", Long.valueOf(shop)))
                .containsEntry("operation", "PRODUCT_STOCK_IN").containsEntry("response_status", 200)
                .containsEntry("resource_type", "PRODUCT").containsEntry("resource_id", product.id());
        var event = query.list(owner, shop, AuditAction.STOCK_ADJUSTED, product.id(), null, null, 0, 20)
                .content().stream().filter(e -> "stock-retry".equals(e.idempotencyKey())).findFirst().orElseThrow();
        assertThat(event.reason()).isEqualTo("Delivery");
        assertThat(event.metadata()).containsEntry("source", "STOCK_IN");
        assertThat(new BigDecimal(event.metadata().get("quantity").toString())).isEqualByComparingTo("2.125");
        for (String table : List.of("sales", "expenses", "customers")) { assertThat(rowsInShop(table)).as(table).isZero(); }
        for (String table : List.of("sale_items", "payments", "sale_refunds", "debts")) {
            assertThat(rowsForShopSales(table)).as(table).isZero();
        }
        // Numeric scale and blank reason do not create a different logical request.
        stockIn(product.id(), "scale-retry", "5", null);
        stockIn(product.id(), "scale-retry", "5.000", "  ");
        assertThat(count(AuditAction.STOCK_ADJUSTED)).isEqualTo(3);
    }

    @Test
    void stockInKeyCannotBeReusedForOtherQuantityReasonOrProductAndExpiredKeyCannotAddAgain() {
        var product = stockProduct();
        var second = stockProduct();
        stockIn(product.id(), "stock-key", "2", "Delivery");
        for (var attempt : List.of(new ProductStockInRequest(BigDecimal.ONE, "Delivery"),
                new ProductStockInRequest(BigDecimal.valueOf(2), "Changed"))) {
            assertThatThrownBy(() -> products.stockIn(owner, shop, product.id().toString(), "stock-key", attempt))
                    .isInstanceOfSatisfying(BusinessException.class,
                            e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.IDEMPOTENCY_KEY_CONFLICT));
        }
        assertThatThrownBy(() -> stockIn(second.id(), "stock-key", "2", "Delivery"))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.IDEMPOTENCY_KEY_CONFLICT));
        jdbc.update("UPDATE api_idempotency_keys SET created_at=now()-interval '31 days', expires_at=now()-interval '1 minute' WHERE shop_id=? AND idempotency_key='stock-key'", Long.valueOf(shop));
        assertThatThrownBy(() -> stockIn(product.id(), "stock-key", "2", "Delivery"))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.IDEMPOTENCY_KEY_EXPIRED));
        assertThat(products.getById(owner, shop, product.id().toString()).stockQuantity()).isEqualByComparingTo("12");
        assertThat(products.getById(owner, shop, second.id().toString()).stockQuantity()).isEqualByComparingTo("10");
        assertThat(count(AuditAction.STOCK_ADJUSTED)).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"audit", "idempotency"})
    void stockInLateWriteFailureRollsBackStockAuditAndKeyAndAllowsSameKeyRetry(String failure) {
        var product = stockProduct();
        long before = total();
        String table = failure.equals("audit") ? "audit_logs" : "api_idempotency_keys";
        String predicate = failure.equals("audit")
                ? "action <> 'STOCK_ADJUSTED' OR metadata->>'source' <> 'STOCK_IN'"
                : "response_status IS NULL OR response_status <> 200";
        jdbc.execute("ALTER TABLE " + table + " ADD CONSTRAINT test_reject_stock_in CHECK (shop_id <> "
                + Long.valueOf(shop) + " OR (" + predicate + "))");
        try {
            assertThatThrownBy(() -> stockIn(product.id(), "retry-stock-failure", "2.125", null))
                    .isInstanceOf(DataIntegrityViolationException.class).hasStackTraceContaining("test_reject_stock_in");
        } finally {
            jdbc.execute("ALTER TABLE " + table + " DROP CONSTRAINT test_reject_stock_in");
        }
        assertThat(total()).isEqualTo(before);
        assertThat(rowsInShop("api_idempotency_keys")).isZero();
        assertThat(products.getById(owner, shop, product.id().toString()).stockQuantity()).isEqualByComparingTo("10");
        assertThat(stockIn(product.id(), "retry-stock-failure", "2.125", null).stockQuantity()).isEqualByComparingTo("12.125");
        assertThat(count(AuditAction.STOCK_ADJUSTED)).isEqualTo(1);
    }

    @Test
    void stockInEnforcesRealOwnerShopProductAndTrackingState() {
        var product = stockProduct();
        var request = new ProductStockInRequest(BigDecimal.ONE, null);
        assertThatThrownBy(() -> products.stockIn(other, shop, product.id().toString(), "foreign", request))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.SHOP_ACCESS_DENIED));
        String otherShop = shops.create(other, new ShopCreateRequest("Other", "Retail", null, null)).id().toString();
        assertThatThrownBy(() -> products.stockIn(other, otherShop, product.id().toString(), "foreign-product", request))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_NOT_FOUND));
        jdbc.update("UPDATE users SET system_role='ADMIN' WHERE id=?", otherId);
        assertThatThrownBy(() -> products.stockIn(other, shop, product.id().toString(), "admin", request))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.SHOP_ACCESS_DENIED));
        shops.updateStatus(other, shop, new ShopStatusUpdateRequest(ShopStatus.INACTIVE, "Test"));
        assertThatThrownBy(() -> stockIn(product.id(), "inactive", "1", null))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.SHOP_INACTIVE));
        shops.updateStatus(other, shop, new ShopStatusUpdateRequest(ShopStatus.ACTIVE, null));
        var untracked = new ProductPatchRequest();
        untracked.setTracked(false);
        products.patch(owner, shop, product.id().toString(), untracked);
        assertThatThrownBy(() -> stockIn(product.id(), "untracked", "1", null))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_STOCK_IN_UNAVAILABLE));
        var tracked = new ProductPatchRequest();
        tracked.setTracked(true);
        assertThat(products.patch(owner, shop, product.id().toString(), tracked).stockQuantity()).isEqualByComparingTo("0");
        assertThat(stockIn(product.id(), "now-tracked", "1", null).stockQuantity()).isEqualByComparingTo("1");
        products.archive(owner, shop, product.id().toString());
        assertThatThrownBy(() -> stockIn(product.id(), "archived", "1", null))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_NOT_FOUND));
        assertThat(rowsInShop("api_idempotency_keys")).isEqualTo(1);
    }

    @Test
    void stockInOverflowIsRejectedBeforeDatabaseWriteAndNumericBoundaryIsExact() {
        var product = products.create(owner, shop, new ProductWriteRequest(null, "Max", null, null,
                "piece", 50_000L, null, true, new BigDecimal("999999999999.998")));
        stockIn(product.id(), "boundary", "0.001", null);
        long before = total();
        assertThatThrownBy(() -> stockIn(product.id(), "overflow", "0.001", null))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_STOCK_OVERFLOW));
        assertThat(total()).isEqualTo(before);
        assertThat(rowsInShop("api_idempotency_keys")).isEqualTo(1);
        assertThat(products.getById(owner, shop, product.id().toString()).stockQuantity()).isEqualByComparingTo("999999999999.999");
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void concurrentStockInRetriesOrDifferentReceiptsDoNotLoseOrDuplicateStock(boolean sameKey) throws Exception {
        var product = stockProduct();
        var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
        var ready = new java.util.concurrent.CyclicBarrier(2);
        try {
            var first = executor.submit(() -> { ready.await(10, java.util.concurrent.TimeUnit.SECONDS);
                return stockIn(product.id(), "first-stock", "2", null); });
            var second = executor.submit(() -> { ready.await(10, java.util.concurrent.TimeUnit.SECONDS);
                return stockIn(product.id(), sameKey ? "first-stock" : "second-stock", "2.000", null); });
            var result = first.get(20, java.util.concurrent.TimeUnit.SECONDS);
            var otherResult = second.get(20, java.util.concurrent.TimeUnit.SECONDS);
            if (sameKey) { assertThat(otherResult).isEqualTo(result); }
        } finally {
            executor.shutdownNow(); executor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS);
        }
        assertThat(products.getById(owner, shop, product.id().toString()).stockQuantity()).isEqualByComparingTo(sameKey ? "12" : "14");
        assertThat(count(AuditAction.STOCK_ADJUSTED)).isEqualTo(sameKey ? 1 : 2);
        assertThat(rowsInShop("api_idempotency_keys")).isEqualTo(sameKey ? 1 : 2);
    }

    @ParameterizedTest
    @ValueSource(strings = {"checkout", "void", "patch"})
    void checkoutVoidAndCatalogPatchWaitForStockInAndPreserveAllStockChanges(String operation) throws Exception {
        Long id;
        Runnable second;
        if (operation.equals("void")) {
            Fixture sale = sale(0, false); id = sale.productId();
            second = () -> voids.voidSale(owner, shop, sale.saleId(), "stock-void", new SaleVoidRequest("Returned", true, null, null));
        } else {
            var product = stockProduct(); id = product.id();
            if (operation.equals("checkout")) {
                var draft = drafts.create(owner, shop, new SaleDraftWriteRequest("Customer", null, 0L, 0L, null,
                        List.of(new SaleDraftItemRequest(id, BigDecimal.valueOf(2), 50_000L, null, null)), null));
                second = () -> drafts.confirm(owner, shop, draft.id().toString());
            } else {
                var patch = new ProductPatchRequest(); patch.setName("Renamed"); patch.setTracked(true);
                second = () -> products.patch(owner, shop, id.toString(), patch);
            }
        }
        var executor = java.util.concurrent.Executors.newSingleThreadExecutor();
        var pending = new java.util.concurrent.atomic.AtomicReference<java.util.concurrent.Future<?>>();
        try {
            new TransactionTemplate(transactions).executeWithoutResult(status -> {
                stockIn(id, "held-stock", "5", null);
                int holderPid = jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class);
                pending.set(executor.submit(second));
                awaitRowLock(holderPid, "products");
            });
            pending.get().get(15, java.util.concurrent.TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow(); executor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS);
        }
        var result = products.getById(owner, shop, id.toString());
        assertThat(result.stockQuantity()).isEqualByComparingTo(operation.equals("checkout") ? "13" : "15");
        if (operation.equals("patch")) { assertThat(result.name()).isEqualTo("Renamed"); }
    }

    @Test
    void stockInWaitingForArchiveCannotResurrectProductOrLeaveKeyAndAudit() throws Exception {
        var product = stockProduct();
        var executor = java.util.concurrent.Executors.newSingleThreadExecutor();
        var pending = new java.util.concurrent.atomic.AtomicReference<java.util.concurrent.Future<?>>();
        try {
            new TransactionTemplate(transactions).executeWithoutResult(status -> {
                products.archive(owner, shop, product.id().toString());
                int holderPid = jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class);
                pending.set(executor.submit(() -> stockIn(product.id(), "archive-stock", "5", null)));
                awaitRowLock(holderPid, "products");
            });
            assertThatThrownBy(() -> pending.get().get(15, java.util.concurrent.TimeUnit.SECONDS))
                    .isInstanceOf(java.util.concurrent.ExecutionException.class)
                    .hasCauseInstanceOf(BusinessException.class)
                    .satisfies(e -> assertThat(((BusinessException) e.getCause()).getErrorCode()).isEqualTo(ErrorCode.PRODUCT_NOT_FOUND));
        } finally {
            executor.shutdownNow(); executor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS);
        }
        assertThat(jdbc.queryForMap("SELECT status, stock_quantity FROM products WHERE id=?", product.id()))
                .containsEntry("status", "ARCHIVED").containsEntry("stock_quantity", new BigDecimal("10.000"));
        assertThat(count(AuditAction.STOCK_ADJUSTED)).isZero();
        assertThat(rowsInShop("api_idempotency_keys")).isZero();
    }

    private com.smartledger.core.dto.response.ProductResponse stockProduct() {
        return products.create(owner, shop, new ProductWriteRequest(null, "Stock", null, null,
                "piece", 50_000L, 20_000L, true, BigDecimal.TEN));
    }

    private com.smartledger.core.dto.response.ProductResponse stockIn(Long productId, String key, String quantity, String reason) {
        return products.stockIn(owner, shop, productId.toString(), key,
                new ProductStockInRequest(new BigDecimal(quantity), reason));
    }

    private Fixture sale(long paid, boolean custom) {
        Long productId = null;
        if (!custom) {
            var category = categories.create(owner, shop, new CategoryWriteRequest("Category"));
            productId = products.create(owner, shop, new ProductWriteRequest(category.id(), "Product", null, null,
                    "piece", 50_000L, null, true, BigDecimal.TEN)).id();
        }
        var draft = drafts.create(owner, shop, new SaleDraftWriteRequest("Sensitive customer", "0901234567", 0L,
                paid, paid == 0 ? null : PaymentMethod.CASH,
                List.of(new SaleDraftItemRequest(productId, BigDecimal.valueOf(2), 50_000L,
                        custom ? "Custom item" : null, custom ? "piece" : null)), null));
        var sale = drafts.confirm(owner, shop, draft.id().toString());
        long before = count(AuditAction.SALE_CONFIRMED);
        assertThat(drafts.confirm(owner, shop, draft.id().toString()).id()).isEqualTo(sale.id());
        assertThat(count(AuditAction.SALE_CONFIRMED)).isEqualTo(before);
        String debtId = debts.list(owner, shop, Debts.defaults()).items().stream().filter(d -> d.saleId().equals(sale.id())).findFirst().orElseThrow().id().toString();
        return new Fixture(sale.id().toString(), debtId, productId);
    }

    private long count(AuditAction action) {
        return jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE shop_id=? AND action=?", Long.class, Long.valueOf(shop), action.name());
    }
    private long total() {
        return jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE shop_id=?", Long.class, Long.valueOf(shop));
    }
    private VerifiedFirebaseToken token(String prefix) {
        String uid = prefix + UUID.randomUUID();
        return new VerifiedFirebaseToken(uid, uid + "@example.test", true, null, null, null);
    }
    private Long saveUser(VerifiedFirebaseToken token) {
        var user = users.saveAndFlush(UserAccount.createOwner("Test owner", token));
        identities.saveAndFlush(AuthIdentity.forFirebase(user, token.uid()));
        return user.getId();
    }
    private record Fixture(String saleId, String debtId, Long productId) { }

    @AfterAll
    static void removeOnlyTestSchema() throws SQLException {
        if (schemaCreated && SCHEMA.matches("core_audit_test_[a-f0-9]{32}")) {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("DROP SCHEMA \"" + SCHEMA + "\" CASCADE");
            }
        }
    }
    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }
    @TestConfiguration(proxyBeanMethods = false)
    static class PostgresConfig {
        @Bean DataSource dataSource() throws SQLException {
            try (var connection = connection(); var statement = connection.createStatement()) {
                statement.execute("CREATE SCHEMA \"" + SCHEMA + "\""); schemaCreated = true;
            }
            var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                    System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
            var properties = new java.util.Properties();
            properties.setProperty("currentSchema", SCHEMA);
            source.setConnectionProperties(properties);
            return source;
        }
        @Bean com.fasterxml.jackson.databind.ObjectMapper objectMapper() {
            return new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
        }
    }
}
