package com.smartledger.core.entity;

import com.smartledger.core.enums.ShopStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "shops")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Shop {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(nullable = false, length = 100)
    private String industry;

    @Column(length = 30)
    private String phone;

    @Column(length = 500)
    private String address;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ShopStatus status;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "archived_at")
    private OffsetDateTime archivedAt;

    @Column(name = "inactive_reason", length = 500)
    private String inactiveReason;

    @Column(name = "archived_reason", length = 500)
    private String archivedReason;

    public static Shop create(Long ownerId, String name, String industry, String phone, String address) {
        Shop shop = new Shop();
        shop.ownerId = ownerId;
        shop.name = name;
        shop.industry = industry;
        shop.phone = phone;
        shop.address = address;
        shop.status = ShopStatus.ACTIVE;
        return shop;
    }

    public void update(String name, String industry, String phone, String address) {
        this.name = name;
        this.industry = industry;
        this.phone = phone;
        this.address = address;
    }

    public void archive(String reason) {
        status = ShopStatus.ARCHIVED;
        archivedAt = OffsetDateTime.now();
        archivedReason = reason;
        inactiveReason = null;
    }

    public void deactivate(String reason) {
        status = ShopStatus.INACTIVE;
        inactiveReason = reason;
    }

    public void activate() {
        status = ShopStatus.ACTIVE;
        inactiveReason = null;
    }

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }

}
