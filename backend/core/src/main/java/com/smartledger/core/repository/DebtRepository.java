package com.smartledger.core.repository;

import com.smartledger.core.entity.Debt;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DebtRepository extends JpaRepository<Debt, Long>, JpaSpecificationExecutor<Debt> {
    @Query("select d from Debt d, Sale s where d.saleId = s.id and s.shopId = :shopId order by d.id desc")
    List<Debt> findAllByShopIdOrderByIdDesc(@Param("shopId") Long shopId);

    @Query("select d from Debt d, Sale s where d.saleId = s.id and d.id = :id and s.shopId = :shopId")
    Optional<Debt> findByIdAndShopId(@Param("id") Long id, @Param("shopId") Long shopId);

    @Query("select d.saleId from Debt d, Sale s where d.saleId = s.id and d.id = :id and s.shopId = :shopId")
    Optional<Long> findSaleIdByIdAndShopId(@Param("id") Long id, @Param("shopId") Long shopId);

    @Query("select d from Debt d, Sale s where d.saleId = s.id and d.saleId = :saleId and s.shopId = :shopId")
    Optional<Debt> findBySaleIdAndShopId(@Param("saleId") Long saleId, @Param("shopId") Long shopId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from Debt d, Sale s where d.saleId = s.id and d.saleId = :saleId and s.shopId = :shopId")
    Optional<Debt> findLockedBySaleIdAndShopId(@Param("saleId") Long saleId, @Param("shopId") Long shopId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from Debt d, Sale s where d.saleId = s.id and d.id = :id and s.shopId = :shopId")
    Optional<Debt> findLockedByIdAndShopId(@Param("id") Long id, @Param("shopId") Long shopId);
}
