package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smartledger.core.entity.Payment;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.SaleDraft;
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
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
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
        when(saleRepository.findAllByShopIdOrderByIdDesc(7L)).thenReturn(List.of(sale));
        when(saleItemRepository.findAllBySaleIdOrderByIdAsc(15L)).thenReturn(List.of());

        assertThat(saleService.list(token, "7")).extracting(response -> response.id()).containsExactly(15L);
        verify(saleRepository).findAllByShopIdOrderByIdDesc(7L);
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
        draft.replace(null, null, 0, 25000, 25000, PaymentMethod.CASH);
        Sale sale = Sale.fromPaidDraft(draft, 25000L);
        ReflectionTestUtils.setField(sale, "id", 15L);
        return sale;
    }
}
