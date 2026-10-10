package com.smartledger.core.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.dto.request.OwnerListQuery.*;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.exception.ApiExceptionHandler;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.*;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest({ProductController.class, SaleController.class, SaleDraftController.class,
        CustomerController.class, DebtController.class, ExpenseController.class})
@Import({SecurityConfiguration.class, BearerTokenAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class, ApiExceptionHandler.class})
class OwnerPaginationWebTest {
    @Autowired MockMvc mvc;
    @MockitoBean FirebaseTokenVerifier verifier;
    @MockitoBean ProductService products;
    @MockitoBean SaleService sales;
    @MockitoBean SaleDraftService drafts;
    @MockitoBean CustomerService customers;
    @MockitoBean DebtService debts;
    @MockitoBean ExpenseService expenses;
    @MockitoBean MediaService media;
    @MockitoBean SaleVoidService voids;

    @BeforeEach
    void setup() {
        when(verifier.verify("owner-token")).thenReturn(
                new VerifiedFirebaseToken("owner", null, false, null, null, null));
        when(products.list(any(), eq("4"), any(Products.class))).thenReturn(page(List.of()));
        when(sales.list(any(), eq("4"), any(Sales.class))).thenReturn(page(List.of()));
        when(drafts.list(any(), eq("4"), any(Drafts.class))).thenReturn(page(List.of()));
        when(customers.list(any(), eq("4"), any(Customers.class))).thenReturn(page(List.of()));
        when(debts.list(any(), eq("4"), any(Debts.class))).thenReturn(page(List.of()));
        when(expenses.list(any(), eq("4"), any(Expenses.class))).thenReturn(page(List.of()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"products", "sales", "sale-drafts", "customers", "debts", "expenses"})
    void existingListRoutesReturnPageEnvelope(String resource) throws Exception {
        mvc.perform(get("/api/v1/" + resource).header("Authorization", "Bearer owner-token")
                        .header("X-Shop-Id", "4"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.totalPages").value(0));
    }
    static Stream<Arguments> invalidQueries() {
        return Stream.of("products", "sales", "sale-drafts", "customers", "debts", "expenses")
                .flatMap(resource -> Stream.of(
                        Arguments.of(resource, "page", "-1"), Arguments.of(resource, "size", "0"),
                        Arguments.of(resource, "size", "101"), Arguments.of(resource, "page", "2147483647"),
                        Arguments.of(resource, "page", "not-a-number")));
    }

    @ParameterizedTest @MethodSource("invalidQueries")
    void invalidPagesReturn400RatherThanServerError(String resource, String parameter, String value) throws Exception {
        mvc.perform(get("/api/v1/" + resource).queryParam(parameter, value)
                        .header("Authorization", "Bearer owner-token").header("X-Shop-Id", "4"))
                .andExpect(status().isBadRequest());
        org.mockito.Mockito.verifyNoInteractions(products, sales, drafts, customers, debts, expenses);
    }

    @ParameterizedTest
    @ValueSource(strings = {"products", "sales", "sale-drafts", "customers", "debts", "expenses"})
    void paginationStillRequiresAuthentication(String resource) throws Exception {
        mvc.perform(get("/api/v1/" + resource)).andExpect(status().isUnauthorized());
    }

    @Test
    void passesProductFiltersAndAllowlistedSortToService() throws Exception {
        mvc.perform(get("/api/v1/products").queryParam("page", "2").queryParam("size", "5")
                        .queryParam("q", " cà phê ").queryParam("categoryId", "8")
                        .queryParam("stockStatus", "NEEDS_RESTOCK").queryParam("sort", "PRICE_ASC")
                        .header("Authorization", "Bearer owner-token").header("X-Shop-Id", "4"))
                .andExpect(status().isOk());
        org.mockito.Mockito.verify(products).list(any(), eq("4"), eq(new Products(2, 5, "cà phê", 8L,
                StockStatus.NEEDS_RESTOCK, ProductSort.PRICE_ASC)));
    }

    @Test
    void parsesOffsetTimestampsAndSalesStatus() throws Exception {
        mvc.perform(get("/api/v1/sales").queryParam("from", "2026-10-09T12:30:00+07:00")
                        .queryParam("to", "2026-10-09T06:30:00Z")
                        .queryParam("saleStatus", "VOIDED").queryParam("q", "An")
                        .header("Authorization", "Bearer owner-token").header("X-Shop-Id", "4"))
                .andExpect(status().isOk());
        org.mockito.Mockito.verify(sales).list(any(), eq("4"), eq(new Sales(0, 20, "An",
                com.smartledger.core.enums.SaleStatus.VOIDED,
                OffsetDateTime.parse("2026-10-09T12:30:00+07:00"), OffsetDateTime.parse("2026-10-09T06:30:00Z"))));
    }

    @Test
    void parsesExpenseCategoryAndOffsetRange() throws Exception {
        mvc.perform(get("/api/v1/expenses").queryParam("from", "2026-10-09T12:30:00+07:00")
                        .queryParam("to", "2026-10-09T06:30:00Z")
                        .queryParam("category", "Rent")
                        .header("Authorization", "Bearer owner-token").header("X-Shop-Id", "4"))
                .andExpect(status().isOk());
        org.mockito.Mockito.verify(expenses).list(any(), eq("4"), eq(new Expenses(0, 20, null, "Rent",
                OffsetDateTime.parse("2026-10-09T12:30:00+07:00"), OffsetDateTime.parse("2026-10-09T06:30:00Z"))));
    }

    static Stream<Arguments> invalidFilters() {
        return Stream.of(Arguments.of("products", "sort", "id;drop table"),
                Arguments.of("products", "stockStatus", "UNKNOWN"), Arguments.of("products", "categoryId", "0"),
                Arguments.of("customers", "q", "x".repeat(201)), Arguments.of("debts", "customerId", "-1"),
                Arguments.of("debts", "status", "UNKNOWN"), Arguments.of("sale-drafts", "status", "UNKNOWN"),
                Arguments.of("sales", "from", "not-a-date"));
    }

    static Stream<Arguments> invalidOffsetTimestamps() {
        return Stream.of("sales", "expenses").flatMap(resource -> Stream.of("from", "to")
                .flatMap(parameter -> Stream.of("not-a-timestamp", "2026-10-09", "2026-10-09T12:30:00")
                        .map(value -> Arguments.of(resource, parameter, value))));
    }

    @ParameterizedTest @MethodSource("invalidOffsetTimestamps")
    void timeFiltersMustNotBeIgnoredAndMustIncludeAnOffset(String resource, String parameter, String value)
            throws Exception {
        mvc.perform(get("/api/v1/" + resource).queryParam(parameter, value)
                        .header("Authorization", "Bearer owner-token").header("X-Shop-Id", "4"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"))
                .andExpect(jsonPath("$.details[0].field").value(parameter));
        org.mockito.Mockito.verifyNoInteractions(sales, expenses);
    }

    static Stream<Arguments> invalidTimeRanges() {
        return Stream.of("sales", "expenses").flatMap(resource -> Stream.of(
                Arguments.of(resource, "2026-10-09T12:30:00+07:00", "2026-10-09T05:29:59Z"),
                Arguments.of(resource, "2026-10-09T12:30:00+07:00", "2026-10-09T05:30:00Z")));
    }

    @ParameterizedTest @MethodSource("invalidTimeRanges")
    void rejectsReversedAndEmptyRangesByInstant(String resource, String from, String to) throws Exception {
        mvc.perform(get("/api/v1/" + resource).queryParam("from", from).queryParam("to", to)
                        .header("Authorization", "Bearer owner-token").header("X-Shop-Id", "4"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(resource.equals("sales")
                        ? "invalid_sale_query" : "invalid_expense_query"));
        org.mockito.Mockito.verifyNoInteractions(sales, expenses);
    }

    @ParameterizedTest @ValueSource(strings = {"from", "to"})
    void expensePeriodCannotBeCombinedWithEitherTimestampBound(String parameter) throws Exception {
        mvc.perform(get("/api/v1/expenses").queryParam("period", "month")
                        .queryParam(parameter, "2026-10-09T12:30:00+07:00")
                        .header("Authorization", "Bearer owner-token").header("X-Shop-Id", "4"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_expense_query"));
        org.mockito.Mockito.verifyNoInteractions(expenses);
    }

    @ParameterizedTest @ValueSource(strings = {"from", "to"})
    void passesOneSidedOffsetRangesToBothServices(String parameter) throws Exception {
        String timestamp = "2026-10-09T12:30:00+07:00";
        for (String resource : List.of("sales", "expenses")) {
            mvc.perform(get("/api/v1/" + resource).queryParam(parameter, timestamp)
                            .header("Authorization", "Bearer owner-token").header("X-Shop-Id", "4"))
                    .andExpect(status().isOk());
        }
        OffsetDateTime from = parameter.equals("from") ? OffsetDateTime.parse(timestamp) : null;
        OffsetDateTime to = parameter.equals("to") ? OffsetDateTime.parse(timestamp) : null;
        org.mockito.Mockito.verify(sales).list(any(), eq("4"), eq(new Sales(0, 20, null, null, from, to)));
        org.mockito.Mockito.verify(expenses).list(any(), eq("4"), eq(new Expenses(0, 20, null, null, from, to)));
    }

    @ParameterizedTest @MethodSource("invalidFilters")
    void rejectsInvalidFilters(String resource, String parameter, String value) throws Exception {
        mvc.perform(get("/api/v1/" + resource).queryParam(parameter, value)
                        .header("Authorization", "Bearer owner-token").header("X-Shop-Id", "4"))
                .andExpect(status().isBadRequest());
        org.mockito.Mockito.verifyNoInteractions(products, sales, drafts, customers, debts, expenses);
    }

    private static <T> PageResponse<T> page(List<T> items) {
        return new PageResponse<>(items, 0, 20, items.size(), items.isEmpty() ? 0 : 1);
    }
}
