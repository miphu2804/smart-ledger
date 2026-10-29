package com.smartledger.core.activity;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.config.UserDailyActivityConfiguration;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerificationException;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.time.LocalDate;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.*;

/** Exercises the real security filter and production interceptor registration, including async redispatch. */
@WebMvcTest(controllers = UserDailyActivityWebTest.ProbeController.class,
        properties = "smartledger.user-activity.enabled=true")
@Import({UserDailyActivityConfiguration.class, SecurityConfiguration.class, BearerTokenAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class, UserDailyActivityWebTest.ProbeController.class})
class UserDailyActivityWebTest {
    @Autowired private MockMvc mvc;
    @MockitoBean private FirebaseTokenVerifier verifier;
    @MockitoBean private UserDailyActivityService activity;
    @MockitoBean private UserDailyActivityRepository repository;
    private final LocalDate date = LocalDate.of(2026, 10, 29);

    @BeforeEach
    void setup() {
        when(verifier.verify("good")).thenReturn(new VerifiedFirebaseToken("verified-uid", null, false, null, null, null));
        when(verifier.verify("bad")).thenThrow(new FirebaseTokenVerificationException("invalid", null));
        when(activity.today()).thenReturn(date);
    }

    @ParameterizedTest
    @ValueSource(ints = {200, 204, 302})
    void successfulReadCountsServerVerifiedIdentity(int status) throws Exception {
        mvc.perform(get("/api/v1/activity-test/" + status).header("Authorization", "Bearer good")
                .header("X-User-Id", "9999")).andExpect(status().is(status));
        verify(activity).record("verified-uid", date);
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 401, 403, 404, 500, 503})
    void downstreamRejectionNeverCounts(int status) throws Exception {
        mvc.perform(get("/api/v1/activity-test/" + status).header("Authorization", "Bearer good"))
                .andExpect(status().is(status));
        verify(activity, never()).record(any(), any());
    }

    @Test
    void missingOrInvalidTokenNeverCounts() throws Exception {
        mvc.perform(get("/api/v1/activity-test/200")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/activity-test/200").header("Authorization", "Bearer bad"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(activity);
    }

    @Test
    void publicCallbackAndHealthWithValidBearerDoNotCount() throws Exception {
        mvc.perform(get("/api/v1/auth/zalo/callback").header("Authorization", "Bearer good"))
                .andExpect(status().isOk());
        mvc.perform(get("/actuator/health").header("Authorization", "Bearer good"))
                .andExpect(status().isOk());
        verifyNoInteractions(activity);
    }

    @ParameterizedTest
    @ValueSource(ints = {200, 401, 500})
    void asyncCountsOnlyAfterFinalSuccessfulDispatch(int status) throws Exception {
        var result = mvc.perform(get("/api/v1/activity-test/async/" + status)
                        .header("Authorization", "Bearer good"))
                .andExpect(request().asyncStarted()).andReturn();
        verify(activity, never()).record(any(), any());
        mvc.perform(asyncDispatch(result)).andExpect(status().is(status));
        verify(activity, times(status == 200 ? 1 : 0)).record("verified-uid", date);
    }

    @RestController
    static class ProbeController {
        @GetMapping("/api/v1/activity-test/{status}")
        ResponseEntity<Void> read(@PathVariable int status) { return ResponseEntity.status(status).build(); }
        @GetMapping("/api/v1/activity-test/async/{status}")
        Callable<ResponseEntity<Void>> async(@PathVariable int status) {
            return () -> ResponseEntity.status(status).build();
        }
        @GetMapping({"/api/v1/auth/zalo/callback", "/actuator/health"})
        ResponseEntity<Void> publicRead() { return ResponseEntity.ok().build(); }
    }
}
