package com.smartledger.core.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.argThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.config.TimeConfiguration;
import com.smartledger.core.dto.response.PaymentResponse;
import com.smartledger.core.dto.response.SaleDraftResponse;
import com.smartledger.core.dto.response.SaleResponse;
import com.smartledger.core.dto.response.SaleVoidResponse;
import com.smartledger.core.enums.DraftStatus;
import com.smartledger.core.enums.PaymentMethod;
import com.smartledger.core.enums.PaymentStatus;
import com.smartledger.core.enums.PaymentType;
import com.smartledger.core.enums.SaleStatus;
import com.smartledger.core.exception.ApiExceptionHandler;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.PaymentService;
import com.smartledger.core.service.SaleDraftService;
import com.smartledger.core.service.SaleService;
import com.smartledger.core.service.SaleVoidService;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = {SaleDraftController.class, SaleController.class, PaymentController.class})
@Import({SecurityConfiguration.class, BearerTokenAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class, ApiExceptionHandler.class, TimeConfiguration.class})
class CheckoutControllerWebTest {
    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private FirebaseTokenVerifier tokenVerifier;

    @MockitoBean
    private SaleDraftService draftService;

    @MockitoBean
    private SaleService saleService;

    @MockitoBean
    private SaleVoidService saleVoidService;

    @ParameterizedTest
    @ValueSource(strings = {"{\"reason\":\"Returned\"}", "{\"reason\":\"Returned\",\"restockItems\":null}"})
    void rejectsMissingOrNullRestockChoiceBeforeCallingBusinessService(String body) throws Exception {
        mvc.perform(post("/api/v1/sales/15/void")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .header("Idempotency-Key", "missing-choice")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"))
                .andExpect(jsonPath("$.details[0].field").value("restockItems"));
        verifyNoInteractions(saleVoidService);
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void acceptsBothExplicitRestockChoices(boolean restock) throws Exception {
        when(saleVoidService.voidSale(any(), eq("7"), eq("15"), eq("explicit-choice"), any()))
                .thenReturn(new SaleVoidResponse(null, null, 0L, restock));
        mvc.perform(post("/api/v1/sales/15/void")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .header("Idempotency-Key", "explicit-choice")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Returned\",\"restockItems\":" + restock + "}"))
                .andExpect(status().isCreated());
        verify(saleVoidService).voidSale(any(), eq("7"), eq("15"), eq("explicit-choice"),
                argThat(request -> Boolean.valueOf(restock).equals(request.restockItems())));
    }

    @Test
    void voidSaleRequiresIdempotencyKeyAndAcceptsValidRequest() throws Exception {
        mvc.perform(post("/api/v1/sales/15/void")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Returned\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("missing_required_header"));

        when(saleVoidService.voidSale(any(), eq("7"), eq("15"), eq("void-one"), any()))
                .thenReturn(new SaleVoidResponse(null, null, 0L, false));
        mvc.perform(post("/api/v1/sales/15/void")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .header("Idempotency-Key", "void-one")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Returned\",\"restockItems\":false}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.stockRestocked").value(false));
    }

    @MockitoBean
    private PaymentService paymentService;

    @BeforeEach
    void validToken() {
        when(tokenVerifier.verify("valid-token"))
                .thenReturn(new VerifiedFirebaseToken("uid", null, false, null, null, null));
    }

    @Test
    void createsManualDraftWith201() throws Exception {
        when(draftService.create(any(), eq("7"), any())).thenReturn(new SaleDraftResponse(
                11L, 7L, null, null, 0L, 25000L, 25000L, PaymentMethod.CASH,
                DraftStatus.DRAFT, OffsetDateTime.now(ZoneOffset.UTC).plusMonths(1), null, List.of()));

        mvc.perform(post("/api/v1/sale-drafts")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validDraftJson()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(11))
                .andExpect(jsonPath("$.status").value("DRAFT"));
    }

    @Test
    void acceptsCustomItemWithoutProductId() throws Exception {
        when(draftService.create(any(), eq("7"), any())).thenReturn(new SaleDraftResponse(
                11L, 7L, null, null, 0L, 20000L, 20000L, PaymentMethod.CASH,
                DraftStatus.DRAFT, OffsetDateTime.now(ZoneOffset.UTC).plusMonths(1), null, List.of()));

        mvc.perform(post("/api/v1/sale-drafts")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"initialPaidVnd":20000,"initialPaymentMethod":"CASH",
                                 "items":[{"productName":"Mon tu chon","unit":"phan",
                                           "quantity":1,"unitPriceVnd":20000}]}
                                """))
                .andExpect(status().isCreated());
    }

    @Test
    void rejectsEmptyDraftItemsWith400() throws Exception {
        mvc.perform(post("/api/v1/sale-drafts")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
    }

    @Test
    void confirmCreatesSaleWith201() throws Exception {
        when(draftService.confirm(any(), eq("7"), eq("11"))).thenReturn(new SaleResponse(
                15L, 7L, null, null, 25000L, 0L, 25000L, 25000L,
                SaleStatus.CONFIRMED, PaymentStatus.PAID, OffsetDateTime.parse("2026-10-01T14:30:00Z"), List.of(),
                null, 0L, null, null, null));

        mvc.perform(post("/api/v1/sale-drafts/11/confirm")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(15))
                .andExpect(jsonPath("$.paymentStatus").value("PAID"))
                .andExpect(jsonPath("$.soldAt").value("2026-10-01T21:30:00+07:00"));
    }

    @Test
    void cannotConfirmWithoutAuthentication() throws Exception {
        mvc.perform(post("/api/v1/sale-drafts/11/confirm").header("X-Shop-Id", "7"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void readsPaymentUnderItsSale() throws Exception {
        when(paymentService.getById(any(), eq("7"), eq("15"), eq("20")))
                .thenReturn(new PaymentResponse(20L, 15L, 25000L, PaymentMethod.CASH,
                        PaymentType.INITIAL, OffsetDateTime.parse("2026-10-01T14:30:00Z")));

        mvc.perform(get("/api/v1/sales/15/payments/20")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.saleId").value(15))
                .andExpect(jsonPath("$.type").value("INITIAL"))
                .andExpect(jsonPath("$.receivedAt").value("2026-10-01T21:30:00+07:00"));
    }

    private String validDraftJson() {
        return """
                {"discountVnd":0,"initialPaidVnd":25000,"initialPaymentMethod":"CASH",
                 "items":[{"productId":3,"quantity":1,"unitPriceVnd":25000}]}
                """;
    }
}
