package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.dto.request.*;
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
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
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
 * Hibernate creates ONLY a generated schema; no audit migration or user DB changes. */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({AuditLogServiceImpl.class, AuditLogQueryServiceImpl.class, ShopServiceImpl.class,
        CategoryServiceImpl.class, ProductServiceImpl.class, SaleDraftServiceImpl.class, DebtServiceImpl.class,
        SaleVoidServiceImpl.class, ExpenseServiceImpl.class, IdempotencyServiceImpl.class,
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
    @Autowired private ExpenseService expenses;
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
        // This JDBC-only table mirrors the existing idempotency repository contract; not a migration.
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
        var adjust = new ProductPatchRequest();
        adjust.setStockQuantity(new BigDecimal("12.125"));
        products.patch(owner, shop, product.id().toString(), adjust);
        var event = query.list(owner, shop, AuditAction.STOCK_ADJUSTED, product.id(), null, null, 0, 20).content().getFirst();
        assertThat(new BigDecimal(event.metadata().get("afterStock").toString())).isEqualByComparingTo("12.125");
        categories.replace(owner, shop, category.id().toString(), new CategoryWriteRequest("Private category name"));
        long before = total();
        assertThatThrownBy(() -> categories.archive(owner, shop, category.id().toString())).isInstanceOf(BusinessException.class);
        assertThat(total()).isEqualTo(before);
        products.archive(owner, shop, product.id().toString());
        categories.archive(owner, shop, category.id().toString());
        assertThat(count(AuditAction.PRODUCT_CREATED)).isEqualTo(1);
        assertThat(count(AuditAction.PRODUCT_UPDATED)).isEqualTo(2);
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
        String debtId = debts.list(owner, shop).stream().filter(d -> d.saleId().equals(sale.id())).findFirst().orElseThrow().id().toString();
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
