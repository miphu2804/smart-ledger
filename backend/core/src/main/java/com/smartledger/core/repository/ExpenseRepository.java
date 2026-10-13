package com.smartledger.core.repository;

import com.smartledger.core.entity.Expense;
import com.smartledger.core.enums.ExpenseStatus;
import jakarta.persistence.LockModeType;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExpenseRepository extends JpaRepository<Expense, Long>, JpaSpecificationExecutor<Expense> {
    List<Expense> findAllByShopIdAndStatusOrderByExpenseAtDescIdDesc(Long shopId, ExpenseStatus status);

    List<Expense> findAllByShopIdAndStatusAndExpenseAtGreaterThanEqualAndExpenseAtLessThanOrderByExpenseAtDescIdDesc(
            Long shopId, ExpenseStatus status, OffsetDateTime from, OffsetDateTime to);

    Optional<Expense> findByIdAndShopIdAndStatus(Long id, Long shopId, ExpenseStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from Expense e where e.id = :id and e.shopId = :shopId and e.status = :status")
    Optional<Expense> findLockedByIdAndShopIdAndStatus(@Param("id") Long id,
            @Param("shopId") Long shopId, @Param("status") ExpenseStatus status);
}
