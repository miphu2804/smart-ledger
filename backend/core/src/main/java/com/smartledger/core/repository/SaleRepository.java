package com.smartledger.core.repository;

import com.smartledger.core.entity.Sale;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SaleRepository extends JpaRepository<Sale, Long> {
    List<Sale> findAllByShopIdOrderByIdDesc(Long shopId);

    Optional<Sale> findByIdAndShopId(Long id, Long shopId);
}
