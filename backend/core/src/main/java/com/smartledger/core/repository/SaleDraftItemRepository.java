package com.smartledger.core.repository;

import com.smartledger.core.entity.SaleDraftItem;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SaleDraftItemRepository extends JpaRepository<SaleDraftItem, Long> {
    /**
     * Loads items through shop-scoped parent drafts, ordered by draft ID then item ID.
     * The unpaginated batch includes all draft statuses; the service determines displayed expiry.
     */
    @Query("select i from SaleDraftItem i join SaleDraft d on d.id = i.draftId "
            + "where d.shopId = :shopId order by i.draftId, i.id")
    List<SaleDraftItem> findAllByShopId(@Param("shopId") Long shopId);

    List<SaleDraftItem> findAllByDraftIdOrderByIdAsc(Long draftId);

    void deleteAllByDraftId(Long draftId);
}
