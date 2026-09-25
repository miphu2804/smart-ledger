package com.smartledger.core.entity;

import com.smartledger.core.enums.PaymentMethod;
import com.smartledger.core.enums.PaymentType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "payments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Payment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sale_id", nullable = false)
    private Long saleId;

    @Column(name = "debt_id")
    private Long debtId;

    @Column(name = "amount_vnd", nullable = false)
    private Long amountVnd;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", nullable = false, length = 20)
    private PaymentMethod paymentMethod;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PaymentType type;

    @Column(name = "transfer_reference", length = 255)
    private String transferReference;

    @Column(name = "received_by_user_id", nullable = false)
    private Long receivedByUserId;

    @Column(name = "received_at", nullable = false)
    private OffsetDateTime receivedAt;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public static Payment initial(Long saleId, long amountVnd, PaymentMethod method, Long userId) {
        Payment payment = new Payment();
        payment.saleId = saleId;
        payment.amountVnd = amountVnd;
        payment.paymentMethod = method;
        payment.type = PaymentType.INITIAL;
        payment.receivedByUserId = userId;
        payment.receivedAt = OffsetDateTime.now(ZoneOffset.UTC);
        return payment;
    }

    @PrePersist
    void onCreate() {
        createdAt = OffsetDateTime.now(ZoneOffset.UTC);
    }
}
