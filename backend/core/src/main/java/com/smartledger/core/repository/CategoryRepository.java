package com.smartledger.core.repository;

import com.smartledger.core.entity.Category;
import com.smartledger.core.enums.CatalogStatus;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CategoryRepository extends JpaRepository<Category, Long> {
    boolean existsByIdAndShopIdAndStatus(Long id, Long shopId, CatalogStatus status);

    Optional<Category> findByIdAndShopIdAndStatus(Long id, Long shopId, CatalogStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Category c where c.id = :id and c.shopId = :shopId")
    Optional<Category> findLockedByIdAndShopId(@Param("id") Long id, @Param("shopId") Long shopId);

    List<Category> findAllByShopIdAndStatusOrderByIdAsc(Long shopId, CatalogStatus status);
}
