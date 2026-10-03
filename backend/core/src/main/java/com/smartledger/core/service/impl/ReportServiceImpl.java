package com.smartledger.core.service.impl;

import com.smartledger.core.dto.response.ReportSummaryResponse;
import com.smartledger.core.entity.Debt;
import com.smartledger.core.entity.Expense;
import com.smartledger.core.entity.Payment;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.entity.SaleRefund;
import com.smartledger.core.enums.ExpenseStatus;
import com.smartledger.core.enums.SaleStatus;
import com.smartledger.core.repository.DebtRepository;
import com.smartledger.core.repository.ExpenseRepository;
import com.smartledger.core.repository.PaymentRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.repository.SaleRefundRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ReportService;
import com.smartledger.core.service.ShopService;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReportServiceImpl implements ReportService {
    private final ShopService shopService;
    private final SaleRepository saleRepository;
    private final PaymentRepository paymentRepository;
    private final ExpenseRepository expenseRepository;
    private final DebtRepository debtRepository;
    private final SaleRefundRepository refundRepository;

    public ReportServiceImpl(ShopService shopService, SaleRepository saleRepository,
            PaymentRepository paymentRepository, ExpenseRepository expenseRepository,
            DebtRepository debtRepository, SaleRefundRepository refundRepository) {
        this.shopService = shopService;
        this.saleRepository = saleRepository;
        this.paymentRepository = paymentRepository;
        this.expenseRepository = expenseRepository;
        this.debtRepository = debtRepository;
        this.refundRepository = refundRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public ReportSummaryResponse summary(VerifiedFirebaseToken token, String shopId, String period) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        ReportWindow window = ReportWindow.of(period, OffsetDateTime.now(ZoneOffset.UTC));
        List<Sale> sales = saleRepository.findAllByShopIdAndSoldAtGreaterThanEqualAndSoldAtLessThan(
                shop.getId(), window.fromInclusive(), window.toExclusive());
        List<Sale> voidedSales = saleRepository
                .findAllByShopIdAndSaleStatusAndVoidedAtGreaterThanEqualAndVoidedAtLessThan(
                        shop.getId(), SaleStatus.VOIDED, window.fromInclusive(), window.toExclusive());
        List<Payment> payments = paymentRepository.findReceivedByShopAndPeriod(shop.getId(),
                window.fromInclusive(), window.toExclusive());
        List<SaleRefund> refunds = refundRepository.findRefundedByShopAndPeriod(shop.getId(),
                window.fromInclusive(), window.toExclusive());
        List<Expense> expenses = expenseRepository
                .findAllByShopIdAndStatusAndExpenseAtGreaterThanEqualAndExpenseAtLessThanOrderByExpenseAtDescIdDesc(
                        shop.getId(), ExpenseStatus.ACTIVE, window.fromInclusive(), window.toExclusive());
        List<Debt> debts = debtRepository.findAllByShopIdOrderByIdDesc(shop.getId());

        long voidedRevenue = voidedSales.stream().mapToLong(Sale::getTotalVnd).reduce(0, Math::addExact);
        long grossRevenue = sales.stream().mapToLong(Sale::getTotalVnd).reduce(0, Math::addExact);
        long netRevenue = Math.subtractExact(grossRevenue, voidedRevenue);
        long collected = payments.stream().mapToLong(Payment::getAmountVnd).reduce(0, Math::addExact);
        long refunded = refunds.stream().mapToLong(SaleRefund::getAmountVnd).reduce(0, Math::addExact);
        long expenseTotal = expenses.stream().mapToLong(Expense::getAmountVnd).reduce(0, Math::addExact);
        // Debt is a current shop-wide balance, not a flow restricted to the selected period.
        long outstanding = debts.stream().mapToLong(Debt::getOutstandingVnd).reduce(0, Math::addExact);
        return new ReportSummaryResponse(window.period(), window.fromInclusive(), window.toExclusive(),
                grossRevenue, voidedRevenue, netRevenue, collected, expenseTotal, outstanding, sales.size(),
                refunded, voidedSales.size());
    }
}
