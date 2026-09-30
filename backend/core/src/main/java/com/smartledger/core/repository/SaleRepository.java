package com.smartledger.core.repository;

import com.smartledger.core.entity.Sale;
import com.smartledger.core.enums.SaleStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SaleRepository extends JpaRepository<Sale, Long> {
    List<Sale> findAllByShopIdOrderByIdDesc(Long shopId);

    Optional<Sale> findByIdAndShopId(Long id, Long shopId);

    List<Sale> findAllByShopIdAndSaleStatusAndSoldAtGreaterThanEqualAndSoldAtLessThan(
            Long shopId, SaleStatus status, OffsetDateTime from, OffsetDateTime to);
}
