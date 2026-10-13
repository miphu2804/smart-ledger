package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.smartledger.core.dto.request.CustomerWriteRequest;
import com.smartledger.core.entity.Customer;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.CustomerRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.CustomerServiceImpl;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

class CustomerLifecycleServiceTest {
    private final ShopService shops = mock(ShopService.class);
    private final CustomerRepository customers = mock(CustomerRepository.class);
    private final EntityManager entityManager = mock(EntityManager.class);
    private final CustomerService service = new CustomerServiceImpl(shops, customers, entityManager);
    private final VerifiedFirebaseToken token = new VerifiedFirebaseToken("test", null, false, null, null, null);

    @BeforeEach
    void authorize() {
        Shop shop = Shop.create(42L, "Shop", null, null, null);
        ReflectionTestUtils.setField(shop, "id", 7L);
        when(shops.requireOwnedActiveShop(token, "7")).thenReturn(shop);
    }

    @Test
    void replacesProfileAfterLockAndRefresh() {
        Customer customer = customer();
        when(customers.findLockedByIdAndShopId(9L, 7L)).thenReturn(Optional.of(customer));
        var response = service.replace(token, "7", "9", new CustomerWriteRequest("  New  ", "090 123-4567"));
        assertThat(response.name()).isEqualTo("New");
        assertThat(response.phone()).isEqualTo("0901234567");
        assertThat(response.shopId()).isEqualTo(7L);
        assertThat(customer.getStatus()).isEqualTo(CatalogStatus.ACTIVE);
        var order = inOrder(customers, entityManager);
        order.verify(customers).findLockedByIdAndShopId(9L, 7L);
        order.verify(entityManager).refresh(customer, LockModeType.PESSIMISTIC_WRITE);
        verify(customers, never()).findByIdAndShopIdAndStatus(any(), any(), any());
    }

    @Test
    void archivesAfterLockAndRefreshWithoutDeletingHistory() {
        Customer customer = customer();
        when(customers.findLockedByIdAndShopId(9L, 7L)).thenReturn(Optional.of(customer));
        service.archive(token, "7", "9");
        assertThat(customer.getStatus()).isEqualTo(CatalogStatus.ARCHIVED);
        assertThat(customer.getArchivedAt()).isNotNull();
        assertThat(customer.getArchivedByUserId()).isEqualTo(42L);
        var order = inOrder(customers, entityManager);
        order.verify(customers).findLockedByIdAndShopId(9L, 7L);
        order.verify(entityManager).refresh(customer, LockModeType.PESSIMISTIC_WRITE);
        verify(customers, never()).delete(any(Customer.class));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void rejectsArchivedStatusDiscoveredByRefresh(boolean archive) {
        Customer customer = customer();
        when(customers.findLockedByIdAndShopId(9L, 7L)).thenReturn(Optional.of(customer));
        doAnswer(invocation -> { customer.archive(42L); return null; }).when(entityManager)
                .refresh(customer, LockModeType.PESSIMISTIC_WRITE);
        assertThatThrownBy(() -> write(archive, "9")).isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.CUSTOMER_NOT_FOUND));
        assertThat(customer.getName()).isEqualTo("Old");
        assertThat(customer.getNormalizedPhone()).isEqualTo("0900");
        assertThat(customer.getArchivedAt()).isNotNull();
        assertThat(customer.getArchivedByUserId()).isEqualTo(42L);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void missingOrForeignCustomerCannotBeWritten(boolean archive) {
        assertThatThrownBy(() -> write(archive, "9")).isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.CUSTOMER_NOT_FOUND));
        verify(customers).findLockedByIdAndShopId(9L, 7L);
        verifyNoInteractions(entityManager);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void invalidIdDoesNotQueryOrLock(boolean archive) {
        assertThatThrownBy(() -> write(archive, "abc")).isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.INVALID_CUSTOMER_ID));
        verifyNoInteractions(customers, entityManager);
    }

    @Test
    void detailRemainsAnUnlockedRead() {
        when(customers.findByIdAndShopIdAndStatus(9L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(customer()));
        assertThat(service.getById(token, "7", "9").name()).isEqualTo("Old");
        verify(customers, never()).findLockedByIdAndShopId(any(), any());
        verifyNoInteractions(entityManager);
    }

    private void write(boolean archive, String id) {
        if (archive) service.archive(token, "7", id);
        else service.replace(token, "7", id, new CustomerWriteRequest("New", null));
    }

    private Customer customer() {
        Customer customer = Customer.create(7L, "Old", "0900");
        ReflectionTestUtils.setField(customer, "id", 9L);
        return customer;
    }
}
