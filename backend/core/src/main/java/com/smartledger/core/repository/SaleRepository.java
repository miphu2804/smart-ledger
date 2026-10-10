package com.smartledger.core.repository;

import com.smartledger.core.entity.Sale;
import com.smartledger.core.enums.SaleStatus;
import jakarta.persistence.LockModeType;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SaleRepository extends JpaRepository<Sale, Long>, JpaSpecificationExecutor<Sale> {
    List<Sale> findAllByShopIdOrderByIdDesc(Long shopId);

    Optional<Sale> findByIdAndShopId(Long id, Long shopId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Sale s where s.id = :id and s.shopId = :shopId")
    Optional<Sale> findLockedByIdAndShopId(@Param("id") Long id, @Param("shopId") Long shopId);

    List<Sale> findAllByShopIdAndSaleStatusAndSoldAtGreaterThanEqualAndSoldAtLessThan(
            Long shopId, SaleStatus status, OffsetDateTime from, OffsetDateTime to);

    List<Sale> findAllByShopIdAndSoldAtGreaterThanEqualAndSoldAtLessThan(
            Long shopId, OffsetDateTime from, OffsetDateTime to);

    List<Sale> findAllByShopIdAndSaleStatusAndVoidedAtGreaterThanEqualAndVoidedAtLessThan(
            Long shopId, SaleStatus status, OffsetDateTime from, OffsetDateTime to);
}
