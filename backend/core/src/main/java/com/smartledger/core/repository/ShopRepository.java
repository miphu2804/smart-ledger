package com.smartledger.core.repository;

import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ShopStatus;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ShopRepository extends JpaRepository<Shop, Long> {

    List<Shop> findAllByOwnerIdAndStatusNotOrderByIdAsc(Long ownerId, ShopStatus status);

    Optional<Shop> findByIdAndOwnerId(Long id, Long ownerId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Shop s where s.id = :id")
    Optional<Shop> findLockedById(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Shop s where s.id = :id and s.ownerId = :ownerId")
    Optional<Shop> findLockedByIdAndOwnerId(@Param("id") Long id, @Param("ownerId") Long ownerId);
}
