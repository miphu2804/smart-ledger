package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.smartledger.core.dto.request.SaleVoidRequest;
import com.smartledger.core.entity.Customer;
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
import com.smartledger.core.service.impl.SaleVoidServiceImpl;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

class SaleVoidServiceTest {
    private final ShopService shopService = Mockito.mock(ShopService.class);
    private final SaleRepository saleRepository = Mockito.mock(SaleRepository.class);
    private final SaleItemRepository itemRepository = Mockito.mock(SaleItemRepository.class);
    private final DebtRepository debtRepository = Mockito.mock(DebtRepository.class);
    private final PaymentRepository paymentRepository = Mockito.mock(PaymentRepository.class);
    private final ProductRepository productRepository = Mockito.mock(ProductRepository.class);
    private final SaleRefundRepository refundRepository = Mockito.mock(SaleRefundRepository.class);
    private final IdempotencyService idempotencyService = Mockito.mock(IdempotencyService.class);
    private final AuditLogService auditLogService = Mockito.mock(AuditLogService.class);
    private final NotificationEventService notifications = Mockito.mock(NotificationEventService.class);
    private final SaleVoidService service = new SaleVoidServiceImpl(shopService, saleRepository,
            itemRepository, debtRepository, paymentRepository, productRepository, refundRepository,
            idempotencyService, auditLogService, notifications);
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
    void voidsPartiallyPaidSaleAndRefundsOnlyMoneyActuallyReceived() {
        Sale sale = sale(40_000L);
        Debt debt = Debt.open(15L, 9L, 60_000L);
        when(saleRepository.findLockedByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale));
        when(paymentRepository.findAllBySaleIdOrderByIdAsc(15L))
                .thenReturn(List.of(Payment.initial(15L, 40_000L, PaymentMethod.CASH, 42L)));
        when(debtRepository.findLockedBySaleIdAndShopId(15L, 7L)).thenReturn(Optional.of(debt));
        when(refundRepository.save(any(SaleRefund.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.voidSale(token, "7", "15", "void-one",
                new SaleVoidRequest("Customer returned item", false, PaymentMethod.CASH, null));

        assertThat(response.sale().saleStatus()).isEqualTo(SaleStatus.VOIDED);
        assertThat(response.sale().voidReason()).isEqualTo("Customer returned item");
        assertThat(response.sale().voidedAt()).isNotNull();
        assertThat(response.sale().paidVnd()).isEqualTo(40_000L);
        assertThat(response.sale().outstandingVnd()).isZero();
        assertThat(response.cancelledDebtVnd()).isEqualTo(60_000L);
        assertThat(debt.getStatus()).isEqualTo(DebtStatus.VOIDED);
        assertThat(debt.getOutstandingVnd()).isZero();
        assertThat(debt.getCancelledVnd()).isEqualTo(60_000L);
        assertThat(debt.getVoidedAt()).isNotNull();
        assertThat(debt.getSettledAt()).isNull();
        assertThat(response.refund().amountVnd()).isEqualTo(40_000L);
        assertThat(response.stockRestocked()).isFalse();
        verifyNoInteractions(productRepository);
    }

    @Test
    void unpaidSaleCancelsDebtWithoutCreatingRefund() {
        Sale sale = sale(0);
        Debt debt = Debt.open(15L, 9L, 100_000L);
        when(saleRepository.findLockedByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale));
        when(debtRepository.findLockedBySaleIdAndShopId(15L, 7L)).thenReturn(Optional.of(debt));
        var response = service.voidSale(token, "7", "15", "void-unpaid",
                new SaleVoidRequest("Cancelled", false, null, null));
        assertThat(response.refund()).isNull();
        assertThat(response.cancelledDebtVnd()).isEqualTo(100_000L);
        assertThat(debt.getCancelledVnd()).isEqualTo(100_000L);
        assertThat(debt.getVoidedAt()).isNotNull();
        verify(refundRepository, never()).save(any());
    }

    @Test
    void requiresRefundMethodWhenMoneyWasReceived() {
        when(saleRepository.findLockedByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale(40_000L)));
        when(paymentRepository.findAllBySaleIdOrderByIdAsc(15L))
                .thenReturn(List.of(Payment.initial(15L, 40_000L, PaymentMethod.CASH, 42L)));
        assertThatThrownBy(() -> service.voidSale(token, "7", "15", "missing-method",
                new SaleVoidRequest("Cancelled", false, null, null)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SALE_REFUND_METHOD_REQUIRED));
        verify(refundRepository, never()).save(any());
    }

    @Test
    void cannotVoidSaleBelongingToAnotherShop() {
        assertThatThrownBy(() -> service.voidSale(token, "7", "15", "foreign-sale",
                new SaleVoidRequest("Cancelled", false, null, null)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SALE_NOT_FOUND));
        verifyNoInteractions(paymentRepository, refundRepository);
    }

    @Test
    void cannotVoidSameSaleTwiceWithANewKey() {
        Sale sale = sale(0);
        sale.voidSale(42L, "First cancellation");
        when(saleRepository.findLockedByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale));
        assertThatThrownBy(() -> service.voidSale(token, "7", "15", "different-key",
                new SaleVoidRequest("Second cancellation", false, null, null)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SALE_ALREADY_VOIDED));
        verifyNoInteractions(paymentRepository, refundRepository);
    }

    @Test
    void refusesToRecordRefundWhenPaymentsDoNotMatchSaleBalance() {
        when(saleRepository.findLockedByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale(40_000L)));
        when(paymentRepository.findAllBySaleIdOrderByIdAsc(15L))
                .thenReturn(List.of(Payment.initial(15L, 20_000L, PaymentMethod.CASH, 42L)));

        assertThatThrownBy(() -> service.voidSale(token, "7", "15", "mismatch",
                new SaleVoidRequest("Cancelled", false, PaymentMethod.CASH, null)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SALE_PAYMENT_MISMATCH));
        verify(refundRepository, never()).save(any());
    }

    @Test
    void restocksOnlyItemThatActuallyDeductedStockAtCheckout() {
        Sale sale = sale(0);
        Product product = Product.create(7L);
        product.replace(null, "Item", null, null, "piece", 100_000L, null,
                true, BigDecimal.valueOf(7));
        ReflectionTestUtils.setField(product, "id", 3L);
        SaleDraftItem draftItem = SaleDraftItem.create(1L, product, BigDecimal.valueOf(3), 30_000L, 90_000L);
        SaleItem item = SaleItem.fromDraftItem(15L, draftItem, true);
        when(saleRepository.findLockedByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale));
        when(itemRepository.findAllBySaleIdOrderByIdAsc(15L)).thenReturn(List.of(item));
        when(productRepository.findAllLockedByIdInAndShopId(List.of(3L), 7L)).thenReturn(List.of(product));

        var response = service.voidSale(token, "7", "15", "restock-one",
                new SaleVoidRequest("Returned", true, null, null));

        assertThat(response.stockRestocked()).isTrue();
        assertThat(product.getStockQuantity()).isEqualByComparingTo("10");
        var locks = inOrder(saleRepository, debtRepository, productRepository);
        locks.verify(saleRepository).findLockedByIdAndShopId(15L, 7L);
        locks.verify(debtRepository).findLockedBySaleIdAndShopId(15L, 7L);
        locks.verify(productRepository).findAllLockedByIdInAndShopId(List.of(3L), 7L);
    }

    @Test
    void refundsFullyRepaidSaleWithoutRewritingSettledDebt() {
        Sale sale = sale(40_000L);
        sale.recordRepayment(60_000L);
        Debt debt = Debt.open(15L, 9L, 60_000L);
        debt.repay(60_000L);
        var settledAt = debt.getSettledAt();
        when(saleRepository.findLockedByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale));
        when(debtRepository.findLockedBySaleIdAndShopId(15L, 7L)).thenReturn(Optional.of(debt));
        when(paymentRepository.findAllBySaleIdOrderByIdAsc(15L)).thenReturn(List.of(
                Payment.initial(15L, 40_000L, PaymentMethod.CASH, 42L),
                Payment.debtRepayment(15L, 11L, 60_000L, PaymentMethod.CASH, null, 42L)));
        when(refundRepository.save(any(SaleRefund.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.voidSale(token, "7", "15", "settled-void",
                new SaleVoidRequest("Returned after repayment", false, PaymentMethod.CASH, null));

        assertThat(response.sale().saleStatus()).isEqualTo(SaleStatus.VOIDED);
        assertThat(response.refund().amountVnd()).isEqualTo(100_000L);
        assertThat(response.cancelledDebtVnd()).isZero();
        assertThat(debt.getStatus()).isEqualTo(DebtStatus.SETTLED);
        assertThat(debt.getSettledAt()).isEqualTo(settledAt);
        assertThat(debt.getCancelledVnd()).isNull();
        assertThat(debt.getVoidedAt()).isNull();
    }

    @Test
    void rejectsRestockWhenHistoricalDeductionIsUnknown() {
        Sale sale = sale(0);
        SaleItem historical = SaleItem.fromDraftItem(15L,
                SaleDraftItem.createCustom(1L, "Item", "piece", BigDecimal.ONE, 100_000L, 100_000L));
        ReflectionTestUtils.setField(historical, "stockDeducted", null);
        when(saleRepository.findLockedByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale));
        when(itemRepository.findAllBySaleIdOrderByIdAsc(15L)).thenReturn(List.of(historical));
        assertThatThrownBy(() -> service.voidSale(token, "7", "15", "unknown-stock",
                new SaleVoidRequest("Returned", true, null, null)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SALE_RESTOCK_UNAVAILABLE));
        assertThat(sale.getSaleStatus()).isEqualTo(SaleStatus.CONFIRMED);
        verifyNoInteractions(productRepository);
    }

    @Test
    void locksDebtThenProductsInAscendingIdOrder() {
        Sale sale = sale(0);
        when(saleRepository.findLockedByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale));
        Product lower = Product.create(7L);
        lower.replace(null, "Lower", null, null, "piece", 50_000L, null, true, BigDecimal.valueOf(7));
        ReflectionTestUtils.setField(lower, "id", 3L);
        Product higher = Product.create(7L);
        higher.replace(null, "Higher", null, null, "piece", 50_000L, null, true, BigDecimal.valueOf(7));
        ReflectionTestUtils.setField(higher, "id", 5L);
        when(itemRepository.findAllBySaleIdOrderByIdAsc(15L)).thenReturn(List.of(
                SaleItem.fromDraftItem(15L, SaleDraftItem.create(1L, higher, BigDecimal.ONE, 50_000L, 50_000L), true),
                SaleItem.fromDraftItem(15L, SaleDraftItem.create(1L, lower, BigDecimal.ONE, 50_000L, 50_000L), true)));
        when(productRepository.findAllLockedByIdInAndShopId(List.of(3L, 5L), 7L)).thenReturn(List.of(lower, higher));

        service.voidSale(token, "7", "15", "ordered-restock", new SaleVoidRequest("Returned", true, null, null));

        var locks = inOrder(saleRepository, debtRepository, productRepository);
        locks.verify(saleRepository).findLockedByIdAndShopId(15L, 7L);
        locks.verify(debtRepository).findLockedBySaleIdAndShopId(15L, 7L);
        locks.verify(productRepository).findAllLockedByIdInAndShopId(List.of(3L, 5L), 7L);
        verify(productRepository, never()).findLockedByIdAndShopIdAndStatus(any(), any(), any());
        assertThat(lower.getStockQuantity()).isEqualByComparingTo("8");
        assertThat(higher.getStockQuantity()).isEqualByComparingTo("8");
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 20, 100})
    void restockLocksAllDeductedProductsOnce(int count) {
        var products = IntStream.rangeClosed(1, count).mapToObj(index -> {
            var product = Product.create(7L);
            product.replace(null, "Item", null, null, "piece", 1000L, null, true, BigDecimal.TEN);
            ReflectionTestUtils.setField(product, "id", (long) index);
            return product;
        }).toList();
        var ids = products.stream().map(Product::getId).toList();
        var items = products.reversed().stream().map(product -> SaleItem.fromDraftItem(15L,
                SaleDraftItem.create(11L, product, BigDecimal.ONE, 1000L, 1000L), true)).toList();
        when(saleRepository.findLockedByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale(0)));
        when(itemRepository.findAllBySaleIdOrderByIdAsc(15L)).thenReturn(items);
        when(productRepository.findAllLockedByIdInAndShopId(ids, 7L)).thenReturn(products);
        Mockito.doAnswer(call -> {
            assertThat(products).allSatisfy(product -> assertThat(product.getStockQuantity()).isEqualByComparingTo("11"));
            return null;
        }).when(notifications).reconcileStock(any(Shop.class), Mockito.anyCollection());

        assertThat(service.voidSale(token, "7", "15", "batch", new SaleVoidRequest("Return", true, null, null))
                .stockRestocked()).isTrue();

        assertThat(products).allSatisfy(product -> assertThat(product.getStockQuantity()).isEqualByComparingTo("11"));
        verify(productRepository).findAllLockedByIdInAndShopId(ids, 7L);
        verify(notifications).reconcileStock(any(Shop.class), Mockito.anyCollection());
        verify(notifications, never()).reconcileStock(any(Shop.class), any(Product.class));
    }

    @Test
    void missingRestockProductRejectsWholeBatch() {
        var product = Product.create(7L);
        product.replace(null, "Item", null, null, "piece", 1000L, null, true, BigDecimal.TEN);
        ReflectionTestUtils.setField(product, "id", 3L);
        var sale = sale(0);
        when(saleRepository.findLockedByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale));
        when(itemRepository.findAllBySaleIdOrderByIdAsc(15L)).thenReturn(List.of(SaleItem.fromDraftItem(15L,
                SaleDraftItem.create(11L, product, BigDecimal.ONE, 1000L, 1000L), true)));
        when(productRepository.findAllLockedByIdInAndShopId(List.of(3L), 7L)).thenReturn(List.of());

        assertThatThrownBy(() -> service.voidSale(token, "7", "15", "missing", new SaleVoidRequest("Return", true, null, null)))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SALE_RESTOCK_UNAVAILABLE));
        assertThat(sale.getSaleStatus()).isEqualTo(SaleStatus.CONFIRMED);
        assertThat(product.getStockQuantity()).isEqualByComparingTo("10");
        verifyNoInteractions(refundRepository, auditLogService);
    }

    @Test
    void customAndNonDeductedItemsDoNotLockProductsWhenRestocking() {
        var custom = SaleItem.fromDraftItem(15L,
                SaleDraftItem.createCustom(11L, "Custom", "piece", BigDecimal.ONE, 1000L, 1000L), false);
        when(saleRepository.findLockedByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale(0)));
        when(itemRepository.findAllBySaleIdOrderByIdAsc(15L)).thenReturn(List.of(custom));

        assertThat(service.voidSale(token, "7", "15", "custom", new SaleVoidRequest("Return", true, null, null))
                .stockRestocked()).isFalse();
        verifyNoInteractions(productRepository);
    }

    private Sale sale(long paid) {
        SaleDraft draft = SaleDraft.create(7L, 42L);
        draft.replace(null, "Customer", null, 0, 100_000L, paid,
                paid == 0 ? null : PaymentMethod.CASH);
        Customer customer = Customer.create(7L, "Customer", null);
        ReflectionTestUtils.setField(customer, "id", 9L);
        Sale sale = Sale.fromDraft(draft, 100_000L, customer);
        ReflectionTestUtils.setField(sale, "id", 15L);
        return sale;
    }
}
