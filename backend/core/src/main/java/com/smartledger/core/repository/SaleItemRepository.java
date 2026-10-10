package com.smartledger.core.repository;

import com.smartledger.core.entity.SaleItem;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SaleItemRepository extends JpaRepository<SaleItem, Long> {
    /** Loads only items belonging to the selected page, with a defensive tenant predicate. */
    @Query("select i from SaleItem i join Sale p on p.id = i.saleId "
            + "where p.shopId = :shopId and p.id in :parentIds order by i.saleId, i.id")
    List<SaleItem> findAllForPage(@Param("shopId") Long shopId,
            @Param("parentIds") java.util.Collection<Long> parentIds);

    /**
     * Loads all historical items for this shop through their parent sale, ordered by sale ID then item ID.
     * This unpaginated batch supports list responses without per-sale item queries; no Product status filter applies.
     */
    @Query("select i from SaleItem i join Sale s on s.id = i.saleId "
            + "where s.shopId = :shopId order by i.saleId, i.id")
    List<SaleItem> findAllByShopId(@Param("shopId") Long shopId);

    List<SaleItem> findAllBySaleIdOrderByIdAsc(Long saleId);
}
