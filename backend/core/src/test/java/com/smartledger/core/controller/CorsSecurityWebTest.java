package com.smartledger.core.controller;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.config.TimeConfiguration;
import com.smartledger.core.dto.response.AuditLogPageResponse;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.ApiExceptionHandler;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerificationException;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AuditLogQueryService;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(value = AuditLogController.class, properties =
        "smartledger.cors.allowed-origins=https://owner.example.test,http://localhost:8081")
@Import({SecurityConfiguration.class, TimeConfiguration.class, BearerTokenAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class, ApiExceptionHandler.class})
class CorsSecurityWebTest {
    private static final String ORIGIN = "https://owner.example.test";
    @Autowired private MockMvc mvc;
    @MockitoBean private FirebaseTokenVerifier verifier;
    @MockitoBean private AuditLogQueryService service;

    @BeforeEach
    void authenticate() {
        when(verifier.verify("valid")).thenReturn(new VerifiedFirebaseToken("owner", null, false, null, null, null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "POST", "PUT", "PATCH", "DELETE"})
    void validPreflightDoesNotRequireTokenOrInvokeBusinessAction(String method) throws Exception {
        mvc.perform(options("/api/v1/expenses").header("Origin", ORIGIN)
                        .header("Access-Control-Request-Method", method)
                        .header("Access-Control-Request-Headers", "authorization,content-type,x-shop-id,idempotency-key"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", ORIGIN))
                .andExpect(header().string("Access-Control-Allow-Methods", containsString(method)))
                .andExpect(header().string("Access-Control-Allow-Headers", containsString("authorization")))
                .andExpect(header().string("Access-Control-Allow-Headers", containsString("content-type")))
                .andExpect(header().string("Access-Control-Allow-Headers", containsString("x-shop-id")))
                .andExpect(header().string("Access-Control-Allow-Headers", containsString("idempotency-key")))
                .andExpect(header().string("Access-Control-Max-Age", "600"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
        verifyNoInteractions(verifier, service);
    }

    @Test
    void unsupportedMethodAndInternalHeaderAreRejected() throws Exception {
        mvc.perform(options("/api/v1/expenses").header("Origin", ORIGIN)
                        .header("Access-Control-Request-Method", "TRACE"))
                .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        mvc.perform(options("/api/v1/expenses").header("Origin", ORIGIN)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "X-Internal-Token"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(verifier, service);
    }

    @Test
    void unknownOriginIsRejectedBeforeTokenVerification() throws Exception {
        mvc.perform(get("/api/v1/audit-logs").header("Origin", "https://evil.example.test")
                        .header("Authorization", "Bearer valid").header("X-Shop-Id", "7"))
                .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        verifyNoInteractions(verifier, service);
    }

    @Test
    void allowedOriginDoesNotBypassAuthentication() throws Exception {
        mvc.perform(get("/api/v1/audit-logs").header("Origin", ORIGIN).header("X-Shop-Id", "7"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("unauthorized"))
                .andExpect(header().string("Access-Control-Allow-Origin", ORIGIN));
        verifyNoInteractions(verifier, service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"invalid", "expired", "wrong-project"})
    void verificationFailureRemainsReadableToAllowedBrowser(String token) throws Exception {
        // Transport contract only: real Firebase rejection is checked separately during staging UAT.
        when(verifier.verify(token)).thenThrow(new FirebaseTokenVerificationException("rejected", null));
        mvc.perform(get("/api/v1/audit-logs").header("Origin", ORIGIN)
                        .header("Authorization", "Bearer " + token).header("X-Shop-Id", "7"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("unauthorized"))
                .andExpect(header().string("Access-Control-Allow-Origin", ORIGIN));
        verifyNoInteractions(service);
    }

    @Test
    void permittedRequestSucceedsWithAndWithoutOrigin() throws Exception {
        when(service.list(any(), eq("7"), any(), any(), any(), any(), eq(0), eq(20)))
                .thenReturn(new AuditLogPageResponse(List.of(), 0, 20, 0, 0));
        mvc.perform(get("/api/v1/audit-logs").header("Origin", ORIGIN)
                        .header("Authorization", "Bearer valid").header("X-Shop-Id", "7"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty())
                .andExpect(header().string("Access-Control-Allow-Origin", ORIGIN));
        mvc.perform(get("/api/v1/audit-logs").header("Authorization", "Bearer valid").header("X-Shop-Id", "7"))
                .andExpect(status().isOk()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void businessDenialIsNotMaskedByCors() throws Exception {
        when(service.list(any(), eq("8"), any(), any(), any(), any(), eq(0), eq(20)))
                .thenThrow(new BusinessException(ErrorCode.SHOP_ACCESS_DENIED));
        mvc.perform(get("/api/v1/audit-logs").header("Origin", ORIGIN)
                        .header("Authorization", "Bearer valid").header("X-Shop-Id", "8"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("shop_access_denied"))
                .andExpect(header().string("Access-Control-Allow-Origin", ORIGIN));
    }
}
