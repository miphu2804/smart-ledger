package com.smartledger.core.repository;

import com.smartledger.core.entity.SaleItem;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SaleItemRepository extends JpaRepository<SaleItem, Long> {
    List<SaleItem> findAllBySaleIdOrderByIdAsc(Long saleId);
}
