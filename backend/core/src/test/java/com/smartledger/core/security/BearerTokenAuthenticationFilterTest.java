package com.smartledger.core.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

class BearerTokenAuthenticationFilterTest {

    private final FirebaseTokenVerifier verifier = mock(FirebaseTokenVerifier.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final BearerTokenAuthenticationFilter filter = new BearerTokenAuthenticationFilter(
            verifier,
            new RestAuthenticationEntryPoint(objectMapper));

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void continuesUnauthenticatedWhenBearerHeaderIsMissing() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<Boolean> chainCalled = new AtomicReference<>(false);

        filter.doFilter(request, response, (ignoredRequest, ignoredResponse) -> chainCalled.set(true));

        assertThat(chainCalled).hasValue(true);
        verify(verifier, never()).verify(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void returns401ForMalformedAuthorizationHeader() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HttpHeaders.AUTHORIZATION, "Basic credentials");
        request.addHeader("X-Trace-Id", "trace-123");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (ignoredRequest, ignoredResponse) -> {
            throw new AssertionError("filter chain must not run");
        });

        JsonNode error = objectMapper.readTree(response.getContentAsByteArray());
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(error.path("code").asText()).isEqualTo("unauthorized");
        assertThat(error.path("traceId").asText()).isEqualTo("trace-123");
        verify(verifier, never()).verify(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void returns401WhenFirebaseRejectsBearerToken() throws Exception {
        when(verifier.verify("invalid-token"))
                .thenThrow(new FirebaseTokenVerificationException("rejected", null));
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer invalid-token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (ignoredRequest, ignoredResponse) -> {
            throw new AssertionError("filter chain must not run");
        });

        assertThat(response.getStatus()).isEqualTo(401);
        verify(verifier).verify("invalid-token");
    }

    @Test
    void exposesOnlyVerifiedIdentityDuringRequest() throws Exception {
        when(verifier.verify("valid-token"))
                .thenReturn(new VerifiedFirebaseToken(
                        "firebase-uid",
                        "owner@example.test",
                        true,
                        "+84901234567",
                        "Thao",
                        "https://example.test/avatar.png"));
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer valid-token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<Authentication> authenticated = new AtomicReference<>();

        filter.doFilter(request, response, (ignoredRequest, ignoredResponse) ->
                authenticated.set(SecurityContextHolder.getContext().getAuthentication()));

        assertThat(authenticated.get()).isInstanceOf(FirebaseAuthenticationToken.class);
        FirebaseAuthenticationToken token = (FirebaseAuthenticationToken) authenticated.get();
        assertThat(token.getPrincipal().uid()).isEqualTo("firebase-uid");
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }
}
