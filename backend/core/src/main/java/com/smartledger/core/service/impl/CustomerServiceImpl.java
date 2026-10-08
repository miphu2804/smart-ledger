package com.smartledger.core.service.impl;

import com.smartledger.core.dto.request.CustomerWriteRequest;
import com.smartledger.core.dto.response.CustomerResponse;
import com.smartledger.core.entity.Customer;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.CustomerRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.CustomerService;
import com.smartledger.core.service.ShopService;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CustomerServiceImpl implements CustomerService {
    private final ShopService shopService;
    private final CustomerRepository customerRepository;

    public CustomerServiceImpl(ShopService shopService, CustomerRepository customerRepository) {
        this.shopService = shopService;
        this.customerRepository = customerRepository;
    }

    @Override
    @Transactional
    public CustomerResponse create(VerifiedFirebaseToken token, String shopId, CustomerWriteRequest request) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        Customer customer = Customer.create(shop.getId(), request.name().trim(), Customer.normalizePhone(request.phone()));
        return toResponse(customerRepository.save(customer));
    }

    @Override
    @Transactional(readOnly = true)
    public List<CustomerResponse> list(VerifiedFirebaseToken token, String shopId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        return customerRepository.findAllByShopIdAndStatusOrderByIdAsc(shop.getId(), CatalogStatus.ACTIVE)
                .stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public CustomerResponse getById(VerifiedFirebaseToken token, String shopId, String customerId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        return toResponse(requireActiveCustomer(shop.getId(), customerId));
    }

    @Override
    @Transactional
    public CustomerResponse replace(VerifiedFirebaseToken token, String shopId, String customerId,
            CustomerWriteRequest request) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        Customer customer = requireActiveCustomer(shop.getId(), customerId);
        customer.update(request.name().trim(), Customer.normalizePhone(request.phone()));
        return toResponse(customer);
    }

    @Override
    @Transactional
    public void archive(VerifiedFirebaseToken token, String shopId, String customerId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        requireActiveCustomer(shop.getId(), customerId).archive(shop.getOwnerId());
    }

    private Customer requireActiveCustomer(Long shopId, String customerId) {
        Long id = BusinessIdParser.parse(customerId, "customerId", ErrorCode.INVALID_CUSTOMER_ID);
        return customerRepository.findByIdAndShopIdAndStatus(id, shopId, CatalogStatus.ACTIVE)
                .orElseThrow(() -> new BusinessException(ErrorCode.CUSTOMER_NOT_FOUND));
    }

    private CustomerResponse toResponse(Customer customer) {
        return new CustomerResponse(customer.getId(), customer.getShopId(), customer.getName(),
                customer.getNormalizedPhone(), customer.getStatus(),
                customer.getCreatedAt(), customer.getUpdatedAt());
    }
}
