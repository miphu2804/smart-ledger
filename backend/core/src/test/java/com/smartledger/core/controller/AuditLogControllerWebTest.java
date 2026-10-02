package com.smartledger.core.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.config.TimeConfiguration;
import com.smartledger.core.dto.response.AuditLogPageResponse;
import com.smartledger.core.dto.response.AuditLogResponse;
import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.SystemRole;
import com.smartledger.core.exception.ApiExceptionHandler;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AuditLogQueryService;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AuditLogController.class)
@Import({SecurityConfiguration.class, TimeConfiguration.class, BearerTokenAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class, ApiExceptionHandler.class})
class AuditLogControllerWebTest {
    @Autowired private MockMvc mvc;
    @MockitoBean private FirebaseTokenVerifier verifier;
    @MockitoBean private AuditLogQueryService service;

    @BeforeEach
    void authenticate() {
        when(verifier.verify("valid")).thenReturn(new VerifiedFirebaseToken("owner", null, false, null, null, null));
    }

    @Test
    void missingTokenIsUnauthorized() throws Exception {
        mvc.perform(get("/api/v1/audit-logs").header("X-Shop-Id", "7"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void missingShopHeaderIsRejected() throws Exception {
        mvc.perform(get("/api/v1/audit-logs").header("Authorization", "Bearer valid"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void returnsExplicitPageContractAndVietnamTimestamp() throws Exception {
        var event = new AuditLogResponse(1L, 7L, 42L, SystemRole.OWNER, AuditAction.SALE_VOIDED,
                "SALE", 15L, "SUCCESS", "Returned", "server-request-id", "void-key",
                Map.of("refundedVnd", 40_000), OffsetDateTime.parse("2026-10-01T14:30:00Z"));
        when(service.list(any(), eq("7"), eq(AuditAction.SALE_VOIDED), eq(15L), any(), any(), eq(0), eq(20)))
                .thenReturn(new AuditLogPageResponse(List.of(event), 0, 20, 1, 1));
        mvc.perform(get("/api/v1/audit-logs").header("Authorization", "Bearer valid").header("X-Shop-Id", "7")
                        .param("action", "SALE_VOIDED").param("entityId", "15"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].action").value("SALE_VOIDED"))
                .andExpect(jsonPath("$.content[0].createdAt").value("2026-10-01T21:30:00+07:00"))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void unknownActionAndMalformedTimeAreRejected() throws Exception {
        for (String[] param : new String[][] { { "action", "ANYTHING" }, { "from", "not-a-date" },
                { "entityId", "abc" }, { "page", "first" } }) {
            mvc.perform(get("/api/v1/audit-logs").header("Authorization", "Bearer valid").header("X-Shop-Id", "7")
                            .param(param[0], param[1]))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("validation_failed"))
                    .andExpect(jsonPath("$.details[0].field").value(param[0]))
                    .andExpect(jsonPath("$.traceId").isNotEmpty());
        }
        verifyNoInteractions(service);
    }

    @Test
    void noCreateUpdateOrDeleteAuditApiExists() throws Exception {
        mvc.perform(post("/api/v1/audit-logs").header("Authorization", "Bearer valid"))
                .andExpect(status().isMethodNotAllowed());
        mvc.perform(patch("/api/v1/audit-logs").header("Authorization", "Bearer valid"))
                .andExpect(status().isMethodNotAllowed());
        mvc.perform(delete("/api/v1/audit-logs").header("Authorization", "Bearer valid"))
                .andExpect(status().isMethodNotAllowed());
        verifyNoInteractions(service);
    }
}
