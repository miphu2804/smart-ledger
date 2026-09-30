package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.smartledger.core.dto.request.CustomerWriteRequest;
import com.smartledger.core.dto.request.DebtRepaymentRequest;
import com.smartledger.core.entity.Customer;
import com.smartledger.core.entity.Debt;
import com.smartledger.core.entity.Payment;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.SaleDraft;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.DebtStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.PaymentMethod;
import com.smartledger.core.enums.PaymentStatus;
import com.smartledger.core.enums.PaymentType;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.CustomerRepository;
import com.smartledger.core.repository.DebtRepository;
import com.smartledger.core.repository.PaymentRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.CustomerServiceImpl;
import com.smartledger.core.service.impl.DebtServiceImpl;
import java.util.Optional;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

class CustomerDebtServiceTest {
    private final ShopService shopService = Mockito.mock(ShopService.class);
    private final CustomerRepository customerRepository = Mockito.mock(CustomerRepository.class);
    private final DebtRepository debtRepository = Mockito.mock(DebtRepository.class);
    private final SaleRepository saleRepository = Mockito.mock(SaleRepository.class);
    private final PaymentRepository paymentRepository = Mockito.mock(PaymentRepository.class);
    private final CustomerService customerService = new CustomerServiceImpl(shopService, customerRepository);
    private final DebtService debtService = new DebtServiceImpl(shopService, debtRepository,
            saleRepository, paymentRepository);
    private final VerifiedFirebaseToken token = new VerifiedFirebaseToken("uid", null, false, null, null, null);

    @BeforeEach
    void authorizeShop() {
        Shop shop = Shop.create(42L, "Shop", null, null, null);
        ReflectionTestUtils.setField(shop, "id", 7L);
        when(shopService.requireOwnedActiveShop(any(), eq("7"))).thenReturn(shop);
    }

    @Test
    void createsAndListsOnlyActiveCustomersOfSelectedShop() {
        when(customerRepository.save(any(Customer.class))).thenAnswer(invocation -> {
            Customer customer = invocation.getArgument(0);
            ReflectionTestUtils.setField(customer, "id", 9L);
            return customer;
        });

        var created = customerService.create(token, "7", new CustomerWriteRequest("  Khach An  ", "090 123-4567"));

        assertThat(created.id()).isEqualTo(9L);
        assertThat(created.name()).isEqualTo("Khach An");
        assertThat(created.phone()).isEqualTo("0901234567");
        when(customerRepository.findAllByShopIdAndStatusOrderByIdAsc(7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of());
        assertThat(customerService.list(token, "7")).isEmpty();
        verify(customerRepository).findAllByShopIdAndStatusOrderByIdAsc(7L, CatalogStatus.ACTIVE);
    }

    @Test
    void cannotReadCustomerFromAnotherShop() {
        assertThatThrownBy(() -> customerService.getById(token, "7", "9"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.CUSTOMER_NOT_FOUND));
        verify(customerRepository).findByIdAndShopIdAndStatus(9L, 7L, CatalogStatus.ACTIVE);
    }

    @Test
    void archivesCustomerInsteadOfDeletingIt() {
        Customer customer = Customer.create(7L, "Khach An", null);
        ReflectionTestUtils.setField(customer, "id", 9L);
        when(customerRepository.findByIdAndShopIdAndStatus(9L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(customer));

        customerService.archive(token, "7", "9");

        assertThat(customer.getStatus()).isEqualTo(CatalogStatus.ARCHIVED);
        assertThat(customer.getArchivedByUserId()).isEqualTo(42L);
        assertThat(customer.getArchivedAt()).isNotNull();
    }

    @Test
    void cannotReadDebtFromAnotherShop() {
        assertThatThrownBy(() -> debtService.getById(token, "7", "11"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DEBT_NOT_FOUND));
        verify(debtRepository).findByIdAndShopId(11L, 7L);
    }

    @Test
    void oneCustomerCanHaveSeparateDebtsForSeparateSales() {
        Debt first = Debt.open(15L, 9L, 20_000L);
        Debt second = Debt.open(16L, 9L, 30_000L);

        assertThat(first.getCustomerId()).isEqualTo(second.getCustomerId());
        assertThat(first.getSaleId()).isNotEqualTo(second.getSaleId());
        first.repay(5_000L);
        assertThat(first.getOutstandingVnd()).isEqualTo(15_000L);
        assertThat(second.getOutstandingVnd()).isEqualTo(30_000L);
    }

    @Test
    void partialThenFinalRepaymentUpdatesSaleAndKeepsPaymentHistory() {
        Debt debt = Debt.open(15L, 9L, 20_000L);
        ReflectionTestUtils.setField(debt, "id", 11L);
        Sale sale = unpaidSale();
        when(debtRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(debt));
        when(saleRepository.findByIdAndShopId(15L, 7L)).thenReturn(Optional.of(sale));
        when(paymentRepository.save(any(Payment.class))).thenAnswer(invocation -> {
            Payment payment = invocation.getArgument(0);
            ReflectionTestUtils.setField(payment, "id", 21L);
            return payment;
        });

        var partial = debtService.repay(token, "7", "11",
                new DebtRepaymentRequest(5_000L, PaymentMethod.CASH, null));
        assertThat(partial.debt().outstandingVnd()).isEqualTo(15_000L);
        assertThat(partial.debt().status()).isEqualTo(DebtStatus.OPEN);
        assertThat(partial.payment().type()).isEqualTo(PaymentType.DEBT_REPAYMENT);
        assertThat(sale.getPaidVnd()).isEqualTo(5_000L);
        assertThat(sale.getPaymentStatus()).isEqualTo(PaymentStatus.PARTIAL);

        var finalPayment = debtService.repay(token, "7", "11",
                new DebtRepaymentRequest(15_000L, PaymentMethod.CASH, null));
        assertThat(finalPayment.debt().outstandingVnd()).isZero();
        assertThat(finalPayment.debt().status()).isEqualTo(DebtStatus.SETTLED);
        assertThat(finalPayment.debt().settledAt()).isNotNull();
        assertThat(sale.getPaidVnd()).isEqualTo(20_000L);
        assertThat(sale.getPaymentStatus()).isEqualTo(PaymentStatus.PAID);
        Mockito.verify(paymentRepository, Mockito.times(2)).save(any(Payment.class));
    }

    @Test
    void overpaymentDoesNotCreatePaymentOrChangeBalance() {
        Debt debt = Debt.open(15L, 9L, 20_000L);
        when(debtRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(debt));
        when(saleRepository.findByIdAndShopId(15L, 7L)).thenReturn(Optional.of(unpaidSale()));

        assertThatThrownBy(() -> debtService.repay(token, "7", "11",
                new DebtRepaymentRequest(20_001L, PaymentMethod.CASH, null)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DEBT_PAYMENT_INVALID));
        assertThat(debt.getOutstandingVnd()).isEqualTo(20_000L);
        verifyNoInteractions(paymentRepository);
    }

    @Test
    void settledDebtRejectsAnotherRepayment() {
        Debt debt = Debt.open(15L, 9L, 20_000L);
        debt.repay(20_000L);
        when(debtRepository.findLockedByIdAndShopId(11L, 7L)).thenReturn(Optional.of(debt));
        when(saleRepository.findByIdAndShopId(15L, 7L)).thenReturn(Optional.of(unpaidSale()));

        assertThatThrownBy(() -> debtService.repay(token, "7", "11",
                new DebtRepaymentRequest(1L, PaymentMethod.CASH, null)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DEBT_ALREADY_SETTLED));
        verifyNoInteractions(paymentRepository);
    }

    private Sale unpaidSale() {
        SaleDraft draft = SaleDraft.create(7L, 42L);
        draft.replace(null, "Khach An", null, 0, 20_000, 0, null);
        Customer customer = Customer.create(7L, "Khach An", null);
        ReflectionTestUtils.setField(customer, "id", 9L);
        Sale sale = Sale.fromDraft(draft, 20_000L, customer);
        ReflectionTestUtils.setField(sale, "id", 15L);
        return sale;
    }
}
