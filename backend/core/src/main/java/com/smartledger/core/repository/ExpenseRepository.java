package com.smartledger.core.repository;

import com.smartledger.core.entity.Expense;
import com.smartledger.core.enums.ExpenseStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExpenseRepository extends JpaRepository<Expense, Long> {
    List<Expense> findAllByShopIdAndStatusOrderByExpenseAtDescIdDesc(Long shopId, ExpenseStatus status);

    List<Expense> findAllByShopIdAndStatusAndExpenseAtGreaterThanEqualAndExpenseAtLessThanOrderByExpenseAtDescIdDesc(
            Long shopId, ExpenseStatus status, OffsetDateTime from, OffsetDateTime to);

    Optional<Expense> findByIdAndShopIdAndStatus(Long id, Long shopId, ExpenseStatus status);
}
