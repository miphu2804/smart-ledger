package com.smartledger.core.repository;

import com.smartledger.core.entity.Customer;
import com.smartledger.core.enums.CatalogStatus;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CustomerRepository extends JpaRepository<Customer, Long>, JpaSpecificationExecutor<Customer> {
    List<Customer> findAllByShopIdAndStatusOrderByIdAsc(Long shopId, CatalogStatus status);

    Optional<Customer> findByIdAndShopIdAndStatus(Long id, Long shopId, CatalogStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Customer c where c.id = :id and c.shopId = :shopId")
    Optional<Customer> findLockedByIdAndShopId(@Param("id") Long id, @Param("shopId") Long shopId);
}
