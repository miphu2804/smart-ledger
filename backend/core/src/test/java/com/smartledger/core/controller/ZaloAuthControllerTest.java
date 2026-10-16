package com.smartledger.core.controller;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.dto.request.ZaloProofRequest;
import com.smartledger.core.dto.response.ZaloExchangeResponse;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.ApiExceptionHandler;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ZaloAuthService;
import com.smartledger.core.zalo.*;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(value = ZaloAuthController.class, properties = "smartledger.cors.allowed-origins=https://owner.example.test")
@Import({SecurityConfiguration.class, BearerTokenAuthenticationFilter.class, RestAuthenticationEntryPoint.class,
        ApiExceptionHandler.class, ZaloCallbackPage.class, ZaloRequestLimiter.class})
class ZaloAuthControllerTest {
    private static final String ORIGIN = "https://owner.example.test";
    private static final String STATE = "s".repeat(43);
    private static final String PROOF = "p".repeat(43);
    private static final String VERIFIER = "v".repeat(43);
    private static final String BINDING = "b".repeat(43);
    @Autowired private MockMvc mvc;
    @MockitoBean private ZaloAuthService service;
    @MockitoBean private FirebaseTokenVerifier tokenVerifier;

    @Test
    void onlyIntendedPublicMethodsAreAnonymousAndLinkStillNeedsBearer() throws Exception {
        mvc.perform(post("/api/v1/auth/zalo/link").contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/session")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/zalo/authorize")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/auth/zalo/exchange")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/auth/zalo/unknown")).andExpect(status().isUnauthorized());
        verifyNoInteractions(service, tokenVerifier);
    }

    @Test
    void anonymousAuthorizeSetsOnlyAHostScopedSecureHttpOnlyLaxCookieAndRedirects() throws Exception {
        when(service.authorize(eq(ZaloPurpose.LOGIN), eq(ORIGIN), eq("request-1234567890"), anyString()))
                .thenReturn(new ZaloAuthorizationResult("https://oauth.zaloapp.com/v4/permission?state=synthetic", cookieName(), BINDING, 300));
        mvc.perform(get("/api/v1/auth/zalo/authorize").param("purpose", "LOGIN")
                        .param("clientOrigin", ORIGIN).param("requestId", "request-1234567890")
                        .param("clientChallenge", ZaloCrypto.hash(VERIFIER)))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", containsString("https://oauth.zaloapp.com/")))
                .andExpect(header().string("Set-Cookie", containsString("Secure")))
                .andExpect(header().string("Set-Cookie", containsString("HttpOnly")))
                .andExpect(header().string("Set-Cookie", containsString("SameSite=Lax")))
                .andExpect(header().string("Set-Cookie", containsString("Path=/")))
                .andExpect(header().string("Set-Cookie", not(containsString("Domain="))))
                .andExpect(header().string("Cache-Control", containsString("no-store")));
        verifyNoInteractions(tokenVerifier);
    }

    @Test
    void disabledFeatureIsReadableWithoutAuthentication() throws Exception {
        when(service.authorize(any(), any(), any(), any())).thenThrow(new BusinessException(ErrorCode.ZALO_UNAVAILABLE));
        mvc.perform(get("/api/v1/auth/zalo/authorize").param("purpose", "LOGIN").param("clientOrigin", ORIGIN)
                        .param("requestId", "request-1234567890").param("clientChallenge", ZaloCrypto.hash(VERIFIER)))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("zalo_unavailable"));
    }

    @Test
    void duplicateOrUnknownAuthorizationParametersAreRejectedBeforeService() throws Exception {
        mvc.perform(get("/api/v1/auth/zalo/authorize").param("purpose", "LOGIN", "LINK"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/auth/zalo/authorize").param("purpose", "LOGIN").param("firebaseUid", "attacker"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void callbackProducesAnExactOriginNonceProtectedMessageWithoutTokenOrCode() throws Exception {
        when(service.callback(STATE, "sensitive-provider-code", null, null, BINDING))
                .thenReturn(new ZaloCallbackResult(ORIGIN, "request-1234567890", ZaloPurpose.LOGIN, PROOF, null, cookieName()));
        mvc.perform(get("/api/v1/auth/zalo/callback").param("state", STATE).param("code", "sensitive-provider-code")
                        .cookie(new Cookie(cookieName(), BINDING)))
                .andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(containsString("postMessage")))
                .andExpect(content().string(containsString(ORIGIN)))
                .andExpect(content().string(not(containsString("sensitive-provider-code"))))
                .andExpect(content().string(not(containsString("firebaseCustomToken"))))
                .andExpect(content().string(not(containsString("access_token"))))
                .andExpect(header().string("Content-Security-Policy", containsString("script-src 'nonce-")))
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().string("Set-Cookie", containsString("Max-Age=0")))
                .andExpect(header().doesNotExist("Location"));
    }

    @Test
    void callbackRejectsDuplicateStateCodeAndCookiesBeforeProviderService() throws Exception {
        mvc.perform(get("/api/v1/auth/zalo/callback").param("state", STATE, STATE).param("code", "one"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/auth/zalo/callback").param("state", STATE).param("code", "one", "two"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/auth/zalo/callback").param("state", STATE).param("code", "one")
                        .cookie(new Cookie(cookieName(), BINDING), new Cookie(cookieName(), BINDING)))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void exchangeRequiresJsonAndOriginAndReturnsNoCacheBodyNotRedirect() throws Exception {
        when(service.exchange(any(ZaloProofRequest.class), eq(ORIGIN)))
                .thenReturn(new ZaloExchangeResponse("synthetic-custom-token", "Name hint"));
        mvc.perform(post("/api/v1/auth/zalo/exchange").header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.firebaseCustomToken").value("synthetic-custom-token"))
                .andExpect(jsonPath("$.displayName").value("Name hint"))
                .andExpect(jsonPath("$.providerSubject").doesNotExist())
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(header().doesNotExist("Location"));
        mvc.perform(post("/api/v1/auth/zalo/exchange").contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void exchangeRejectsUnexpectedBodyFieldsAndInvalidLengths() throws Exception {
        mvc.perform(post("/api/v1/auth/zalo/exchange").header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"proof\":\"short\",\"clientVerifier\":\"short\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
        mvc.perform(post("/api/v1/auth/zalo/exchange").header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                        .content(body().replace("}", ",\"firebaseUid\":\"attacker\"}")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"));
        verifyNoInteractions(service);
    }

    @Test
    void malformedJsonRetainsTheSharedInvalidRequestCode() throws Exception {
        mvc.perform(post("/api/v1/auth/zalo/exchange").header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"proof\":"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_request"));
        verifyNoInteractions(service);
    }

    @Test
    void linkUsesVerifiedPrincipalAndRawBearerOnlyAsFreshReauthenticationProof() throws Exception {
        var principal = new VerifiedFirebaseToken("owner", null, false, null, null, null);
        when(tokenVerifier.verify("fresh-token")).thenReturn(principal);
        mvc.perform(post("/api/v1/auth/zalo/link").header("Origin", ORIGIN)
                        .header("Authorization", "Bearer fresh-token").contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isNoContent()).andExpect(header().string("Cache-Control", containsString("no-store")));
        verify(service).link(eq(new ZaloProofRequest(PROOF, VERIFIER)), eq(ORIGIN), eq(principal), eq("fresh-token"));
    }

    @Test
    void corsPreflightRemainsExactAndDoesNotEnableCrossOriginCookies() throws Exception {
        mvc.perform(options("/api/v1/auth/zalo/exchange").header("Origin", ORIGIN)
                        .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", ORIGIN))
                .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
        mvc.perform(post("/api/v1/auth/zalo/exchange").header("Origin", "https://evil.example.test")
                        .contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service, tokenVerifier);
    }

    private static String cookieName() { return "__Host-sl_zalo_" + ZaloCrypto.hash(STATE).substring(0, 16); }
    private static String body() { return "{\"proof\":\"" + PROOF + "\",\"clientVerifier\":\"" + VERIFIER + "\"}"; }
}
