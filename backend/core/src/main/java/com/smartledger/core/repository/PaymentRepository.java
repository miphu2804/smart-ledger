package com.smartledger.core.repository;

import com.smartledger.core.entity.Payment;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentRepository extends JpaRepository<Payment, Long> {
    List<Payment> findAllBySaleIdOrderByIdAsc(Long saleId);

    Optional<Payment> findByIdAndSaleId(Long id, Long saleId);

    @Query("select p from Payment p, Sale s where p.saleId = s.id and s.shopId = :shopId "
            + "and p.receivedAt >= :from and p.receivedAt < :to")
    List<Payment> findReceivedByShopAndPeriod(@Param("shopId") Long shopId,
            @Param("from") OffsetDateTime from,
            @Param("to") OffsetDateTime to);
}
