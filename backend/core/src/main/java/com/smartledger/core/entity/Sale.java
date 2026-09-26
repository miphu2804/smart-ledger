package com.smartledger.core.entity;

import com.smartledger.core.enums.PaymentStatus;
import com.smartledger.core.enums.SaleStatus;
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
@Table(name = "sales")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Sale {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "shop_id", nullable = false)
    private Long shopId;

    @Column(name = "created_by_user_id", nullable = false)
    private Long createdByUserId;

    @Column(name = "customer_id")
    private Long customerId;

    @Column(name = "customer_name_snapshot", length = 150)
    private String customerNameSnapshot;

    @Column(name = "customer_phone_snapshot", length = 30)
    private String customerPhoneSnapshot;

    @Column(name = "subtotal_vnd", nullable = false)
    private Long subtotalVnd;

    @Column(name = "discount_vnd", nullable = false)
    private Long discountVnd;

    @Column(name = "total_vnd", nullable = false)
    private Long totalVnd;

    @Column(name = "paid_vnd", nullable = false)
    private Long paidVnd;

    @Enumerated(EnumType.STRING)
    @Column(name = "sale_status", nullable = false, length = 20)
    private SaleStatus saleStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_status", nullable = false, length = 20)
    private PaymentStatus paymentStatus;

    @Column(name = "sold_at", nullable = false)
    private OffsetDateTime soldAt;

    @Column(name = "voided_at")
    private OffsetDateTime voidedAt;

    @Column(name = "voided_by_user_id")
    private Long voidedByUserId;

    @Column(name = "void_reason", length = 500)
    private String voidReason;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public static Sale fromPaidDraft(SaleDraft draft, long subtotalVnd) {
        Sale sale = new Sale();
        sale.shopId = draft.getShopId();
        sale.createdByUserId = draft.getCreatedByUserId();
        sale.customerNameSnapshot = draft.getCustomerName();
        sale.customerPhoneSnapshot = draft.getCustomerPhone();
        sale.subtotalVnd = subtotalVnd;
        sale.discountVnd = draft.getDiscountVnd();
        sale.totalVnd = draft.getEstimatedTotalVnd();
        sale.paidVnd = draft.getInitialPaidVnd();
        sale.saleStatus = SaleStatus.CONFIRMED;
        sale.paymentStatus = PaymentStatus.PAID;
        sale.soldAt = OffsetDateTime.now(ZoneOffset.UTC);
        return sale;
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
