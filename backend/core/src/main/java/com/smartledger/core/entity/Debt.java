package com.smartledger.core.entity;

import com.smartledger.core.enums.DebtStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
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
@Table(name = "debts")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Debt {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sale_id", nullable = false, unique = true)
    private Long saleId;

    @Column(name = "customer_id", nullable = false)
    private Long customerId;

    @Column(name = "original_vnd", nullable = false)
    private Long originalVnd;

    @Column(name = "outstanding_vnd", nullable = false)
    private Long outstandingVnd;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DebtStatus status;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "settled_at")
    private OffsetDateTime settledAt;

    public static Debt open(Long saleId, Long customerId, long outstandingVnd) {
        if (outstandingVnd <= 0) {
            throw new IllegalArgumentException("An open debt requires a positive balance");
        }
        Debt debt = new Debt();
        debt.saleId = saleId;
        debt.customerId = customerId;
        debt.originalVnd = outstandingVnd;
        debt.outstandingVnd = outstandingVnd;
        debt.status = DebtStatus.OPEN;
        return debt;
    }

    public void repay(long amountVnd) {
        if (status != DebtStatus.OPEN) {
            throw new BusinessException(ErrorCode.DEBT_ALREADY_SETTLED);
        }
        if (amountVnd <= 0 || amountVnd > outstandingVnd) {
            throw new BusinessException(ErrorCode.DEBT_PAYMENT_INVALID);
        }
        outstandingVnd -= amountVnd;
        if (outstandingVnd == 0) {
            status = DebtStatus.SETTLED;
            settledAt = OffsetDateTime.now(ZoneOffset.UTC);
        }
    }

    @PrePersist
    void onCreate() {
        createdAt = OffsetDateTime.now(ZoneOffset.UTC);
    }
}
