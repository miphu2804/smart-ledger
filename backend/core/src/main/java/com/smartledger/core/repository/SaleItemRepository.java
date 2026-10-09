package com.smartledger.core.repository;

import com.smartledger.core.entity.SaleItem;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SaleItemRepository extends JpaRepository<SaleItem, Long> {
    @Query("select i from SaleItem i join Sale s on s.id = i.saleId "
            + "where s.shopId = :shopId order by i.saleId, i.id")
    List<SaleItem> findAllByShopId(@Param("shopId") Long shopId);

    List<SaleItem> findAllBySaleIdOrderByIdAsc(Long saleId);
}
