package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.ReportGranularity;
import com.smartledger.core.enums.ReportItemSource;
import com.smartledger.core.enums.TopProductSort;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.DebtRepository;
import com.smartledger.core.repository.ExpenseRepository;
import com.smartledger.core.repository.PaymentRepository;
import com.smartledger.core.repository.ReportAggregationRepository;
import com.smartledger.core.repository.SaleRefundRepository;
import com.smartledger.core.repository.SaleRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.ReportServiceImpl;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

class AdvancedReportServiceTest {
    private final ShopService shopService = Mockito.mock(ShopService.class);
    private final SaleRepository saleRepository = Mockito.mock(SaleRepository.class);
    private final PaymentRepository paymentRepository = Mockito.mock(PaymentRepository.class);
    private final ExpenseRepository expenseRepository = Mockito.mock(ExpenseRepository.class);
    private final DebtRepository debtRepository = Mockito.mock(DebtRepository.class);
    private final SaleRefundRepository refundRepository = Mockito.mock(SaleRefundRepository.class);
    private final ReportAggregationRepository aggregationRepository = Mockito.mock(ReportAggregationRepository.class);
    private final ReportService service = new ReportServiceImpl(shopService, saleRepository, paymentRepository,
            expenseRepository, debtRepository, refundRepository, aggregationRepository);
    private final VerifiedFirebaseToken token = new VerifiedFirebaseToken("uid", null, false, null, null, null);

    @BeforeEach
    void authorizeShop() {
        Shop shop = Shop.create(42L, "Shop", null, null, null);
        ReflectionTestUtils.setField(shop, "id", 7L);
        when(shopService.requireOwnedActiveShop(any(), eq("7"))).thenReturn(shop);
    }

    @Test
    void topProductsReturnsStableCatalogAndCustomRows() {
        when(aggregationRepository.topProducts(eq(7L), any(), any(), eq(TopProductSort.NET_REVENUE), eq(10)))
                .thenReturn(List.of(
                        new ReportAggregationRepository.TopProductRow("PRODUCT:3", 3L, "Ca phe", "ly",
                                ReportItemSource.CATALOG, new BigDecimal("4.000"), new BigDecimal("1.000"),
                                new BigDecimal("3.000"), 100_000L, 25_000L, 75_000L),
                        new ReportAggregationRepository.TopProductRow("CUSTOM:banh:phan", null, "Banh", "phan",
                                ReportItemSource.CUSTOM, BigDecimal.ONE, BigDecimal.ZERO, BigDecimal.ONE,
                                20_000L, 0L, 20_000L)));

        var report = service.topProducts(token, "7", "month", 10, TopProductSort.NET_REVENUE);

        assertThat(report.items()).hasSize(2);
        assertThat(report.items().getFirst().productId()).isEqualTo(3L);
        assertThat(report.items().getFirst().netRevenueVnd()).isEqualTo(75_000L);
        assertThat(report.items().get(1).source()).isEqualTo(ReportItemSource.CUSTOM);
    }

    @Test
    void salesSeriesFillsMissingVietnameseCalendarDaysWithZero() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh"));
        LocalDate reportedDate = today.minusDays(3);
        when(aggregationRepository.salesSeries(eq(7L), any(), any())).thenReturn(List.of(
                new ReportAggregationRepository.SalesSeriesRow(reportedDate, 120_000L, 20_000L,
                        100_000L, 2L, 1L)));

        var report = service.salesSeries(token, "7", "week", ReportGranularity.DAY);

        assertThat(report.items()).hasSize(7);
        assertThat(report.items()).extracting(item -> item.date()).contains(reportedDate);
        assertThat(report.items().stream().filter(item -> item.date().equals(reportedDate)).findFirst().orElseThrow()
                .netRevenueVnd()).isEqualTo(100_000L);
        assertThat(report.items().stream().filter(item -> !item.date().equals(reportedDate)))
                .allMatch(item -> item.netRevenueVnd() == 0L && item.orderCount() == 0L);
    }

    @Test
    void profitEstimateSeparatesKnownCostAndMarksUnknownCostExposure() {
        when(aggregationRepository.profitEstimate(eq(7L), any(), any())).thenReturn(
                new ReportAggregationRepository.ProfitEstimateRow(500_000L, 100_000L,
                        300_000L, 60_000L, 50_000L, 2L, 80_000L));

        var report = service.profitEstimate(token, "7", "month");

        assertThat(report.netRevenueVnd()).isEqualTo(400_000L);
        assertThat(report.netEstimatedCogsVnd()).isEqualTo(240_000L);
        assertThat(report.estimatedGrossProfitVnd()).isEqualTo(160_000L);
        assertThat(report.estimatedOperatingProfitVnd()).isEqualTo(110_000L);
        assertThat(report.isComplete()).isFalse();
        assertThat(report.unknownCostItemCount()).isEqualTo(2L);
        assertThat(report.unknownCostRevenueVnd()).isEqualTo(80_000L);
    }

    @Test
    void rejectsTopProductLimitOutsideContract() {
        assertThatThrownBy(() -> service.topProducts(token, "7", "month", 0,
                TopProductSort.NET_REVENUE)).isInstanceOfSatisfying(BusinessException.class,
                        error -> assertThat(error.getErrorCode()).isEqualTo(ErrorCode.INVALID_REPORT_QUERY));
    }
}
