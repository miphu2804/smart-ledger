package com.smartledger.core.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.dto.response.ExpenseResponse;
import com.smartledger.core.dto.response.ReportSummaryResponse;
import com.smartledger.core.dto.response.ProfitEstimateReportResponse;
import com.smartledger.core.dto.response.SalesSeriesReportResponse;
import com.smartledger.core.dto.response.SalesSeriesReportResponse.DailySales;
import com.smartledger.core.dto.response.TopProductsReportResponse;
import com.smartledger.core.dto.response.TopProductsReportResponse.TopProduct;
import com.smartledger.core.enums.ExpenseStatus;
import com.smartledger.core.enums.ReportGranularity;
import com.smartledger.core.enums.ReportItemSource;
import com.smartledger.core.enums.TopProductSort;
import com.smartledger.core.exception.ApiExceptionHandler;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ExpenseService;
import com.smartledger.core.service.ReportService;
import java.time.OffsetDateTime;
import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = {ExpenseController.class, ReportController.class})
@Import({SecurityConfiguration.class, BearerTokenAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class, ApiExceptionHandler.class})
class ExpenseReportControllerWebTest {
    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private FirebaseTokenVerifier tokenVerifier;

    @MockitoBean
    private ExpenseService expenseService;

    @MockitoBean
    private ReportService reportService;

    @BeforeEach
    void validToken() {
        when(tokenVerifier.verify("valid-token"))
                .thenReturn(new VerifiedFirebaseToken("uid", null, false, null, null, null));
    }

    @Test
    void createExpenseAndReadSummary() throws Exception {
        when(expenseService.create(any(), eq("7"), eq("expense-one"), any())).thenReturn(new ExpenseResponse(9L, 7L,
                "Rent", "Monthly rent", 200_000L, null, OffsetDateTime.parse("2026-09-28T03:00:00Z"),
                ExpenseStatus.ACTIVE, null, null));
        mvc.perform(post("/api/v1/expenses")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .header("Idempotency-Key", "expense-one")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"description\":\"Monthly rent\",\"amountVnd\":200000}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(9));

        when(reportService.summary(any(), eq("7"), eq("today"))).thenReturn(new ReportSummaryResponse(
                "today", OffsetDateTime.parse("2026-09-27T17:00:00Z"),
                OffsetDateTime.parse("2026-09-28T03:00:00Z"), 300_000L, 0, 300_000L, 150_000L,
                200_000L, 150_000L, 2, 0, 0));
        mvc.perform(get("/api/v1/reports/summary")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .param("period", "today"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.grossRevenueVnd").value(300000))
                .andExpect(jsonPath("$.voidedRevenueVnd").value(0))
                .andExpect(jsonPath("$.netRevenueVnd").value(300000))
                .andExpect(jsonPath("$.confirmedRevenueVnd").doesNotExist())
                .andExpect(jsonPath("$.collectedVnd").value(150000));
    }

    @Test
    void rejectsInvalidExpenseAndPatchBodies() throws Exception {
        mvc.perform(post("/api/v1/expenses")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"description\":\" \" ,\"amountVnd\":0}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/v1/expenses/9")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountVnd\":null}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void reportsMissingRequiredHeadersInTheStandardErrorShape() throws Exception {
        mvc.perform(post("/api/v1/expenses")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"description\":\"Rent\",\"amountVnd\":10000}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("missing_required_header"))
                .andExpect(jsonPath("$.details[0].field").value("Idempotency-Key"));
    }

    @Test
    void requiresAuthentication() throws Exception {
        mvc.perform(get("/api/v1/reports/summary").header("X-Shop-Id", "7"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/expenses").header("X-Shop-Id", "7"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void summaryKeepsNegativeNetRevenueAndSeparateRefundAmount() throws Exception {
        when(reportService.summary(any(), eq("7"), eq("today"))).thenReturn(new ReportSummaryResponse(
                "today", OffsetDateTime.parse("2026-09-27T17:00:00Z"),
                OffsetDateTime.parse("2026-09-28T03:00:00Z"), 50_000L, 100_000L, -50_000L,
                20_000L, 0, 0, 1, 40_000L, 1));

        mvc.perform(get("/api/v1/reports/summary")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .param("period", "today"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.grossRevenueVnd").value(50000))
                .andExpect(jsonPath("$.voidedRevenueVnd").value(100000))
                .andExpect(jsonPath("$.netRevenueVnd").value(-50000))
                .andExpect(jsonPath("$.collectedVnd").value(20000))
                .andExpect(jsonPath("$.refundedVnd").value(40000))
                .andExpect(jsonPath("$.confirmedRevenueVnd").doesNotExist());
    }

    @Test
    void exposesTopProductsSeriesAndProfitEstimateContracts() throws Exception {
        OffsetDateTime from = OffsetDateTime.parse("2026-09-30T17:00:00Z");
        OffsetDateTime to = OffsetDateTime.parse("2026-10-06T03:00:00Z");
        when(reportService.topProducts(any(), eq("7"), eq("month"), eq(10),
                eq(TopProductSort.NET_REVENUE))).thenReturn(new TopProductsReportResponse("month", from, to,
                TopProductSort.NET_REVENUE, List.of(new TopProduct("PRODUCT:3", 3L, "Ca phe", "ly",
                        ReportItemSource.CATALOG, new BigDecimal("4.000"), BigDecimal.ONE,
                        new BigDecimal("3.000"), 100_000L, 25_000L, 75_000L))));
        when(reportService.salesSeries(any(), eq("7"), eq("month"), eq(ReportGranularity.DAY)))
                .thenReturn(new SalesSeriesReportResponse("month", from, to, ReportGranularity.DAY,
                        List.of(new DailySales(LocalDate.parse("2026-10-01"), 100_000L, 0, 100_000L, 2, 0))));
        when(reportService.profitEstimate(any(), eq("7"), eq("month")))
                .thenReturn(new ProfitEstimateReportResponse("month", from, to, 100_000L, 0, 100_000L,
                        60_000L, 0, 60_000L, 40_000L, 10_000L, 30_000L, true, 0, 0));

        mvc.perform(get("/api/v1/reports/top-products").header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7").param("period", "month"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].source").value("CATALOG"))
                .andExpect(jsonPath("$.items[0].netRevenueVnd").value(75000));
        mvc.perform(get("/api/v1/reports/sales-series").header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7").param("period", "month"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.granularity").value("DAY"))
                .andExpect(jsonPath("$.items[0].date").value("2026-10-01"));
        mvc.perform(get("/api/v1/reports/profit-estimate").header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7").param("period", "month"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.estimatedOperatingProfitVnd").value(30000))
                .andExpect(jsonPath("$.isComplete").value(true));
    }
}
