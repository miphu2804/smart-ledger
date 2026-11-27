package com.smartledger.core.billing;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.AdditionalMatchers.aryEq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.config.TimeConfiguration;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.ApiExceptionHandler;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest({BillingController.class, SePayWebhookController.class})
@Import({SecurityConfiguration.class, TimeConfiguration.class, BearerTokenAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class, ApiExceptionHandler.class})
class BillingControllerWebTest {
    @Autowired MockMvc mvc;
    @MockitoBean FirebaseTokenVerifier verifier;
    @MockitoBean BillingService billing;
    @MockitoBean SePayWebhookService webhook;

    @BeforeEach void authenticate() {
        when(verifier.verify("valid")).thenReturn(new VerifiedFirebaseToken("owner", null, false, null, null, null));
    }

    @Test void billingRoutesRemainFirebaseProtectedWithoutShopHeader() throws Exception {
        mvc.perform(get("/api/v1/billing/plans")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/billing/payment-requests/1")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/billing/payment-requests").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(billing);
        when(billing.plans(any())).thenReturn(BillingPlanResponse.catalog());
        mvc.perform(get("/api/v1/billing/plans").header("Authorization", "Bearer valid"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$[2].amountVnd").value(297000)).andExpect(jsonPath("$[2].aiQuota.limit").value(300));
    }

    @Test void exactWebhookPostUsesProviderAuthenticationEvenWithNonFirebaseAuthorization() throws Exception {
        byte[] bytes = " {\"content\":\"Tiếng Việt\"} ".getBytes(StandardCharsets.UTF_8);
        mvc.perform(post("/api/v1/webhooks/sepay/test").header("Authorization", "Apikey ignored-by-Firebase")
                        .header("X-SePay-Timestamp", "1").header("X-SePay-Signature", "signature")
                        .contentType(MediaType.APPLICATION_JSON).content(bytes))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.success").value(true));
        verify(webhook).accept(eq("test"), eq("1"), eq("signature"), aryEq(bytes));
        verifyNoInteractions(verifier);
        mvc.perform(get("/api/v1/webhooks/sepay/test")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/webhooks/sepay/test/extra")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/webhooks/sepay/test/extra").header("Authorization", "Apikey invalid"))
                .andExpect(status().isUnauthorized());
    }

    @Test void webhookRejectsMissingDuplicateHeadersOversizeAndWrongContentType() throws Exception {
        mvc.perform(post("/api/v1/webhooks/sepay/test").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.success").value(false));
        mvc.perform(post("/api/v1/webhooks/sepay/test").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-SePay-Timestamp", "1", "2").header("X-SePay-Signature", "s"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/webhooks/sepay/test").contentType(MediaType.APPLICATION_JSON).content("x".repeat(65537)))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/webhooks/sepay/test").contentType(MediaType.APPLICATION_FORM_URLENCODED).content("id=1"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(webhook, verifier);
    }

    @Test void webhookNeverAcknowledgesFailedCommitOrLeaksDiagnostics() throws Exception {
        for (int code : new int[]{400, 401, 409, 503}) {
            doThrow(new SePayFailure(code)).when(webhook).accept(any(), any(), any(), any());
            mvc.perform(post("/api/v1/webhooks/sepay/test").contentType(MediaType.APPLICATION_JSON).content("{}")
                            .header("X-SePay-Timestamp", "1").header("X-SePay-Signature", "s"))
                    .andExpect(status().is(code)).andExpect(jsonPath("$.success").value(false))
                    .andExpect(jsonPath("$.message").doesNotExist()).andExpect(jsonPath("$.trace").doesNotExist());
        }
        doThrow(new IllegalStateException("private database details")).when(webhook).accept(any(), any(), any(), any());
        mvc.perform(post("/api/v1/webhooks/sepay/test").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-SePay-Timestamp", "1").header("X-SePay-Signature", "s"))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.success").value(false))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("private"))));
    }

    @Test void ownedPaymentProjectionUsesVietnamTimeAndNoStore() throws Exception {
        var response = response();
        when(billing.get(any(), eq(9L))).thenReturn(response);
        when(billing.create(any(), eq("k"), any())).thenReturn(response);
        mvc.perform(post("/api/v1/billing/payment-requests").header("Authorization", "Bearer valid")
                        .header("Idempotency-Key", "k").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planCode\":\"FULL_MONTHLY\",\"planVersion\":1}"))
                .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.createdAt").value("2026-11-08T07:00:00+07:00"))
                .andExpect(jsonPath("$.fulfillmentStatus").value("NOT_STARTED"))
                .andExpect(jsonPath("$.webhookSecret").doesNotExist());
        mvc.perform(get("/api/v1/billing/payment-requests/9").header("Authorization", "Bearer valid"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.recipient.bankCode").value("TPBank"));
    }

    @Test void ownerBodyBoundsAndErrorsUseExistingCoreEnvelope() throws Exception {
        mvc.perform(post("/api/v1/billing/payment-requests").header("Authorization", "Bearer valid")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("missing_required_header"));
        mvc.perform(post("/api/v1/billing/payment-requests").header("Authorization", "Bearer valid")
                        .header("Idempotency-Key", "k").contentType(MediaType.APPLICATION_JSON).content("x".repeat(4097)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("invalid_billing_request"));
        verifyNoInteractions(billing);
        when(billing.get(any(), anyLong())).thenThrow(new BusinessException(ErrorCode.BILLING_REQUEST_NOT_FOUND));
        mvc.perform(get("/api/v1/billing/payment-requests/9").header("Authorization", "Bearer valid"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("billing_request_not_found"))
                .andExpect(jsonPath("$.traceId").isNotEmpty());
    }

    private static BillingPaymentResponse response() {
        var now = OffsetDateTime.parse("2026-11-08T00:00:00Z");
        return new BillingPaymentResponse(9, "FULL_MONTHLY", 1, 99000, "VND", 1, 1, "SLPAAAAAAAAAAAA", "PENDING", false,
                "NOT_STARTED", now, now.plusMinutes(30), null,
                new BillingPaymentResponse.Recipient("TPBank", "0000000001", "SIMULATED RECIPIENT"), "https://vietqr.app/img");
    }
}
