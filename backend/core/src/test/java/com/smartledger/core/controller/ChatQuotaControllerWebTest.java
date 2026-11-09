package com.smartledger.core.controller;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.smartledger.core.billing.ChatQuotaExceeded;
import com.smartledger.core.billing.ChatQuotaService;
import com.smartledger.core.billing.ChatTurnPending;
import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.exception.ApiExceptionHandler;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AgentService;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = AgentController.class, properties = "smartledger.ai-quota.enabled=true")
@Import({SecurityConfiguration.class, BearerTokenAuthenticationFilter.class, RestAuthenticationEntryPoint.class, ApiExceptionHandler.class})
class ChatQuotaControllerWebTest {
    @Autowired MockMvc mvc;
    @MockitoBean AgentService legacy;
    @MockitoBean ChatQuotaService quota;
    @MockitoBean FirebaseTokenVerifier verifier;
    @BeforeEach void setup() { when(verifier.verify("valid")).thenReturn(new VerifiedFirebaseToken("owner", null, false, null, null, null)); }

    @Test void pendingIsJsonWithRetryAfterBeforeEitherStreamOrJsonHeaders() throws Exception {
        UUID id = UUID.randomUUID();
        when(quota.chat(any(), any(), any(), any())).thenThrow(new ChatTurnPending(id));
        when(quota.stream(any(), any(), any(), any())).thenThrow(new ChatTurnPending(id));
        for (String path : new String[]{"/api/v1/agent/chat", "/api/v1/agent/chat/stream"}) {
            mvc.perform(post(path).header("Authorization", "Bearer valid").header("X-Shop-Id", "7")
                            .header("Idempotency-Key", "same-key").contentType(MediaType.APPLICATION_JSON)
                            .accept("text/event-stream", "application/json").content("{\"message\":\"q\"}"))
                    .andExpect(status().isAccepted()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                    .andExpect(header().string("Retry-After", "2")).andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(jsonPath("$.turnId").value(id.toString())).andExpect(jsonPath("$.status").value("PENDING"));
        }
        verifyNoInteractions(legacy);
    }

    @Test void exhaustedQuotaKeepsExistingErrorEnvelopeAndDoesNotStartSse() throws Exception {
        var now = OffsetDateTime.parse("2027-01-31T00:00:00Z");
        when(quota.stream(any(), any(), any(), any())).thenThrow(new ChatQuotaExceeded(now, now.plusSeconds(10)));
        mvc.perform(post("/api/v1/agent/chat/stream").header("Authorization", "Bearer valid").header("X-Shop-Id", "7")
                        .header("Idempotency-Key", "key").contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"q\"}"))
                .andExpect(status().isTooManyRequests()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(header().string("Retry-After", "10")).andExpect(jsonPath("$.code").value("ai_quota_exhausted"))
                .andExpect(jsonPath("$.traceId").isNotEmpty()).andExpect(jsonPath("$.details[0].field").value("nextAvailableAt"));
        verifyNoInteractions(legacy);
    }

    @Test void authAndBodyValidationStillHappenBeforeQuotaOrLegacyWork() throws Exception {
        mvc.perform(post("/api/v1/agent/chat").contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"q\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/agent/chat").header("Authorization", "Bearer valid").header("X-Shop-Id", "7")
                        .header("Idempotency-Key", "key").contentType(MediaType.APPLICATION_JSON).content("{\"message\":\" \"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(legacy, quota);
    }
}
