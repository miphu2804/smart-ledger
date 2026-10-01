package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smartledger.core.dto.request.ExpensePatchRequest;
import com.smartledger.core.dto.request.ExpenseWriteRequest;
import com.smartledger.core.entity.Debt;
import com.smartledger.core.entity.Expense;
import com.smartledger.core.entity.Payment;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.SaleRefund;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.ExpenseStatus;
import com.smartledger.core.enums.PaymentMethod;
import com.smartledger.core.enums.SaleStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.DebtRepository;
import com.smartledger.core.repository.ExpenseRepository;
import com.smartledger.core.repository.PaymentRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.repository.SaleRefundRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.ExpenseServiceImpl;
import com.smartledger.core.service.impl.ReportServiceImpl;
import java.util.function.Supplier;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

class ExpenseReportServiceTest {
    private final ShopService shopService = Mockito.mock(ShopService.class);
    private final ExpenseRepository expenseRepository = Mockito.mock(ExpenseRepository.class);
    private final SaleRepository saleRepository = Mockito.mock(SaleRepository.class);
    private final PaymentRepository paymentRepository = Mockito.mock(PaymentRepository.class);
    private final DebtRepository debtRepository = Mockito.mock(DebtRepository.class);
    private final SaleRefundRepository refundRepository = Mockito.mock(SaleRefundRepository.class);
    private final IdempotencyService idempotencyService = Mockito.mock(IdempotencyService.class);
    private final ExpenseService expenseService = new ExpenseServiceImpl(shopService, expenseRepository,
            idempotencyService);
    private final ReportService reportService = new ReportServiceImpl(shopService, saleRepository,
            paymentRepository, expenseRepository, debtRepository, refundRepository);
    private final VerifiedFirebaseToken token = new VerifiedFirebaseToken("uid", null, false, null, null, null);

    @BeforeEach
    void authorizeShop() {
        Shop shop = Shop.create(42L, "Shop", null, null, null);
        ReflectionTestUtils.setField(shop, "id", 7L);
        when(shopService.requireOwnedActiveShop(any(), eq("7"))).thenReturn(shop);
        when(idempotencyService.execute(any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenAnswer(invocation -> ((Supplier<?>) invocation.getArgument(8)).get());
    }

    @Test
    void createsManualExpenseWithinSelectedShop() {
        when(expenseRepository.save(any(Expense.class))).thenAnswer(invocation -> {
            Expense expense = invocation.getArgument(0);
            ReflectionTestUtils.setField(expense, "id", 9L);
            return expense;
        });
        OffsetDateTime when = OffsetDateTime.parse("2026-09-28T10:00:00+07:00");

        var response = expenseService.create(token, "7", "expense-one",
                new ExpenseWriteRequest("  Rent  ", "  Monthly rent  ", 200_000L, PaymentMethod.TRANSFER, when));

        assertThat(response.id()).isEqualTo(9L);
        assertThat(response.shopId()).isEqualTo(7L);
        assertThat(response.category()).isEqualTo("Rent");
        assertThat(response.description()).isEqualTo("Monthly rent");
        assertThat(response.amountVnd()).isEqualTo(200_000L);
        assertThat(response.expenseAt()).isEqualTo(when.withOffsetSameInstant(ZoneOffset.UTC));
        assertThat(response.status()).isEqualTo(ExpenseStatus.ACTIVE);
    }

    @Test
    void cannotReadExpenseFromAnotherShop() {
        assertThatThrownBy(() -> expenseService.getById(token, "7", "9"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.EXPENSE_NOT_FOUND));
        verify(expenseRepository).findByIdAndShopIdAndStatus(9L, 7L, ExpenseStatus.ACTIVE);
    }

    @Test
    void patchesOnlyProvidedFieldsAndArchivesWithoutDeleting() {
        Expense expense = Expense.manual(7L, 42L, "Rent", "Monthly rent", 200_000L,
                PaymentMethod.CASH, OffsetDateTime.now(ZoneOffset.UTC));
        ReflectionTestUtils.setField(expense, "id", 9L);
        when(expenseRepository.findByIdAndShopIdAndStatus(9L, 7L, ExpenseStatus.ACTIVE))
                .thenReturn(Optional.of(expense));
        ExpensePatchRequest patch = new ExpensePatchRequest();
        patch.setAmountVnd(210_000L);

        var updated = expenseService.patch(token, "7", "9", patch);

        assertThat(updated.amountVnd()).isEqualTo(210_000L);
        assertThat(updated.description()).isEqualTo("Monthly rent");
        expenseService.archive(token, "7", "9");
        assertThat(expense.getStatus()).isEqualTo(ExpenseStatus.ARCHIVED);
        assertThat(expense.getArchivedByUserId()).isEqualTo(42L);
        assertThat(expense.getArchivedAt()).isNotNull();
    }

    @Test
    void rejectsEmptyPatch() {
        Expense expense = Expense.manual(7L, 42L, null, "Fuel", 10_000L,
                null, OffsetDateTime.now(ZoneOffset.UTC));
        when(expenseRepository.findByIdAndShopIdAndStatus(9L, 7L, ExpenseStatus.ACTIVE))
                .thenReturn(Optional.of(expense));

        assertThatThrownBy(() -> expenseService.patch(token, "7", "9", new ExpensePatchRequest()))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.EXPENSE_UPDATE_REQUIRED));
    }

    @Test
    void reportSeparatesSaleRevenueFromAllPaymentsReceivedInPeriod() {
        Sale newSale = Mockito.mock(Sale.class);
        when(newSale.getTotalVnd()).thenReturn(100_000L);
        Payment initial = Mockito.mock(Payment.class);
        when(initial.getAmountVnd()).thenReturn(40_000L);
        Payment oldDebtRepayment = Mockito.mock(Payment.class);
        when(oldDebtRepayment.getAmountVnd()).thenReturn(30_000L);
        Expense expense = Expense.manual(7L, 42L, null, "Rent", 15_000L,
                null, OffsetDateTime.now(ZoneOffset.UTC));
        Debt debt = Debt.open(15L, 9L, 60_000L);
        when(saleRepository.findAllByShopIdAndSoldAtGreaterThanEqualAndSoldAtLessThan(
                eq(7L), any(), any())).thenReturn(List.of(newSale));
        when(paymentRepository.findReceivedByShopAndPeriod(eq(7L), any(), any()))
                .thenReturn(List.of(initial, oldDebtRepayment));
        when(expenseRepository
                .findAllByShopIdAndStatusAndExpenseAtGreaterThanEqualAndExpenseAtLessThanOrderByExpenseAtDescIdDesc(
                        eq(7L), eq(ExpenseStatus.ACTIVE), any(), any())).thenReturn(List.of(expense));
        when(debtRepository.findAllByShopIdOrderByIdDesc(7L)).thenReturn(List.of(debt));

        var summary = reportService.summary(token, "7", "today");

        assertThat(summary.grossRevenueVnd()).isEqualTo(100_000L);
        assertThat(summary.voidedRevenueVnd()).isZero();
        assertThat(summary.netRevenueVnd()).isEqualTo(100_000L);
        assertThat(summary.collectedVnd()).isEqualTo(70_000L);
        assertThat(summary.expenseVnd()).isEqualTo(15_000L);
        assertThat(summary.currentOutstandingDebtVnd()).isEqualTo(60_000L);
        assertThat(summary.orderCount()).isEqualTo(1L);
    }

    @Test
    void reportKeepsHistoricalReceiptsAndShowsRefundOnItsOwnDate() {
        Sale soldEarlier = Mockito.mock(Sale.class);
        when(soldEarlier.getTotalVnd()).thenReturn(100_000L);
        Payment payment = Mockito.mock(Payment.class);
        when(payment.getAmountVnd()).thenReturn(40_000L);
        SaleRefund refund = SaleRefund.record(15L, 40_000L, PaymentMethod.CASH, null, 42L);
        when(saleRepository.findAllByShopIdAndSaleStatusAndVoidedAtGreaterThanEqualAndVoidedAtLessThan(
                eq(7L), eq(SaleStatus.VOIDED), any(), any())).thenReturn(List.of(soldEarlier));
        when(paymentRepository.findReceivedByShopAndPeriod(eq(7L), any(), any()))
                .thenReturn(List.of(payment));
        when(refundRepository.findRefundedByShopAndPeriod(eq(7L), any(), any()))
                .thenReturn(List.of(refund));

        var summary = reportService.summary(token, "7", "today");

        assertThat(summary.grossRevenueVnd()).isZero();
        assertThat(summary.netRevenueVnd()).isEqualTo(-100_000L);
        assertThat(summary.voidedRevenueVnd()).isEqualTo(100_000L);
        assertThat(summary.collectedVnd()).isEqualTo(40_000L);
        assertThat(summary.refundedVnd()).isEqualTo(40_000L);
        assertThat(summary.voidedOrderCount()).isEqualTo(1);
    }

    @Test
    void samePeriodSaleAndVoidKeepGrossAndCancelledRevenueSeparate() {
        Sale sale = Mockito.mock(Sale.class);
        when(sale.getTotalVnd()).thenReturn(100_000L);
        when(saleRepository.findAllByShopIdAndSoldAtGreaterThanEqualAndSoldAtLessThan(
                eq(7L), any(), any())).thenReturn(List.of(sale));
        when(saleRepository.findAllByShopIdAndSaleStatusAndVoidedAtGreaterThanEqualAndVoidedAtLessThan(
                eq(7L), eq(SaleStatus.VOIDED), any(), any())).thenReturn(List.of(sale));

        var summary = reportService.summary(token, "7", "today");

        assertThat(summary.grossRevenueVnd()).isEqualTo(100_000L);
        assertThat(summary.voidedRevenueVnd()).isEqualTo(100_000L);
        assertThat(summary.netRevenueVnd()).isZero();
        assertThat(summary.orderCount()).isEqualTo(1);
        assertThat(summary.voidedOrderCount()).isEqualTo(1);
    }

    @Test
    void priorPeriodVoidCanExceedNewSalesWithoutClampingNetRevenue() {
        Sale newSale = Mockito.mock(Sale.class);
        when(newSale.getTotalVnd()).thenReturn(50_000L);
        Sale voidedSale = Mockito.mock(Sale.class);
        when(voidedSale.getTotalVnd()).thenReturn(100_000L);
        when(saleRepository.findAllByShopIdAndSoldAtGreaterThanEqualAndSoldAtLessThan(
                eq(7L), any(), any())).thenReturn(List.of(newSale));
        when(saleRepository.findAllByShopIdAndSaleStatusAndVoidedAtGreaterThanEqualAndVoidedAtLessThan(
                eq(7L), eq(SaleStatus.VOIDED), any(), any())).thenReturn(List.of(voidedSale));

        var summary = reportService.summary(token, "7", "today");

        assertThat(summary.grossRevenueVnd()).isEqualTo(50_000L);
        assertThat(summary.voidedRevenueVnd()).isEqualTo(100_000L);
        assertThat(summary.netRevenueVnd()).isEqualTo(-50_000L);
        assertThat(summary.netRevenueVnd()).isEqualTo(summary.grossRevenueVnd() - summary.voidedRevenueVnd());
    }

    @Test
    void emptyPeriodReturnsZeroForAllThreeRevenueMetrics() {
        var summary = reportService.summary(token, "7", "today");

        assertThat(summary.grossRevenueVnd()).isZero();
        assertThat(summary.voidedRevenueVnd()).isZero();
        assertThat(summary.netRevenueVnd()).isZero();
    }

    @Test
    void rejectsUnsupportedPeriodBeforeReadingBusinessData() {
        assertThatThrownBy(() -> reportService.summary(token, "7", "all_time"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_REPORT_PERIOD));
    }

    @Test
    void acceptsYearForExpenseListAndReportSummary() {
        var expenses = expenseService.list(token, "7", "year");
        var summary = reportService.summary(token, "7", "year");

        assertThat(expenses).isEmpty();
        assertThat(summary.period()).isEqualTo("year");
        verify(expenseRepository, Mockito.times(2))
                .findAllByShopIdAndStatusAndExpenseAtGreaterThanEqualAndExpenseAtLessThanOrderByExpenseAtDescIdDesc(
                        eq(7L), eq(ExpenseStatus.ACTIVE), any(), any());
    }
}
