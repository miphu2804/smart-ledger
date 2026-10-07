package com.smartledger.core.repository;

import com.smartledger.core.entity.SaleDraftItem;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SaleDraftItemRepository extends JpaRepository<SaleDraftItem, Long> {
    List<SaleDraftItem> findAllByDraftIdOrderByIdAsc(Long draftId);

    void deleteAllByDraftId(Long draftId);
}
