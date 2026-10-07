package com.smartledger.core.entity;

import com.smartledger.core.enums.CatalogStatus;
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
import java.time.ZoneOffset;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.util.StringUtils;

@Entity
@Table(name = "customers")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Customer {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "shop_id", nullable = false)
    private Long shopId;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(name = "normalized_phone", length = 30)
    private String normalizedPhone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CatalogStatus status;

    @Column(name = "archived_at")
    private OffsetDateTime archivedAt;

    @Column(name = "archived_by_user_id")
    private Long archivedByUserId;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public static Customer create(Long shopId, String name, String normalizedPhone) {
        Customer customer = new Customer();
        customer.shopId = shopId;
        customer.name = name;
        customer.normalizedPhone = normalizedPhone;
        customer.status = CatalogStatus.ACTIVE;
        return customer;
    }

    public static String normalizePhone(String phone) {
        if (!StringUtils.hasText(phone)) {
            return null;
        }
        String normalized = phone.replaceAll("[\\s().-]", "");
        return StringUtils.hasText(normalized) ? normalized : null;
    }

    public void update(String name, String normalizedPhone) {
        this.name = name;
        this.normalizedPhone = normalizedPhone;
    }

    public void archive(Long userId) {
        status = CatalogStatus.ARCHIVED;
        archivedAt = OffsetDateTime.now(ZoneOffset.UTC);
        archivedByUserId = userId;
    }

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }
}
