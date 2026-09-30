package com.smartledger.core.entity;

import com.smartledger.core.enums.ExpenseStatus;
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
@Table(name = "expenses")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Expense {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "shop_id", nullable = false)
    private Long shopId;

    @Column(name = "created_by_user_id", nullable = false)
    private Long createdByUserId;

    @Column(length = 150)
    private String category;

    @Column(length = 500)
    private String description;

    @Column(name = "amount_vnd", nullable = false)
    private Long amountVnd;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", length = 20)
    private PaymentMethod paymentMethod;

    @Column(name = "expense_at", nullable = false)
    private OffsetDateTime expenseAt;

    @Column(name = "source_ai_request_id")
    private Long sourceAiRequestId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ExpenseStatus status;

    @Column(name = "archived_at")
    private OffsetDateTime archivedAt;

    @Column(name = "archived_by_user_id")
    private Long archivedByUserId;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public static Expense manual(Long shopId, Long userId, String category, String description,
            long amountVnd, PaymentMethod paymentMethod, OffsetDateTime expenseAt) {
        Expense expense = new Expense();
        expense.shopId = shopId;
        expense.createdByUserId = userId;
        expense.status = ExpenseStatus.ACTIVE;
        expense.update(category, description, amountVnd, paymentMethod, expenseAt);
        return expense;
    }

    public void update(String category, String description, long amountVnd,
            PaymentMethod paymentMethod, OffsetDateTime expenseAt) {
        this.category = category;
        this.description = description;
        this.amountVnd = amountVnd;
        this.paymentMethod = paymentMethod;
        this.expenseAt = expenseAt;
    }

    public void archive(Long userId) {
        status = ExpenseStatus.ARCHIVED;
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
