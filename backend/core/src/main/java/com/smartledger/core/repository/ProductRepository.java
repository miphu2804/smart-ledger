package com.smartledger.core.repository;

import com.smartledger.core.entity.Product;
import com.smartledger.core.enums.CatalogStatus;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<Product, Long> {
    List<Product> findAllByShopIdAndStatusOrderByIdAsc(Long shopId, CatalogStatus status);

    Optional<Product> findByIdAndShopIdAndStatus(Long id, Long shopId, CatalogStatus status);

    /**
     * Reads the matching catalog group without locking or guaranteeing result order.
     * Callers skip empty groups and validate missing IDs in request order, not by result count.
     */
    List<Product> findAllByIdInAndShopIdAndStatus(Collection<Long> ids, Long shopId, CatalogStatus status);

    boolean existsByShopIdAndBarcode(Long shopId, String barcode);

    boolean existsByShopIdAndBarcodeAndIdNot(Long shopId, String barcode, Long id);

    boolean existsByShopIdAndCategoryIdAndStatus(Long shopId, Long categoryId, CatalogStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Product p where p.id = :id and p.shopId = :shopId and p.status = :status")
    Optional<Product> findLockedByIdAndShopIdAndStatus(@Param("id") Long id,
            @Param("shopId") Long shopId, @Param("status") CatalogStatus status);

    /**
     * Locks matching rows in ascending ID order within the caller's transaction.
     * Confirm passes ACTIVE; missing, foreign or wrong-status IDs are omitted, so the
     * caller must validate each item rather than assume every requested ID was returned.
     * Callers skip this query for empty ID groups.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Product p where p.id in :ids and p.shopId = :shopId "
            + "and p.status = :status order by p.id asc")
    List<Product> findAllLockedByIdInAndShopIdAndStatus(@Param("ids") List<Long> ids,
            @Param("shopId") Long shopId, @Param("status") CatalogStatus status);

    /**
     * Locks shop-scoped rows in ascending ID order, including archived products for void restock.
     * The caller needs an active transaction, skips empty ID groups and checks for missing rows.
     * Void acquires these locks after the sale and its debt, when present.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Product p where p.id in :ids and p.shopId = :shopId order by p.id asc")
    List<Product> findAllLockedByIdInAndShopId(@Param("ids") List<Long> ids, @Param("shopId") Long shopId);
}
