package com.smartledger.core.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.enums.DebtStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class DebtVoidTest {
    @Test
    void preservesPreviouslySettledDebtWhenSaleIsVoided() {
        Debt debt = Debt.open(15L, 9L, 60_000L);
        debt.repay(60_000L);
        var settledAt = debt.getSettledAt();

        debt.voidRemaining();

        assertThat(debt.getStatus()).isEqualTo(DebtStatus.SETTLED);
        assertThat(debt.getOutstandingVnd()).isZero();
        assertThat(debt.getSettledAt()).isEqualTo(settledAt);
        assertThat(debt.getVoidedAt()).isNull();
        assertThat(debt.getCancelledVnd()).isNull();
    }

    @Test
    void cancelsOnlyTheRemainingBalanceAndKeepsAuditWhenCalledAgain() {
        Debt debt = Debt.open(15L, 9L, 60_000L);
        debt.repay(20_000L);

        debt.voidRemaining();

        assertThat(debt.getStatus()).isEqualTo(DebtStatus.VOIDED);
        assertThat(debt.getOriginalVnd()).isEqualTo(60_000L);
        assertThat(debt.getOutstandingVnd()).isZero();
        assertThat(debt.getCancelledVnd()).isEqualTo(40_000L);
        assertThat(debt.getVoidedAt()).isNotNull();
        assertThat(debt.getVoidedAt().getOffset()).isEqualTo(ZoneOffset.UTC);
        assertThat(debt.getSettledAt()).isNull();
        var voidedAt = debt.getVoidedAt();

        debt.voidRemaining();

        assertThat(debt.getVoidedAt()).isEqualTo(voidedAt);
        assertThat(debt.getCancelledVnd()).isEqualTo(40_000L);
    }

    @Test
    void cancelsUnpaidDebtWithoutMarkingItSettled() {
        Debt debt = Debt.open(15L, 9L, 100_000L);

        debt.voidRemaining();

        assertThat(debt.getStatus()).isEqualTo(DebtStatus.VOIDED);
        assertThat(debt.getCancelledVnd()).isEqualTo(100_000L);
        assertThat(debt.getOutstandingVnd()).isZero();
        assertThat(debt.getSettledAt()).isNull();
    }

    @Test
    void rejectsRepaymentOfVoidedDebtWithoutChangingAudit() {
        Debt debt = Debt.open(15L, 9L, 60_000L);
        debt.voidRemaining();
        var voidedAt = debt.getVoidedAt();

        assertThatThrownBy(() -> debt.repay(1L))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DEBT_ALREADY_SETTLED));
        assertThat(debt.getOutstandingVnd()).isZero();
        assertThat(debt.getCancelledVnd()).isEqualTo(60_000L);
        assertThat(debt.getVoidedAt()).isEqualTo(voidedAt);
    }
}
