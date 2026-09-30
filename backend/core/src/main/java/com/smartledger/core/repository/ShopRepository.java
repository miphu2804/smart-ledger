package com.smartledger.core.repository;

import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ShopStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ShopRepository extends JpaRepository<Shop, Long> {

    List<Shop> findAllByOwnerIdAndStatusNotOrderByIdAsc(Long ownerId, ShopStatus status);

    Optional<Shop> findByIdAndOwnerId(Long id, Long ownerId);
}
