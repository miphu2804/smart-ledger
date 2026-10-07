package com.smartledger.core.repository;

import com.smartledger.core.entity.SaleDraft;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SaleDraftRepository extends JpaRepository<SaleDraft, Long> {
    List<SaleDraft> findAllByShopIdOrderByIdDesc(Long shopId);

    Optional<SaleDraft> findByIdAndShopId(Long id, Long shopId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from SaleDraft d where d.id = :id and d.shopId = :shopId")
    Optional<SaleDraft> findLockedByIdAndShopId(@Param("id") Long id, @Param("shopId") Long shopId);
}
