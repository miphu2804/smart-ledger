package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smartledger.core.dto.request.SaleDraftItemRequest;
import com.smartledger.core.dto.request.SaleDraftWriteRequest;
import com.smartledger.core.entity.Payment;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.SaleDraft;
import com.smartledger.core.entity.SaleDraftItem;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.DraftStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.PaymentMethod;
import com.smartledger.core.enums.PaymentStatus;
import com.smartledger.core.enums.PaymentType;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.PaymentRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.repository.SaleDraftItemRepository;
import com.smartledger.core.repository.SaleDraftRepository;
import com.smartledger.core.repository.SaleItemRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.SaleDraftServiceImpl;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

class SaleDraftServiceTest {
    private final ShopService shopService = Mockito.mock(ShopService.class);
    private final SaleDraftRepository draftRepository = Mockito.mock(SaleDraftRepository.class);
    private final SaleDraftItemRepository draftItemRepository = Mockito.mock(SaleDraftItemRepository.class);
    private final ProductRepository productRepository = Mockito.mock(ProductRepository.class);
    private final SaleRepository saleRepository = Mockito.mock(SaleRepository.class);
    private final SaleItemRepository saleItemRepository = Mockito.mock(SaleItemRepository.class);
    private final PaymentRepository paymentRepository = Mockito.mock(PaymentRepository.class);
    private final SaleDraftService service = new SaleDraftServiceImpl(shopService, draftRepository,
            draftItemRepository, productRepository, saleRepository, saleItemRepository, paymentRepository);
    private final VerifiedFirebaseToken token = new VerifiedFirebaseToken("uid", null, false, null, null, null);

    @BeforeEach
    void setupShop() {
        Shop shop = Shop.create(42L, "Tiệm Thảo", "Grocery", null, null);
        ReflectionTestUtils.setField(shop, "id", 7L);
        when(shopService.requireOwnedActiveShop(any(), eq("7"))).thenReturn(shop);
    }

    @Test
    void creatingDraftDoesNotCreateSalePaymentOrChangeStock() {
        Product product = product(new BigDecimal("5.000"));
        when(productRepository.findByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));
        when(draftRepository.save(any(SaleDraft.class))).thenAnswer(invocation -> {
            SaleDraft draft = invocation.getArgument(0);
            ReflectionTestUtils.setField(draft, "id", 11L);
            return draft;
        });
        when(draftItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.create(token, "7", request(25000L, PaymentMethod.CASH));

        assertThat(response.id()).isEqualTo(11L);
        assertThat(response.estimatedTotalVnd()).isEqualTo(25000L);
        assertThat(response.status()).isEqualTo(DraftStatus.DRAFT);
        assertThat(response.items()).hasSize(1);
        assertThat(response.expiresAt()).isAfter(OffsetDateTime.now(ZoneOffset.UTC).plusDays(28));
        assertThat(product.getStockQuantity()).isEqualByComparingTo("5.000");
        verify(saleRepository, never()).saveAndFlush(any());
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void confirmingFullPaymentCreatesSaleItemsPaymentAndDeductsStock() {
        Product product = product(new BigDecimal("5.000"));
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        SaleDraftItem item = SaleDraftItem.create(11L, product, BigDecimal.ONE, 25000L, 25000L);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(draftItemRepository.findAllByDraftIdOrderByIdAsc(11L)).thenReturn(List.of(item));
        when(productRepository.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));
        when(saleRepository.saveAndFlush(any(Sale.class))).thenAnswer(invocation -> {
            Sale sale = invocation.getArgument(0);
            ReflectionTestUtils.setField(sale, "id", 15L);
            return sale;
        });
        when(saleItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.confirm(token, "7", "11");

        assertThat(response.id()).isEqualTo(15L);
        assertThat(response.paymentStatus()).isEqualTo(PaymentStatus.PAID);
        assertThat(response.items()).hasSize(1);
        assertThat(product.getStockQuantity()).isEqualByComparingTo("4.000");
        assertThat(draft.getStatus()).isEqualTo(DraftStatus.CONFIRMED);
        assertThat(draft.getConfirmedSaleId()).isEqualTo(15L);
        ArgumentCaptor<Payment> payment = ArgumentCaptor.forClass(Payment.class);
        verify(paymentRepository).save(payment.capture());
        assertThat(payment.getValue().getSaleId()).isEqualTo(15L);
        assertThat(payment.getValue().getType()).isEqualTo(PaymentType.INITIAL);
        assertThat(payment.getValue().getAmountVnd()).isEqualTo(25000L);
        assertThat(payment.getValue().getReceivedByUserId()).isEqualTo(42L);
    }

    @Test
    void confirmingAlreadyConfirmedDraftReturnsExistingSaleWithoutChargingAgain() {
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        draft.confirm(15L);
        Sale sale = Sale.fromPaidDraft(draft, 25000L);
        ReflectionTestUtils.setField(sale, "id", 15L);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(saleRepository.findByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale));
        when(saleItemRepository.findAllBySaleIdOrderByIdAsc(15L)).thenReturn(List.of());

        assertThat(service.confirm(token, "7", "11").id()).isEqualTo(15L);
        verify(paymentRepository, never()).save(any());
        verify(productRepository, never()).findLockedByIdAndShopIdAndStatus(any(), any(), any());
    }

    @Test
    void partialPaymentCannotBeConfirmedBeforeDebtSupportExists() {
        SaleDraft draft = draft(10000L, PaymentMethod.CASH);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> service.confirm(token, "7", "11"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.FULL_PAYMENT_REQUIRED));
        verify(saleRepository, never()).saveAndFlush(any());
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void insufficientStockPreventsSaleAndPayment() {
        Product product = product(BigDecimal.ZERO);
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        SaleDraftItem item = SaleDraftItem.create(11L, product, BigDecimal.ONE, 25000L, 25000L);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(draftItemRepository.findAllByDraftIdOrderByIdAsc(11L)).thenReturn(List.of(item));
        when(productRepository.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));

        assertThatThrownBy(() -> service.confirm(token, "7", "11"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_STOCK_INSUFFICIENT));
        verify(saleRepository, never()).saveAndFlush(any());
        verify(paymentRepository, never()).save(any());
    }

    @Test
    void rejectsProductFromAnotherShopAndDuplicateProductInDraft() {
        assertThatThrownBy(() -> service.create(token, "7", request(25000L, PaymentMethod.CASH)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DRAFT_ITEM_INVALID));
        verify(draftRepository, never()).save(any());

        Product product = product(new BigDecimal("5.000"));
        when(productRepository.findByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));
        SaleDraftItemRequest line = new SaleDraftItemRequest(3L, BigDecimal.ONE, 25000L);
        SaleDraftWriteRequest duplicates = new SaleDraftWriteRequest(null, null, 0L, 50000L,
                PaymentMethod.CASH, List.of(line, line));
        assertThatThrownBy(() -> service.create(token, "7", duplicates))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DRAFT_ITEM_DUPLICATE));
    }

    @Test
    void cancelledDraftCannotBeConfirmed() {
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        draft.cancel();
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> service.confirm(token, "7", "11"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DRAFT_NOT_EDITABLE));
    }

    @Test
    void expiredDraftCannotBeConfirmed() {
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        ReflectionTestUtils.setField(draft, "expiresAt", OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(1));
        when(draftRepository.findByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));

        assertThat(service.getById(token, "7", "11").status()).isEqualTo(DraftStatus.EXPIRED);
        assertThatThrownBy(() -> service.confirm(token, "7", "11"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DRAFT_NOT_EDITABLE));
    }

    @Test
    void cancelKeepsDraftHistoryWithoutDeletingRows() {
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));

        service.cancel(token, "7", "11");

        assertThat(draft.getStatus()).isEqualTo(DraftStatus.CANCELLED);
        assertThat(draft.getCancelledAt()).isNotNull();
        verify(draftRepository, never()).delete(any());
        verify(draftItemRepository, never()).deleteAllByDraftId(any());
    }

    @Test
    void replaceDraftReplacesItemsButDoesNotCreateSale() {
        SaleDraft draft = draft(25000L, PaymentMethod.CASH);
        Product product = product(new BigDecimal("5.000"));
        when(draftRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(draft));
        when(productRepository.findByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));
        when(draftItemRepository.saveAll(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.replace(token, "7", "11", request(25000L, PaymentMethod.CASH));

        assertThat(response.items()).hasSize(1);
        verify(draftItemRepository).deleteAllByDraftId(11L);
        verify(saleRepository, never()).saveAndFlush(any());
    }

    private Product product(BigDecimal stock) {
        Product product = Product.create(7L);
        ReflectionTestUtils.setField(product, "id", 3L);
        product.replace(null, "Cà phê", null, null, "ly", 25000L, null, true, stock);
        return product;
    }

    private SaleDraft draft(long paid, PaymentMethod method) {
        SaleDraft draft = SaleDraft.create(7L, 42L);
        ReflectionTestUtils.setField(draft, "id", 11L);
        draft.replace(null, null, 0, 25000, paid, method);
        return draft;
    }

    private SaleDraftWriteRequest request(long paid, PaymentMethod method) {
        return new SaleDraftWriteRequest(null, null, 0L, paid, method,
                List.of(new SaleDraftItemRequest(3L, BigDecimal.ONE, 25000L)));
    }
}
