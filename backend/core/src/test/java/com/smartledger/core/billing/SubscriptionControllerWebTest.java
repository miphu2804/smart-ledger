package com.smartledger.core.billing;

import static org.mockito.ArgumentMatchers.any;
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
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(SubscriptionController.class)
@Import({SecurityConfiguration.class, TimeConfiguration.class, BearerTokenAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class, ApiExceptionHandler.class})
class SubscriptionControllerWebTest {
    @Autowired MockMvc mvc;
    @MockitoBean FirebaseTokenVerifier verifier;
    @MockitoBean SubscriptionService service;

    @Test void bothRoutesRequireFirebaseAndExposeNoPublicMutation() throws Exception {
        for (String path : new String[]{"/api/v1/billing/subscription", "/api/v1/agent/quota"}) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
            mvc.perform(post(path)).andExpect(status().isUnauthorized());
        }
        verifyNoInteractions(service);
    }

    @Test void readsNeedNoShopReturnNoStoreAndExplicitlyDiscloseUnenforcedQuota() throws Exception {
        when(verifier.verify("valid")).thenReturn(new VerifiedFirebaseToken("owner", null, false, null, null, null));
        var start = OffsetDateTime.parse("2027-01-31T03:04:05Z");
        when(service.subscription(any())).thenReturn(new SubscriptionResponse("FULL", "FULL_MONTHLY", "OWNER", "ACTIVE",
                start, start.plusMonths(1), start, "MANUAL"));
        when(service.quota(any())).thenReturn(new QuotaResponse("FULL", 300, 297, 2, 1, start, start.plusDays(7),
                start.plusDays(7), start.plusMonths(1), false));
        mvc.perform(get("/api/v1/billing/subscription").header("Authorization", "Bearer valid"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.scope").value("OWNER"))
                .andExpect(jsonPath("$.activatedAt").value("2027-01-31T10:04:05+07:00"));
        mvc.perform(get("/api/v1/agent/quota").header("Authorization", "Bearer valid"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.remaining").value(1)).andExpect(jsonPath("$.enforcementEnabled").value(false));
        when(service.quota(any())).thenThrow(new BusinessException(ErrorCode.BILLING_UNAVAILABLE));
        mvc.perform(get("/api/v1/agent/quota").header("Authorization", "Bearer valid"))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("billing_unavailable"));
    }
}
