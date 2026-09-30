package com.smartledger.core.repository;

import com.smartledger.core.entity.Customer;
import com.smartledger.core.enums.CatalogStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CustomerRepository extends JpaRepository<Customer, Long> {
    List<Customer> findAllByShopIdAndStatusOrderByIdAsc(Long shopId, CatalogStatus status);

    Optional<Customer> findByIdAndShopIdAndStatus(Long id, Long shopId, CatalogStatus status);
}
