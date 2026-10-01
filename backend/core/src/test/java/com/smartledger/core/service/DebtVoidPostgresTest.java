package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.smartledger.core.dto.request.DebtRepaymentRequest;
import com.smartledger.core.dto.request.SaleVoidRequest;
import com.smartledger.core.dto.response.DebtRepaymentResponse;
import com.smartledger.core.dto.response.SaleVoidResponse;
import com.smartledger.core.entity.Debt;
import com.smartledger.core.entity.Payment;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.SaleDraft;
import com.smartledger.core.entity.SaleDraftItem;
import com.smartledger.core.entity.SaleItem;
import com.smartledger.core.entity.SaleRefund;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.DebtStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.PaymentMethod;
import com.smartledger.core.enums.SaleStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.DebtRepository;
import com.smartledger.core.repository.PaymentRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.repository.SaleItemRepository;
import com.smartledger.core.repository.SaleRefundRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.DebtServiceImpl;
import com.smartledger.core.service.impl.SaleVoidServiceImpl;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** Real PostgreSQL tests: opt in with CORE_TEST_POSTGRES_URL and credentials.
 *  Only an isolated, generated test schema is created/dropped; no Flyway is run.
 *  Auth and idempotency are stubbed to focus on transaction/locking behavior. */
@DataJpaTest(showSql = false, properties = {"spring.flyway.enabled=false", "spring.jpa.hibernate.ddl-auto=create",
        "spring.jpa.show-sql=false", "spring.jpa.properties.hibernate.format_sql=false"})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({DebtServiceImpl.class, SaleVoidServiceImpl.class, DebtVoidPostgresTest.PostgresConfig.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class DebtVoidPostgresTest {
    private static final String SCHEMA = "core_void_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final VerifiedFirebaseToken TOKEN = new VerifiedFirebaseToken("test", null, false, null, null, null);
    private static boolean schemaCreated;

    @Autowired private DebtService debtService;
    @Autowired private SaleVoidService voidService;
    @Autowired private DebtRepository debts;
    @Autowired private SaleRepository sales;
    @Autowired private PaymentRepository payments;
    @Autowired private ProductRepository products;
    @Autowired private SaleItemRepository items;
    @Autowired private SaleRefundRepository refunds;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private JdbcTemplate jdbc;
    @MockitoBean private ShopService shopService;
    @MockitoBean private IdempotencyService idempotencyService;

    @DynamicPropertySource
    static void isolatedSchema(DynamicPropertyRegistry properties) {
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
    }

    @BeforeEach
    void authorizeAndExecuteInsideRealBusinessTransaction() {
        Shop shop = Shop.create(42L, "Test shop", null, null, null);
        ReflectionTestUtils.setField(shop, "id", 7L);
        when(shopService.requireOwnedActiveShop(any(), any())).thenReturn(shop);
        when(idempotencyService.execute(any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenAnswer(invocation -> ((Supplier<?>) invocation.getArgument(8)).get());
    }

    @Test
    void repaymentCommitsBeforeVoidAndRefundIncludesTheNewPayment() throws Exception {
        Fixture fixture = seed();
        SaleVoidResponse result = afterLockedTransaction(fixture,
                () -> repay(fixture, 20_000L), () -> voidSale(fixture));

        assertThat(result.refund().amountVnd()).isEqualTo(60_000L);
        assertThat(result.cancelledDebtVnd()).isEqualTo(40_000L);
        assertCancelled(fixture, 40_000L, 2);
    }

    @Test
    void voidCommitsBeforeRepaymentAndNoNewPaymentIsRecorded() throws Exception {
        Fixture fixture = seed();
        assertThatThrownBy(() -> afterLockedTransaction(fixture,
                () -> voidSale(fixture), () -> repay(fixture, 20_000L)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SALE_ALREADY_VOIDED));
        assertCancelled(fixture, 60_000L, 1);
        assertThat(refunds.findBySaleId(fixture.saleId()).orElseThrow().getAmountVnd()).isEqualTo(40_000L);
    }

    @Test
    void concurrentRepaymentsUseTheBalanceAfterWaitingForSaleLock() throws Exception {
        Fixture fixture = seed();
        DebtRepaymentResponse result = afterLockedTransaction(fixture,
                () -> repay(fixture, 20_000L), () -> repay(fixture, 10_000L));

        assertThat(result.debt().outstandingVnd()).isEqualTo(30_000L);
        assertThat(debts.findById(fixture.debtId()).orElseThrow().getOutstandingVnd()).isEqualTo(30_000L);
        assertThat(sales.findById(fixture.saleId()).orElseThrow().getPaidVnd()).isEqualTo(70_000L);
        assertThat(payments.findAllBySaleIdOrderByIdAsc(fixture.saleId())).hasSize(3);
    }

    @Test
    void fullySettledDebtIsPreservedInDatabaseAfterRefund() {
        Fixture fixture = seed();
        repay(fixture, 60_000L);
        var settledAt = debts.findById(fixture.debtId()).orElseThrow().getSettledAt();

        var result = voidSale(fixture);

        Debt debt = debts.findById(fixture.debtId()).orElseThrow();
        assertThat(debt.getStatus()).isEqualTo(DebtStatus.SETTLED);
        assertThat(debt.getSettledAt()).isEqualTo(settledAt);
        assertThat(debt.getVoidedAt()).isNull();
        assertThat(debt.getCancelledVnd()).isNull();
        assertThat(result.cancelledDebtVnd()).isZero();
        assertThat(result.refund().amountVnd()).isEqualTo(100_000L);
    }

    @Test
    void refundInsertFailureRollsBackDebtAuditStockAndSale() {
        Fixture fixture = seed();
        // Force the refund unique constraint to fail after stock/debt mutations.
        refunds.saveAndFlush(SaleRefund.record(fixture.saleId(), 40_000L, PaymentMethod.CASH, null, 42L));

        assertThatThrownBy(() -> voidSale(fixture)).isInstanceOf(DataIntegrityViolationException.class);

        Debt debt = debts.findById(fixture.debtId()).orElseThrow();
        assertThat(debt.getStatus()).isEqualTo(DebtStatus.OPEN);
        assertThat(debt.getOutstandingVnd()).isEqualTo(60_000L);
        assertThat(debt.getVoidedAt()).isNull();
        assertThat(debt.getCancelledVnd()).isNull();
        assertThat(sales.findById(fixture.saleId()).orElseThrow().getSaleStatus()).isEqualTo(SaleStatus.CONFIRMED);
        assertThat(products.findById(fixture.productId()).orElseThrow().getStockQuantity()).isEqualByComparingTo("7");
        assertThat(payments.findAllBySaleIdOrderByIdAsc(fixture.saleId())).hasSize(1);
    }

    private Fixture seed() {
        return transaction().execute(status -> {
            Product product = Product.create(7L);
            product.replace(null, "Item", null, null, "piece", 50_000L, null, true, BigDecimal.valueOf(7));
            products.saveAndFlush(product);
            SaleDraft draft = SaleDraft.create(7L, 42L);
            draft.replace(null, "Customer", null, 0, 100_000L, 40_000L, PaymentMethod.CASH);
            Sale sale = sales.saveAndFlush(Sale.fromDraft(draft, 100_000L, null));
            Debt debt = debts.saveAndFlush(Debt.open(sale.getId(), 9L, 60_000L));
            items.saveAndFlush(SaleItem.fromDraftItem(sale.getId(),
                    SaleDraftItem.create(1L, product, BigDecimal.valueOf(2), 50_000L, 100_000L), true));
            payments.saveAndFlush(Payment.initial(sale.getId(), 40_000L, PaymentMethod.CASH, 42L));
            return new Fixture(sale.getId(), debt.getId(), product.getId());
        });
    }

    private DebtRepaymentResponse repay(Fixture fixture, long amount) {
        return debtService.repay(TOKEN, "7", fixture.debtId().toString(), UUID.randomUUID().toString(),
                new DebtRepaymentRequest(amount, PaymentMethod.CASH, null));
    }

    private SaleVoidResponse voidSale(Fixture fixture) {
        return voidService.voidSale(TOKEN, "7", fixture.saleId().toString(), UUID.randomUUID().toString(),
                new SaleVoidRequest("Returned", true, PaymentMethod.CASH, null));
    }

    private void assertCancelled(Fixture fixture, long cancelled, int paymentCount) {
        Debt debt = debts.findById(fixture.debtId()).orElseThrow();
        assertThat(debt.getStatus()).isEqualTo(DebtStatus.VOIDED);
        assertThat(debt.getOutstandingVnd()).isZero();
        assertThat(debt.getCancelledVnd()).isEqualTo(cancelled);
        assertThat(debt.getVoidedAt()).isNotNull();
        assertThat(debt.getSettledAt()).isNull();
        assertThat(sales.findById(fixture.saleId()).orElseThrow().getSaleStatus()).isEqualTo(SaleStatus.VOIDED);
        assertThat(products.findById(fixture.productId()).orElseThrow().getStockQuantity()).isEqualByComparingTo("9");
        assertThat(payments.findAllBySaleIdOrderByIdAsc(fixture.saleId())).hasSize(paymentCount);
        assertThat(refunds.findBySaleId(fixture.saleId())).isPresent();
        assertThatThrownBy(() -> voidSale(fixture)).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SALE_ALREADY_VOIDED));
        assertThat(products.findById(fixture.productId()).orElseThrow().getStockQuantity()).isEqualByComparingTo("9");
    }

    private TransactionTemplate transaction() {
        var template = new TransactionTemplate(transactionManager);
        template.setTimeout(15);
        return template;
    }

    private <T> T afterLockedTransaction(Fixture fixture, Supplier<?> first, Supplier<T> second) throws Exception {
        var firstReady = new CountDownLatch(1);
        var releaseFirst = new CountDownLatch(1);
        var secondPid = new AtomicInteger();
        try (var workers = Executors.newFixedThreadPool(2)) {
            var firstResult = workers.submit(() -> transaction().execute(status -> {
                sales.findLockedByIdAndShopId(fixture.saleId(), 7L).orElseThrow();
                Object result = first.get();
                firstReady.countDown();
                await(releaseFirst);
                return result;
            }));
            try {
                assertThat(firstReady.await(10, TimeUnit.SECONDS)).isTrue();
                var secondResult = workers.submit(() -> transaction().execute(status -> {
                    secondPid.set(jdbc.queryForObject("select pg_backend_pid()", Integer.class));
                    return second.get();
                }));
                // Observe a real database lock wait, not a sleep-based scheduling assumption.
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
                boolean waiting = false;
                while (System.nanoTime() < deadline && !secondResult.isDone()) {
                    if (secondPid.get() != 0 && Boolean.TRUE.equals(jdbc.queryForObject(
                            "select coalesce((select wait_event_type = 'Lock' from pg_stat_activity where pid = ?), false)",
                            Boolean.class, secondPid.get()))) {
                        waiting = true;
                        break;
                    }
                    Thread.sleep(25);
                }
                assertThat(waiting).as("second transaction waits for first sale lock").isTrue();
                releaseFirst.countDown();
                firstResult.get(10, TimeUnit.SECONDS);
                try {
                    return secondResult.get(10, TimeUnit.SECONDS);
                } catch (ExecutionException exception) {
                    if (exception.getCause() instanceof RuntimeException cause) {
                        throw cause;
                    }
                    throw exception;
                }
            } finally {
                releaseFirst.countDown();
                workers.shutdownNow();
            }
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) {
                throw new AssertionError("Timed out waiting for the second transaction");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError(exception);
        }
    }

    @AfterAll
    static void removeOnlyGeneratedTestSchema() throws SQLException {
        if (schemaCreated && SCHEMA.matches("core_void_test_[a-f0-9]{32}")) {
            try (Connection connection = connection(); var statement = connection.createStatement()) {
                statement.execute("drop schema \"" + SCHEMA + "\" cascade");
            }
        }
    }

    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
    }

    private record Fixture(Long saleId, Long debtId, Long productId) { }

    @TestConfiguration(proxyBeanMethods = false)
    static class PostgresConfig {
        @Bean
        DataSource dataSource() throws SQLException {
            try (Connection connection = connection(); var statement = connection.createStatement()) {
                statement.execute("create schema \"" + SCHEMA + "\"");
                schemaCreated = true;
            }
            var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                    System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
            var properties = new java.util.Properties();
            properties.setProperty("currentSchema", SCHEMA);
            properties.setProperty("options", "-c lock_timeout=10000 -c statement_timeout=15000");
            source.setConnectionProperties(properties);
            return source;
        }
    }
}
