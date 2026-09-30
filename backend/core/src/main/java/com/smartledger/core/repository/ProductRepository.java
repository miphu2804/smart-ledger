package com.smartledger.core.repository;

import com.smartledger.core.entity.Product;
import com.smartledger.core.enums.CatalogStatus;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<Product, Long> {
    List<Product> findAllByShopIdAndStatusOrderByIdAsc(Long shopId, CatalogStatus status);

    Optional<Product> findByIdAndShopIdAndStatus(Long id, Long shopId, CatalogStatus status);

    boolean existsByShopIdAndBarcode(Long shopId, String barcode);

    boolean existsByShopIdAndBarcodeAndIdNot(Long shopId, String barcode, Long id);

    boolean existsByShopIdAndCategoryIdAndStatus(Long shopId, Long categoryId, CatalogStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Product p where p.id = :id and p.shopId = :shopId and p.status = :status")
    Optional<Product> findLockedByIdAndShopIdAndStatus(@Param("id") Long id,
            @Param("shopId") Long shopId, @Param("status") CatalogStatus status);
}
