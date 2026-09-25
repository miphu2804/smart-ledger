package com.smartledger.core.entity;

import com.smartledger.core.enums.DraftSourceType;
import com.smartledger.core.enums.DraftStatus;
import com.smartledger.core.enums.PaymentMethod;
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

@Entity
@Table(name = "sale_drafts")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SaleDraft {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "shop_id", nullable = false)
    private Long shopId;

    @Column(name = "created_by_user_id", nullable = false)
    private Long createdByUserId;

    @Column(name = "customer_id")
    private Long customerId;

    @Column(name = "customer_name", length = 150)
    private String customerName;

    @Column(name = "customer_phone", length = 30)
    private String customerPhone;

    @Column(name = "discount_vnd", nullable = false)
    private Long discountVnd;

    @Column(name = "estimated_total_vnd", nullable = false)
    private Long estimatedTotalVnd;

    @Column(name = "initial_paid_vnd", nullable = false)
    private Long initialPaidVnd;

    @Enumerated(EnumType.STRING)
    @Column(name = "initial_payment_method", length = 20)
    private PaymentMethod initialPaymentMethod;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", nullable = false, length = 20)
    private DraftSourceType sourceType;

    @Column(name = "source_ai_request_id")
    private Long sourceAiRequestId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DraftStatus status;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "expired_at")
    private OffsetDateTime expiredAt;

    @Column(name = "confirmed_sale_id")
    private Long confirmedSaleId;

    @Column(name = "confirmed_at")
    private OffsetDateTime confirmedAt;

    @Column(name = "cancelled_at")
    private OffsetDateTime cancelledAt;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public static SaleDraft create(Long shopId, Long userId) {
        SaleDraft draft = new SaleDraft();
        draft.shopId = shopId;
        draft.createdByUserId = userId;
        draft.status = DraftStatus.DRAFT;
        draft.sourceType = DraftSourceType.MANUAL;
        draft.expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusMonths(1);
        return draft;
    }

    public void replace(String customerName, String customerPhone, long discountVnd,
            long estimatedTotalVnd, long initialPaidVnd, PaymentMethod paymentMethod) {
        this.customerName = customerName;
        this.customerPhone = customerPhone;
        this.discountVnd = discountVnd;
        this.estimatedTotalVnd = estimatedTotalVnd;
        this.initialPaidVnd = initialPaidVnd;
        this.initialPaymentMethod = paymentMethod;
    }

    public boolean isExpired() {
        return status == DraftStatus.EXPIRED
                || (status == DraftStatus.DRAFT && !OffsetDateTime.now(ZoneOffset.UTC).isBefore(expiresAt));
    }

    public void expire() {
        if (status == DraftStatus.DRAFT) {
            status = DraftStatus.EXPIRED;
            expiredAt = OffsetDateTime.now(ZoneOffset.UTC);
        }
    }

    public void cancel() {
        status = DraftStatus.CANCELLED;
        cancelledAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public void confirm(Long saleId) {
        status = DraftStatus.CONFIRMED;
        confirmedSaleId = saleId;
        confirmedAt = OffsetDateTime.now(ZoneOffset.UTC);
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
