package com.smartledger.core.repository;

import com.smartledger.core.entity.Shop;
import com.smartledger.core.entity.ShopStatus;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ShopRepository extends JpaRepository<Shop, Long> {

    List<Shop> findAllByOwnerIdAndStatusOrderByIdAsc(Long ownerId, ShopStatus status);
}
