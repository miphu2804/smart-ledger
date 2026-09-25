package com.smartledger.core.repository;

import com.smartledger.core.entity.Payment;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentRepository extends JpaRepository<Payment, Long> {
    List<Payment> findAllBySaleIdOrderByIdAsc(Long saleId);

    Optional<Payment> findByIdAndSaleId(Long id, Long saleId);
}
