package com.smartledger.core.repository;

import com.smartledger.core.entity.SaleRefund;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SaleRefundRepository extends JpaRepository<SaleRefund, Long> {
    Optional<SaleRefund> findBySaleId(Long saleId);

    @Query("select r from SaleRefund r, Sale s where r.saleId = s.id and s.shopId = :shopId "
            + "and r.refundedAt >= :from and r.refundedAt < :to")
    List<SaleRefund> findRefundedByShopAndPeriod(@Param("shopId") Long shopId,
            @Param("from") OffsetDateTime from, @Param("to") OffsetDateTime to);
}
