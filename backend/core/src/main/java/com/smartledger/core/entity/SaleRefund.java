package com.smartledger.core.entity;

import com.smartledger.core.enums.PaymentMethod;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "sale_refunds", uniqueConstraints = @UniqueConstraint(name = "uq_sale_refunds_sale_id", columnNames = "sale_id"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SaleRefund {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sale_id", nullable = false)
    private Long saleId;

    @Column(name = "amount_vnd", nullable = false)
    private Long amountVnd;

    @Enumerated(EnumType.STRING)
    @Column(name = "refund_method", nullable = false, length = 20)
    private PaymentMethod refundMethod;

    @Column(name = "transfer_reference", length = 255)
    private String transferReference;

    @Column(name = "refunded_by_user_id", nullable = false)
    private Long refundedByUserId;

    @Column(name = "refunded_at", nullable = false)
    private OffsetDateTime refundedAt;

    public static SaleRefund record(Long saleId, long amountVnd, PaymentMethod method,
            String transferReference, Long userId) {
        if (amountVnd <= 0 || method == null) {
            throw new IllegalArgumentException("Refund requires a positive received amount and method");
        }
        SaleRefund refund = new SaleRefund();
        refund.saleId = saleId;
        refund.amountVnd = amountVnd;
        refund.refundMethod = method;
        refund.transferReference = transferReference;
        refund.refundedByUserId = userId;
        refund.refundedAt = OffsetDateTime.now(ZoneOffset.UTC);
        return refund;
    }

    @PrePersist
    void onCreate() {
        if (refundedAt == null) {
            refundedAt = OffsetDateTime.now(ZoneOffset.UTC);
        }
    }
}
