package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.smartledger.core.dto.request.OwnerListQuery.*;
import com.smartledger.core.entity.Payment;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.SaleDraft;
import com.smartledger.core.entity.SaleDraftItem;
import com.smartledger.core.entity.SaleItem;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.PaymentMethod;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.PaymentRepository;
import com.smartledger.core.repository.SaleItemRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.PaymentServiceImpl;
import com.smartledger.core.service.impl.SaleServiceImpl;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mockito;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.test.util.ReflectionTestUtils;

class SalePaymentServiceTest {
    private final ShopService shopService = Mockito.mock(ShopService.class);
    private final SaleRepository saleRepository = Mockito.mock(SaleRepository.class);
    private final SaleItemRepository saleItemRepository = Mockito.mock(SaleItemRepository.class);
    private final PaymentRepository paymentRepository = Mockito.mock(PaymentRepository.class);
    private final SaleService saleService = new SaleServiceImpl(shopService, saleRepository, saleItemRepository);
    private final PaymentService paymentService = new PaymentServiceImpl(shopService, saleRepository, paymentRepository);
    private final VerifiedFirebaseToken token = new VerifiedFirebaseToken("uid", null, false, null, null, null);

    @BeforeEach
    void authorizeShop() {
        Shop shop = Shop.create(42L, "Tiệm Thảo", "Grocery", null, null);
        ReflectionTestUtils.setField(shop, "id", 7L);
        when(shopService.requireOwnedActiveShop(any(), eq("7"))).thenReturn(shop);
    }

    @Test
    void listsOnlySalesFromSelectedShop() {
        Sale sale = sale();
        when(saleRepository.findAll(org.mockito.ArgumentMatchers.<Specification<com.smartledger.core.entity.Sale>>any(), org.mockito.ArgumentMatchers.any(Pageable.class))).thenReturn(new PageImpl<>(List.of(sale)));
        when(saleItemRepository.findAllForPage(eq(7L), any())).thenReturn(List.of());

        var responses = saleService.list(token, "7", new Sales(0, 100, null, null, null, null)).items();
        assertThat(responses).extracting(response -> response.id()).containsExactly(15L);
        assertThat(responses.getFirst().items()).isEmpty();
        verify(saleRepository).findAll(org.mockito.ArgumentMatchers.<Specification<com.smartledger.core.entity.Sale>>any(), org.mockito.ArgumentMatchers.any(Pageable.class));
        verify(saleItemRepository).findAllForPage(eq(7L), any());
        verify(saleItemRepository, never()).findAllBySaleIdOrderByIdAsc(any());
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 20, 100})
    void loadsItemsOnceRegardlessOfSaleCount(int count) {
        var sales = IntStream.rangeClosed(1, count).mapToObj(index -> {
            Sale sale = sale();
            ReflectionTestUtils.setField(sale, "id", (long) count - index + 1);
            return sale;
        }).toList();
        var items = IntStream.rangeClosed(1, count).boxed().flatMap(index ->
                IntStream.rangeClosed(1, 2).mapToObj(line -> {
                    var draftItem = SaleDraftItem.createCustom((long) index, "Item " + line, "piece",
                            BigDecimal.ONE, 12500L, 12500L);
                    var item = SaleItem.fromDraftItem((long) index, draftItem);
                    ReflectionTestUtils.setField(item, "id", index * 2L + line);
                    return item;
                })).toList();
        when(saleRepository.findAll(org.mockito.ArgumentMatchers.<Specification<com.smartledger.core.entity.Sale>>any(), org.mockito.ArgumentMatchers.any(Pageable.class))).thenReturn(new PageImpl<>(sales));
        when(saleItemRepository.findAllForPage(eq(7L), any())).thenReturn(items);

        var responses = saleService.list(token, "7", new Sales(0, 100, null, null, null, null)).items();

        assertThat(responses).hasSize(count);
        assertThat(responses).extracting(response -> response.id())
                .containsExactlyElementsOf(sales.stream().map(Sale::getId).toList());
        for (var response : responses) {
            assertThat(response.items()).extracting(item -> item.id())
                    .containsExactly(response.id() * 2 + 1, response.id() * 2 + 2);
            assertThat(response.items()).extracting(item -> item.productName())
                    .containsExactly("Item 1", "Item 2");
        }
        verify(saleItemRepository).findAllForPage(eq(7L), any());
        verify(saleItemRepository, never()).findAllBySaleIdOrderByIdAsc(any());
    }

    @Test
    void emptySaleListDoesNotReadItems() {
        when(saleRepository.findAll(org.mockito.ArgumentMatchers.<Specification<com.smartledger.core.entity.Sale>>any(), org.mockito.ArgumentMatchers.any(Pageable.class))).thenReturn(new PageImpl<>(List.of()));

        assertThat(saleService.list(token, "7", new Sales(0, 100, null, null, null, null)).items()).isEmpty();

        verifyNoInteractions(saleItemRepository);
    }

    @Test
    void saleListChecksShopAccessBeforeReadingData() {
        when(shopService.requireOwnedActiveShop(token, "7"))
                .thenThrow(new BusinessException(ErrorCode.SHOP_ACCESS_DENIED));

        assertThatThrownBy(() -> saleService.list(token, "7", new Sales(0, 100, null, null, null, null)).items())
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.SHOP_ACCESS_DENIED));

        verifyNoInteractions(saleRepository, saleItemRepository);
    }

    @Test
    void saleDetailKeepsSingleSaleItemQuery() {
        when(saleRepository.findByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale()));

        assertThat(saleService.getById(token, "7", "15").id()).isEqualTo(15L);

        verify(saleItemRepository).findAllBySaleIdOrderByIdAsc(15L);
        verify(saleItemRepository, never()).findAllByShopId(any());
    }

    @Test
    void cannotReadSaleFromAnotherShop() {
        assertThatThrownBy(() -> saleService.getById(token, "7", "15"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SALE_NOT_FOUND));
        verify(saleRepository).findByIdAndShopId(15L, 7L);
    }

    @Test
    void cannotReadPaymentUnlessItsSaleBelongsToSelectedShop() {
        assertThatThrownBy(() -> paymentService.getById(token, "7", "15", "20"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SALE_NOT_FOUND));
        Mockito.verifyNoInteractions(paymentRepository);
    }

    @Test
    void cannotReadPaymentFromAnotherSale() {
        when(saleRepository.findByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale()));

        assertThatThrownBy(() -> paymentService.getById(token, "7", "15", "20"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PAYMENT_NOT_FOUND));
        verify(paymentRepository).findByIdAndSaleId(20L, 15L);
    }

    @Test
    void listsInitialPaymentForOwnedSale() {
        when(saleRepository.findByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale()));
        Payment payment = Payment.initial(15L, 25000L, PaymentMethod.CASH, 42L);
        ReflectionTestUtils.setField(payment, "id", 20L);
        when(paymentRepository.findAllBySaleIdOrderByIdAsc(15L)).thenReturn(List.of(payment));

        assertThat(paymentService.listForSale(token, "7", "15"))
                .extracting(response -> response.id()).containsExactly(20L);
    }

    private Sale sale() {
        SaleDraft draft = SaleDraft.create(7L, 42L);
        draft.replace(null, null, null, 0, 25000, 25000, PaymentMethod.CASH);
        Sale sale = Sale.fromPaidDraft(draft, 25000L);
        ReflectionTestUtils.setField(sale, "id", 15L);
        return sale;
    }
}
