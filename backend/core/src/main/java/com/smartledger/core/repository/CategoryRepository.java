package com.smartledger.core.repository;

import com.smartledger.core.entity.Category;
import com.smartledger.core.enums.CatalogStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryRepository extends JpaRepository<Category, Long> {
    boolean existsByIdAndShopIdAndStatus(Long id, Long shopId, CatalogStatus status);

    Optional<Category> findByIdAndShopIdAndStatus(Long id, Long shopId, CatalogStatus status);

    List<Category> findAllByShopIdAndStatusOrderByIdAsc(Long shopId, CatalogStatus status);
}
