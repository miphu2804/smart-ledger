package com.smartledger.core.service.impl;

import com.smartledger.core.dto.response.ReportSummaryResponse;
import com.smartledger.core.dto.response.ProfitEstimateReportResponse;
import com.smartledger.core.dto.response.SalesSeriesReportResponse;
import com.smartledger.core.dto.response.SalesSeriesReportResponse.DailySales;
import com.smartledger.core.dto.response.TopProductsReportResponse;
import com.smartledger.core.dto.response.TopProductsReportResponse.TopProduct;
import com.smartledger.core.entity.Debt;
import com.smartledger.core.entity.Expense;
import com.smartledger.core.entity.Payment;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.entity.SaleRefund;
import com.smartledger.core.enums.ExpenseStatus;
import com.smartledger.core.enums.SaleStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.ReportGranularity;
import com.smartledger.core.enums.TopProductSort;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.DebtRepository;
import com.smartledger.core.repository.ExpenseRepository;
import com.smartledger.core.repository.PaymentRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.repository.SaleRefundRepository;
import com.smartledger.core.repository.ReportAggregationRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ReportService;
import com.smartledger.core.service.ShopService;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
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
    private final ReportAggregationRepository aggregationRepository;
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    public ReportServiceImpl(ShopService shopService, SaleRepository saleRepository,
            PaymentRepository paymentRepository, ExpenseRepository expenseRepository,
            DebtRepository debtRepository, SaleRefundRepository refundRepository,
            ReportAggregationRepository aggregationRepository) {
        this.shopService = shopService;
        this.saleRepository = saleRepository;
        this.paymentRepository = paymentRepository;
        this.expenseRepository = expenseRepository;
        this.debtRepository = debtRepository;
        this.refundRepository = refundRepository;
        this.aggregationRepository = aggregationRepository;
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

    @Override
    @Transactional(readOnly = true)
    public TopProductsReportResponse topProducts(VerifiedFirebaseToken token, String shopId, String period,
            int limit, TopProductSort sortBy) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        if (limit < 1 || limit > 100 || sortBy == null) {
            throw new BusinessException(ErrorCode.INVALID_REPORT_QUERY);
        }
        ReportWindow window = ReportWindow.of(period, OffsetDateTime.now(ZoneOffset.UTC));
        List<TopProduct> items = aggregationRepository.topProducts(shop.getId(), window.fromInclusive(),
                window.toExclusive(), sortBy, limit).stream().map(row -> new TopProduct(row.itemKey(),
                row.productId(), row.productName(), row.unit(), row.source(), row.grossQuantity(),
                row.voidedQuantity(), row.netQuantity(), row.grossRevenueVnd(), row.voidedRevenueVnd(),
                row.netRevenueVnd())).toList();
        return new TopProductsReportResponse(window.period(), window.fromInclusive(), window.toExclusive(),
                sortBy, items);
    }

    @Override
    @Transactional(readOnly = true)
    public SalesSeriesReportResponse salesSeries(VerifiedFirebaseToken token, String shopId, String period,
            ReportGranularity granularity) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        if (granularity != ReportGranularity.DAY) {
            throw new BusinessException(ErrorCode.INVALID_REPORT_QUERY);
        }
        ReportWindow window = ReportWindow.of(period, OffsetDateTime.now(ZoneOffset.UTC));
        var rows = new HashMap<LocalDate, ReportAggregationRepository.SalesSeriesRow>();
        aggregationRepository.salesSeries(shop.getId(), window.fromInclusive(), window.toExclusive())
                .forEach(row -> rows.put(row.date(), row));
        LocalDate first = window.fromInclusive().atZoneSameInstant(BUSINESS_ZONE).toLocalDate();
        LocalDate last = window.toExclusive().minusNanos(1).atZoneSameInstant(BUSINESS_ZONE).toLocalDate();
        var items = new java.util.ArrayList<DailySales>();
        for (LocalDate date = first; !date.isAfter(last); date = date.plusDays(1)) {
            var row = rows.get(date);
            items.add(row == null ? new DailySales(date, 0, 0, 0, 0, 0)
                    : new DailySales(date, row.grossRevenueVnd(), row.voidedRevenueVnd(),
                            row.netRevenueVnd(), row.orderCount(), row.voidedOrderCount()));
        }
        return new SalesSeriesReportResponse(window.period(), window.fromInclusive(), window.toExclusive(),
                granularity, List.copyOf(items));
    }

    @Override
    @Transactional(readOnly = true)
    public ProfitEstimateReportResponse profitEstimate(VerifiedFirebaseToken token, String shopId,
            String period) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        ReportWindow window = ReportWindow.of(period, OffsetDateTime.now(ZoneOffset.UTC));
        var row = aggregationRepository.profitEstimate(shop.getId(), window.fromInclusive(),
                window.toExclusive());
        long netRevenue = Math.subtractExact(row.grossRevenueVnd(), row.voidedRevenueVnd());
        long netCogs = Math.subtractExact(row.grossEstimatedCogsVnd(), row.voidedEstimatedCogsVnd());
        long grossProfit = Math.subtractExact(netRevenue, netCogs);
        long operatingProfit = Math.subtractExact(grossProfit, row.expenseVnd());
        return new ProfitEstimateReportResponse(window.period(), window.fromInclusive(), window.toExclusive(),
                row.grossRevenueVnd(), row.voidedRevenueVnd(), netRevenue,
                row.grossEstimatedCogsVnd(), row.voidedEstimatedCogsVnd(), netCogs, grossProfit,
                row.expenseVnd(), operatingProfit, row.unknownCostItemCount() == 0,
                row.unknownCostItemCount(), row.unknownCostRevenueVnd());
    }
}
