package com.smartledger.core.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mockingDetails;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.config.TimeConfiguration;
import com.smartledger.core.dto.response.*;
import com.smartledger.core.enums.*;
import com.smartledger.core.exception.ApiExceptionHandler;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerificationException;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** HTTP contract in docs/contracts/api-contracts.md sections 2.1, 2.2 and 3.
 * Services are mocked here; transactional/ownership behavior is tested separately on PostgreSQL. */
@WebMvcTest({CategoryController.class, ProductController.class, SaleDraftController.class,
        SaleController.class, PaymentController.class})
@Import({SecurityConfiguration.class, BearerTokenAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class, ApiExceptionHandler.class, TimeConfiguration.class})
class CoreBusinessContractWebTest {
    @Autowired private MockMvc mvc;
    @MockitoBean private FirebaseTokenVerifier tokenVerifier;
    @MockitoBean private CategoryService categories;
    @MockitoBean private ProductService products;
    @MockitoBean private SaleDraftService drafts;
    @MockitoBean private SaleService sales;
    @MockitoBean private PaymentService payments;
    @MockitoBean private SaleVoidService voids;

    private static final VerifiedFirebaseToken TOKEN =
            new VerifiedFirebaseToken("contract-owner", null, false, null, null, null);
    private static final OffsetDateTime AT = OffsetDateTime.parse("2026-10-01T14:30:00Z");
    private static final String CATEGORY_JSON = """
            {"id":3,"shopId":7,"name":"Drinks","status":"ACTIVE",
             "createdAt":"2026-10-01T21:30:00+07:00","updatedAt":"2026-10-01T21:30:00+07:00"}
            """;
    private static final String PRODUCT_JSON = """
            {"id":5,"shopId":7,"categoryId":3,"name":"Tea","barcode":null,"imageUrl":null,
             "unit":"cup","sellingPriceVnd":50000,"costPriceVnd":null,"tracked":true,"stockQuantity":10,
             "status":"ACTIVE","createdAt":"2026-10-01T21:30:00+07:00","updatedAt":"2026-10-01T21:30:00+07:00"}
            """;
    private static final String ITEMS_JSON = """
            [{"id":30,"productId":5,"productName":"Tea","unit":"cup","quantity":1,
              "unitPriceVnd":50000,"lineTotalVnd":50000},
             {"id":31,"productId":null,"productName":"Custom item","unit":"piece","quantity":1,
              "unitPriceVnd":50000,"lineTotalVnd":50000}]
            """;
    private static final String DRAFT_JSON = """
            {"id":11,"shopId":7,"customerId":9,"customerName":"Customer","customerPhone":null,
             "discountVnd":0,"estimatedTotalVnd":100000,"initialPaidVnd":40000,"initialPaymentMethod":"CASH",
             "status":"DRAFT","expiresAt":"2026-11-01T21:30:00+07:00","confirmedSaleId":null,"items":%s}
            """.formatted(ITEMS_JSON);
    private static final String PAYMENT_JSON = """
            {"id":20,"saleId":15,"amountVnd":40000,"paymentMethod":"CASH","type":"INITIAL",
             "receivedAt":"2026-10-01T21:30:00+07:00"}
            """;
    private static final String REFUND_JSON = """
            {"id":23,"saleId":15,"amountVnd":40000,"refundMethod":"CASH","transferReference":null,
             "refundedByUserId":2,"refundedAt":"2026-10-01T21:30:00+07:00"}
            """;
    private static final String PRODUCT_BODY = """
            {"categoryId":3,"name":"Tea","unit":"cup","sellingPriceVnd":50000,"tracked":true,"stockQuantity":10}
            """;
    private static final String DRAFT_BODY = """
            {"customerId":9,"initialPaidVnd":40000,"initialPaymentMethod":"CASH","items":[
             {"productId":5,"quantity":1,"unitPriceVnd":50000},
             {"productId":null,"productName":"Custom item","unit":"piece","quantity":1,"unitPriceVnd":50000}]}
            """;
    private static final String VOID_BODY = "{\"reason\":\"Returned\",\"restockItems\":true,\"refundMethod\":\"CASH\"}";

    @BeforeEach
    void fixtures() {
        when(tokenVerifier.verify("valid-token")).thenReturn(TOKEN);
        when(tokenVerifier.verify("invalid-token")).thenThrow(new FirebaseTokenVerificationException("Invalid test token", null));
        var category = new CategoryResponse(3L, 7L, "Drinks", CatalogStatus.ACTIVE, AT, AT);
        when(categories.create(eq(TOKEN), eq("7"), any())).thenReturn(category);
        when(categories.list(TOKEN, "7")).thenReturn(List.of(category));
        when(categories.getById(TOKEN, "7", "3")).thenReturn(category);
        when(categories.replace(eq(TOKEN), eq("7"), eq("3"), any())).thenReturn(category);
        var product = new ProductResponse(5L, 7L, 3L, "Tea", null, null, "cup", 50_000L, null,
                true, BigDecimal.TEN, CatalogStatus.ACTIVE, AT, AT);
        when(products.create(eq(TOKEN), eq("7"), any())).thenReturn(product);
        when(products.list(TOKEN, "7")).thenReturn(List.of(product));
        when(products.getById(TOKEN, "7", "5")).thenReturn(product);
        when(products.patch(eq(TOKEN), eq("7"), eq("5"), any())).thenReturn(product);
        when(products.stockIn(eq(TOKEN), eq("7"), eq("5"), eq("contract-stock-in"), any())).thenReturn(product);
        var draft = new SaleDraftResponse(11L, 7L, "Customer", null, 0L, 100_000L, 40_000L,
                PaymentMethod.CASH, DraftStatus.DRAFT, AT.plusMonths(1), null, List.of(
                new SaleDraftItemResponse(30L, 5L, "Tea", "cup", BigDecimal.ONE, 50_000L, 50_000L),
                new SaleDraftItemResponse(31L, null, "Custom item", "piece", BigDecimal.ONE, 50_000L, 50_000L)), 9L);
        when(drafts.create(eq(TOKEN), eq("7"), any())).thenReturn(draft);
        when(drafts.list(TOKEN, "7")).thenReturn(List.of(draft));
        when(drafts.getById(TOKEN, "7", "11")).thenReturn(draft);
        when(drafts.replace(eq(TOKEN), eq("7"), eq("11"), any())).thenReturn(draft);
        when(drafts.confirm(TOKEN, "7", "11")).thenReturn(sale(false));
        when(sales.list(TOKEN, "7")).thenReturn(List.of(sale(false), sale(true)));
        when(sales.getById(TOKEN, "7", "15")).thenReturn(sale(false));
        var payment = new PaymentResponse(20L, 15L, 40_000L, PaymentMethod.CASH, PaymentType.INITIAL, AT);
        when(payments.listForSale(TOKEN, "7", "15")).thenReturn(List.of(payment));
        when(payments.getById(TOKEN, "7", "15", "20")).thenReturn(payment);
        var refund = new SaleRefundResponse(23L, 15L, 40_000L, PaymentMethod.CASH, null, 2L, AT);
        when(voids.getRefund(TOKEN, "7", "15")).thenReturn(refund);
        when(voids.voidSale(eq(TOKEN), eq("7"), eq("15"), eq("contract-void"), any()))
                .thenReturn(new SaleVoidResponse(sale(true), refund, 60_000L, true));
    }

    private static SaleResponse sale(boolean voided) {
        return new SaleResponse(15L, 7L, "Customer", null, 100_000L, 0L, 100_000L, 40_000L,
                voided ? SaleStatus.VOIDED : SaleStatus.CONFIRMED, PaymentStatus.PARTIAL, AT, List.of(
                new SaleItemResponse(30L, 5L, "Tea", "cup", BigDecimal.ONE, 50_000L, 50_000L),
                new SaleItemResponse(31L, null, "Custom item", "piece", BigDecimal.ONE, 50_000L, 50_000L)),
                9L, voided ? 0L : 60_000L, voided ? AT : null, voided ? 2L : null, voided ? "Returned" : null);
    }

    private static String saleJson(boolean voided) {
        return """
                {"id":15,"shopId":7,"customerId":9,"customerName":"Customer","customerPhone":null,
                 "subtotalVnd":100000,"discountVnd":0,"totalVnd":100000,"paidVnd":40000,
                 "saleStatus":"%s","paymentStatus":"PARTIAL","soldAt":"2026-10-01T21:30:00+07:00",
                 "items":%s,"outstandingVnd":%d,"voidedAt":%s,"voidedByUserId":%s,"voidReason":%s}
                """.formatted(voided ? "VOIDED" : "CONFIRMED", ITEMS_JSON, voided ? 0 : 60000,
                        voided ? "\"2026-10-01T21:30:00+07:00\"" : "null", voided ? "2" : "null",
                        voided ? "\"Returned\"" : "null");
    }

    record Operation(String method, String path, String body, int code, String json) {
        @Override public String toString() { return method + " " + path; }
    }

    static Stream<Operation> operations() {
        return Stream.of(
                new Operation("POST", "/api/v1/categories", "{\"name\":\"Drinks\"}", 201, CATEGORY_JSON),
                new Operation("GET", "/api/v1/categories", null, 200, "[" + CATEGORY_JSON + "]"),
                new Operation("GET", "/api/v1/categories/3", null, 200, CATEGORY_JSON),
                new Operation("PUT", "/api/v1/categories/3", "{\"name\":\"Drinks\"}", 200, CATEGORY_JSON),
                new Operation("DELETE", "/api/v1/categories/3", null, 204, null),
                new Operation("POST", "/api/v1/products", PRODUCT_BODY, 201, PRODUCT_JSON),
                new Operation("GET", "/api/v1/products", null, 200, "[" + PRODUCT_JSON + "]"),
                new Operation("GET", "/api/v1/products/5", null, 200, PRODUCT_JSON),
                new Operation("PATCH", "/api/v1/products/5", "{\"sellingPriceVnd\":50000}", 200, PRODUCT_JSON),
                new Operation("POST", "/api/v1/products/5/stock-in", "{\"quantity\":2.125,\"reason\":\"Delivery\"}", 200, PRODUCT_JSON),
                new Operation("DELETE", "/api/v1/products/5", null, 204, null),
                new Operation("POST", "/api/v1/sale-drafts", DRAFT_BODY, 201, DRAFT_JSON),
                new Operation("GET", "/api/v1/sale-drafts", null, 200, "[" + DRAFT_JSON + "]"),
                new Operation("GET", "/api/v1/sale-drafts/11", null, 200, DRAFT_JSON),
                new Operation("PUT", "/api/v1/sale-drafts/11", DRAFT_BODY, 200, DRAFT_JSON),
                new Operation("DELETE", "/api/v1/sale-drafts/11", null, 204, null),
                new Operation("POST", "/api/v1/sale-drafts/11/confirm", null, 201, saleJson(false)),
                new Operation("GET", "/api/v1/sales", null, 200, "[" + saleJson(false) + "," + saleJson(true) + "]"),
                new Operation("GET", "/api/v1/sales/15", null, 200, saleJson(false)),
                new Operation("GET", "/api/v1/sales/15/payments", null, 200, "[" + PAYMENT_JSON + "]"),
                new Operation("GET", "/api/v1/sales/15/payments/20", null, 200, PAYMENT_JSON),
                new Operation("POST", "/api/v1/sales/15/void", VOID_BODY, 201,
                        "{\"sale\":" + saleJson(true) + ",\"refund\":" + REFUND_JSON + ",\"cancelledDebtVnd\":60000,\"stockRestocked\":true}"),
                new Operation("GET", "/api/v1/sales/15/refund", null, 200, REFUND_JSON));
    }

    private MockHttpServletRequestBuilder call(Operation op) {
        var call = request(HttpMethod.valueOf(op.method()), op.path());
        if (op.path().endsWith("/void")) { call.header("Idempotency-Key", "contract-void"); }
        if (op.path().endsWith("/stock-in")) { call.header("Idempotency-Key", "contract-stock-in"); }
        if (op.body() != null) { call.contentType(MediaType.APPLICATION_JSON).content(op.body()); }
        return call;
    }

    @ParameterizedTest(name = "{0}") @MethodSource("operations")
    void successMatchesStatusAndCompleteResponseContract(Operation op) throws Exception {
        var result = mvc.perform(call(op).header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7"))
                .andExpect(status().is(op.code()));
        if (op.json() == null) { result.andExpect(content().string("")); }
        else { result.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().json(op.json(), org.springframework.test.json.JsonCompareMode.STRICT)); }
        var invocations = Stream.of(categories, products, drafts, sales, payments, voids)
                .flatMap(service -> mockingDetails(service).getInvocations().stream()).toList();
        assertThat(invocations).hasSize(1);
        assertThat(invocations.getFirst().getArgument(0, VerifiedFirebaseToken.class)).isEqualTo(TOKEN);
        assertThat(invocations.getFirst().getArgument(1, String.class)).isEqualTo("7");
        if (op.method().equals("DELETE")) {
            assertThat(invocations.getFirst().getArgument(2, String.class)).isEqualTo(op.path().substring(op.path().lastIndexOf('/') + 1));
        }
    }

    @ParameterizedTest(name = "{0}") @MethodSource("operations")
    void everyOperationRequiresBearerToken(Operation op) throws Exception {
        for (String authorization : List.of("", "Bearer invalid-token")) {
            mvc.perform(call(op).header("X-Shop-Id", "7").header("Authorization", authorization))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("unauthorized"))
                    .andExpect(jsonPath("$.message").isNotEmpty()).andExpect(jsonPath("$.traceId").isNotEmpty());
        }
        verifyNoInteractions(categories, products, drafts, sales, payments, voids);
    }

    @ParameterizedTest(name = "{0}") @MethodSource("operations")
    void everyOperationRequiresShopHeader(Operation op) throws Exception {
        mvc.perform(call(op).header("Authorization", "Bearer valid-token"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("missing_required_header"))
                .andExpect(jsonPath("$.details[0].field").value("X-Shop-Id"))
                .andExpect(jsonPath("$.traceId").isNotEmpty());
        verifyNoInteractions(categories, products, drafts, sales, payments, voids);
    }

    static Stream<Arguments> businessErrors() {
        return Stream.of(
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{\"quantity\":1}", ErrorCode.PRODUCT_STOCK_IN_UNAVAILABLE),
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{\"quantity\":1}", ErrorCode.PRODUCT_STOCK_OVERFLOW),
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{\"quantity\":1}", ErrorCode.PRODUCT_NOT_FOUND),
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{\"quantity\":1}", ErrorCode.SHOP_ACCESS_DENIED),
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{\"quantity\":1}", ErrorCode.SHOP_INACTIVE),
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{\"quantity\":1}", ErrorCode.INVALID_PRODUCT_ID),
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{\"quantity\":1}", ErrorCode.INVALID_IDEMPOTENCY_KEY),
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{\"quantity\":1}", ErrorCode.IDEMPOTENCY_KEY_CONFLICT),
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{\"quantity\":1}", ErrorCode.IDEMPOTENCY_KEY_EXPIRED),
                Arguments.of("GET", "/api/v1/categories/3", null, ErrorCode.CATEGORY_NOT_FOUND),
                Arguments.of("GET", "/api/v1/products/5", null, ErrorCode.PRODUCT_NOT_FOUND),
                Arguments.of("GET", "/api/v1/sale-drafts/11", null, ErrorCode.DRAFT_NOT_FOUND),
                Arguments.of("PUT", "/api/v1/sale-drafts/11", DRAFT_BODY, ErrorCode.DRAFT_NOT_EDITABLE),
                Arguments.of("DELETE", "/api/v1/sale-drafts/11", null, ErrorCode.DRAFT_NOT_EDITABLE),
                Arguments.of("POST", "/api/v1/sale-drafts/11/confirm", null, ErrorCode.PRODUCT_STOCK_INSUFFICIENT),
                Arguments.of("POST", "/api/v1/sale-drafts/11/confirm", null, ErrorCode.CUSTOMER_REQUIRED_FOR_DEBT),
                Arguments.of("GET", "/api/v1/sales/15", null, ErrorCode.SALE_NOT_FOUND),
                Arguments.of("GET", "/api/v1/sales/15/payments/20", null, ErrorCode.PAYMENT_NOT_FOUND),
                Arguments.of("GET", "/api/v1/sales/15/refund", null, ErrorCode.SALE_REFUND_NOT_FOUND),
                Arguments.of("GET", "/api/v1/sales/15", null, ErrorCode.SHOP_ACCESS_DENIED),
                Arguments.of("POST", "/api/v1/sale-drafts/11/confirm", null, ErrorCode.SHOP_INACTIVE),
                Arguments.of("POST", "/api/v1/sales/15/void", VOID_BODY, ErrorCode.SALE_ALREADY_VOIDED),
                Arguments.of("POST", "/api/v1/sales/15/void", VOID_BODY, ErrorCode.IDEMPOTENCY_KEY_CONFLICT),
                Arguments.of("POST", "/api/v1/sales/15/void", VOID_BODY, ErrorCode.IDEMPOTENCY_KEY_EXPIRED));
    }

    @ParameterizedTest @MethodSource("businessErrors")
    void businessErrorsKeepStandardEnvelope(String method, String path, String body, ErrorCode error) throws Exception {
        var failure = new BusinessException(error);
        // Configure all affected entry points: this test checks HTTP mapping, not service policy.
        when(categories.getById(TOKEN, "7", "3")).thenThrow(failure);
        when(products.getById(TOKEN, "7", "5")).thenThrow(failure);
        when(products.stockIn(eq(TOKEN), eq("7"), eq("5"), eq("contract-stock-in"), any())).thenThrow(failure);
        when(drafts.getById(TOKEN, "7", "11")).thenThrow(failure);
        when(drafts.replace(eq(TOKEN), eq("7"), eq("11"), any())).thenThrow(failure);
        doThrow(failure).when(drafts).cancel(TOKEN, "7", "11");
        when(drafts.confirm(TOKEN, "7", "11")).thenThrow(failure);
        when(sales.getById(TOKEN, "7", "15")).thenThrow(failure);
        when(payments.getById(TOKEN, "7", "15", "20")).thenThrow(failure);
        when(voids.getRefund(TOKEN, "7", "15")).thenThrow(failure);
        when(voids.voidSale(eq(TOKEN), eq("7"), eq("15"), eq("contract-void"), any())).thenThrow(failure);
        mvc.perform(call(new Operation(method, path, body, 0, null))
                        .header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7"))
                .andExpect(status().is(error.getHttpStatus().value()))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value(error.getCode()))
                .andExpect(jsonPath("$.message").value(error.getMessage()))
                .andExpect(jsonPath("$.traceId").isNotEmpty())
                .andExpect(jsonPath("$.details").doesNotExist());
    }

    static Stream<Arguments> invalidBodies() {
        return Stream.of(
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{}", "validation_failed"),
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{\"quantity\":null}", "validation_failed"),
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{\"quantity\":0}", "validation_failed"),
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{\"quantity\":-1}", "validation_failed"),
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{\"quantity\":0.0001}", "validation_failed"),
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{\"quantity\":1000000000000}", "validation_failed"),
                Arguments.of("POST", "/api/v1/products/5/stock-in", "{\"quantity\":1,\"reason\":\"" + "a".repeat(501) + "\"}", "validation_failed"),
                Arguments.of("PATCH", "/api/v1/products/5", "{\"stockQuantity\":10}", "invalid_request"),
                Arguments.of("PATCH", "/api/v1/products/5", "{\"stockQuantity\":null}", "invalid_request"),
                Arguments.of("PATCH", "/api/v1/products/5", "{\"name\":\"Tea\",\"stockQuantity\":10}", "invalid_request"),
                Arguments.of("PUT", "/api/v1/categories/3", "{\"name\":\" \"}", "validation_failed"),
                Arguments.of("PUT", "/api/v1/sale-drafts/11", "{\"items\":[]}", "validation_failed"),
                Arguments.of("POST", "/api/v1/sale-drafts", "{\"items\":[{\"quantity\":0,\"unitPriceVnd\":1}]}", "validation_failed"),
                Arguments.of("POST", "/api/v1/sale-drafts", "{\"items\":[{\"quantity\":1,\"unitPriceVnd\":-1}]}", "validation_failed"),
                Arguments.of("POST", "/api/v1/sales/15/void", "{\"reason\":\" \" ,\"restockItems\":true}", "validation_failed"),
                Arguments.of("POST", "/api/v1/sales/15/void", "{\"reason\":\"Returned\",\"restockItems\":true,\"refundMethod\":\"CARD\"}", "invalid_request"),
                Arguments.of("PUT", "/api/v1/sale-drafts/11", "{", "invalid_request"));
    }

    @ParameterizedTest @MethodSource("invalidBodies")
    void invalidBodyDoesNotReachBusinessService(String method, String path, String body, String code) throws Exception {
        mvc.perform(call(new Operation(method, path, body, 0, null))
                        .header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.traceId").isNotEmpty());
        verifyNoInteractions(categories, products, drafts, sales, payments, voids);
    }

    static Stream<String> listPaths() {
        return Stream.of("/api/v1/categories", "/api/v1/products", "/api/v1/sale-drafts",
                "/api/v1/sales", "/api/v1/sales/15/payments");
    }

    @ParameterizedTest @MethodSource("listPaths")
    void emptyListsRemainArraysRatherThanNullOrNoContent(String path) throws Exception {
        when(categories.list(TOKEN, "7")).thenReturn(List.of());
        when(products.list(TOKEN, "7")).thenReturn(List.of());
        when(drafts.list(TOKEN, "7")).thenReturn(List.of());
        when(sales.list(TOKEN, "7")).thenReturn(List.of());
        when(payments.listForSale(TOKEN, "7", "15")).thenReturn(List.of());
        mvc.perform(request(HttpMethod.GET, path).header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7"))
                .andExpect(status().isOk()).andExpect(content().json("[]", org.springframework.test.json.JsonCompareMode.STRICT));
    }

    static Stream<Arguments> immutableLedgerPaths() {
        return Stream.of(Arguments.of("PATCH", "/api/v1/sales/15"), Arguments.of("DELETE", "/api/v1/sales/15"),
                Arguments.of("PATCH", "/api/v1/sales/15/payments/20"), Arguments.of("DELETE", "/api/v1/sales/15/payments/20"),
                Arguments.of("DELETE", "/api/v1/sales/15/refund"));
    }

    @ParameterizedTest @MethodSource("immutableLedgerPaths")
    void historicalSalesPaymentsAndRefundsCannotBeEditedOrDeleted(String method, String path) throws Exception {
        mvc.perform(request(HttpMethod.valueOf(method), path).header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isMethodNotAllowed());
        verifyNoInteractions(categories, products, drafts, sales, payments, voids);
    }

    @Test
    void stockInRequiresIdempotencyKeyBeforeInvokingBusinessService() throws Exception {
        mvc.perform(request(HttpMethod.POST, "/api/v1/products/5/stock-in")
                        .header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"quantity\":10}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("missing_required_header"))
                .andExpect(jsonPath("$.details[0].field").value("Idempotency-Key"));
        verifyNoInteractions(categories, products, drafts, sales, payments, voids);
    }

    @Test
    void legacyStockPatchExplainsTheReplacementEndpoint() throws Exception {
        mvc.perform(request(HttpMethod.PATCH, "/api/v1/products/5")
                        .header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"stockQuantity\":null}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("invalid_request"))
                .andExpect(jsonPath("$.message").value("stockQuantity cannot be patched; use the stock-in endpoint."))
                .andExpect(jsonPath("$.details[0].field").value("stockQuantity"));
        verifyNoInteractions(products);
    }

    @Test
    void voidRequiresIdempotencyKeyBeforeInvokingBusinessService() throws Exception {
        mvc.perform(request(HttpMethod.POST, "/api/v1/sales/15/void").header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7").contentType(MediaType.APPLICATION_JSON).content(VOID_BODY))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("missing_required_header"))
                .andExpect(jsonPath("$.details[0].field").value("Idempotency-Key"));
        verifyNoInteractions(categories, products, drafts, sales, payments, voids);
    }
}
