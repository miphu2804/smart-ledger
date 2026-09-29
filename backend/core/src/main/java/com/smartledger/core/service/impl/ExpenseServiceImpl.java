package com.smartledger.core.service.impl;

import com.smartledger.core.dto.request.ExpensePatchRequest;
import com.smartledger.core.dto.request.ExpenseWriteRequest;
import com.smartledger.core.dto.response.ExpenseResponse;
import com.smartledger.core.entity.Expense;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.ExpenseStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.ExpenseRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ExpenseService;
import com.smartledger.core.service.ShopService;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class ExpenseServiceImpl implements ExpenseService {
    private final ShopService shopService;
    private final ExpenseRepository expenseRepository;

    public ExpenseServiceImpl(ShopService shopService, ExpenseRepository expenseRepository) {
        this.shopService = shopService;
        this.expenseRepository = expenseRepository;
    }

    @Override
    @Transactional
    public ExpenseResponse create(VerifiedFirebaseToken token, String shopId, ExpenseWriteRequest request) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        Expense expense = Expense.manual(shop.getId(), shop.getOwnerId(), normalize(request.category()),
                request.description().trim(), request.amountVnd(), request.paymentMethod(),
                utcOrNow(request.expenseAt()));
        return toResponse(expenseRepository.save(expense));
    }

    @Override
    @Transactional(readOnly = true)
    public List<ExpenseResponse> list(VerifiedFirebaseToken token, String shopId, String period) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        List<Expense> expenses;
        if (!StringUtils.hasText(period)) {
            expenses = expenseRepository.findAllByShopIdAndStatusOrderByExpenseAtDescIdDesc(
                    shop.getId(), ExpenseStatus.ACTIVE);
        } else {
            ReportWindow window = ReportWindow.of(period, OffsetDateTime.now(ZoneOffset.UTC));
            expenses = expenseRepository
                    .findAllByShopIdAndStatusAndExpenseAtGreaterThanEqualAndExpenseAtLessThanOrderByExpenseAtDescIdDesc(
                            shop.getId(), ExpenseStatus.ACTIVE, window.fromInclusive(), window.toExclusive());
        }
        return expenses.stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public ExpenseResponse getById(VerifiedFirebaseToken token, String shopId, String expenseId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        return toResponse(requireActiveExpense(shop.getId(), expenseId));
    }

    @Override
    @Transactional
    public ExpenseResponse patch(VerifiedFirebaseToken token, String shopId, String expenseId,
            ExpensePatchRequest request) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        Expense expense = requireActiveExpense(shop.getId(), expenseId);
        if (request.getProvidedFields().isEmpty()) {
            throw new BusinessException(ErrorCode.EXPENSE_UPDATE_REQUIRED);
        }
        expense.update(
                request.hasField("category") ? normalize(request.getCategory()) : expense.getCategory(),
                request.hasField("description") ? request.getDescription().trim() : expense.getDescription(),
                request.hasField("amountVnd") ? request.getAmountVnd() : expense.getAmountVnd(),
                request.hasField("paymentMethod") ? request.getPaymentMethod() : expense.getPaymentMethod(),
                request.hasField("expenseAt") ? utcOrNow(request.getExpenseAt()) : expense.getExpenseAt());
        return toResponse(expense);
    }

    @Override
    @Transactional
    public void archive(VerifiedFirebaseToken token, String shopId, String expenseId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        requireActiveExpense(shop.getId(), expenseId).archive(shop.getOwnerId());
    }

    private Expense requireActiveExpense(Long shopId, String expenseId) {
        Long id = BusinessIdParser.parse(expenseId, "expenseId", ErrorCode.INVALID_EXPENSE_ID);
        return expenseRepository.findByIdAndShopIdAndStatus(id, shopId, ExpenseStatus.ACTIVE)
                .orElseThrow(() -> new BusinessException(ErrorCode.EXPENSE_NOT_FOUND));
    }

    private String normalize(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private OffsetDateTime utcOrNow(OffsetDateTime value) {
        return value == null ? OffsetDateTime.now(ZoneOffset.UTC) : value.withOffsetSameInstant(ZoneOffset.UTC);
    }

    private ExpenseResponse toResponse(Expense expense) {
        return new ExpenseResponse(expense.getId(), expense.getShopId(), expense.getCategory(),
                expense.getDescription(), expense.getAmountVnd(), expense.getPaymentMethod(),
                expense.getExpenseAt(), expense.getStatus(), expense.getCreatedAt(), expense.getUpdatedAt());
    }
}
