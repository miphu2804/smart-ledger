package com.smartledger.core.controller;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.smartledger.core.config.*;
import com.smartledger.core.dto.request.ZaloNativeHandoffRequest;
import com.smartledger.core.dto.response.ZaloExchangeResponse;
import com.smartledger.core.exception.*;
import com.smartledger.core.security.*;
import com.smartledger.core.service.*;
import com.smartledger.core.service.impl.ZaloAuthServiceImpl;
import com.smartledger.core.zalo.*;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(value = {ZaloNativeAuthController.class, ZaloAuthController.class}, properties = {
        "smartledger.cors.allowed-origins=https://owner.example.test",
        "zalo.callback-url=https://core.example.test/api/v1/auth/zalo/callback",
        "zalo.native.client-id=android-staging", "zalo.native.return-target-id=core-staging",
        "zalo.native.return-url=https://core.example.test/mobile/auth/zalo/complete",
        "zalo.native.certificate-sha256=FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C"})
@Import({SecurityConfiguration.class, ZaloConfiguration.class, ZaloCallbackPage.class, ZaloNativePage.class,
        BearerTokenAuthenticationFilter.class, RestAuthenticationEntryPoint.class, ApiExceptionHandler.class, ZaloRequestLimiter.class})
class ZaloNativeAuthControllerTest {
    private static final String BASE = "/api/v1/auth/zalo/native/";
    private static final String STATE = "s".repeat(43), REFERENCE = "r".repeat(43), VERIFIER = "v".repeat(43), BINDING = "b".repeat(43);
    private static final String REQUEST = "request-1234567890";
    private static final String RETURN = "https://core.example.test/mobile/auth/zalo/complete";
    @Autowired private MockMvc mvc;
    @MockitoBean private ZaloNativeAuthService nativeService;
    @MockitoBean private ZaloAuthService web;
    @MockitoBean private FirebaseTokenVerifier verifier;

    @Test
    void nativeAuthorizeSetsBrowserCookieWithoutFakeOriginOrArbitraryTarget() throws Exception {
        when(nativeService.authorize(eq("android-staging"), eq(ZaloPurpose.LOGIN), eq(REQUEST), anyString()))
                .thenReturn(new ZaloAuthorizationResult("https://oauth.zaloapp.com/v4/permission?state=synthetic", cookieName(), BINDING, 300));
        mvc.perform(get(BASE + "authorize").param("nativeClientId", "android-staging").param("purpose", "LOGIN")
                .param("requestId", REQUEST).param("clientChallenge", ZaloCrypto.hash(VERIFIER)))
                .andExpect(status().isFound()).andExpect(header().string("Set-Cookie", allOf(containsString("Secure"), containsString("HttpOnly"), containsString("SameSite=Lax"), not(containsString("Domain=")))))
                .andExpect(header().string("Cache-Control", containsString("no-store")));
        verifyNoInteractions(web, verifier);
    }

    @Test
    void unknownDuplicateAndUntrustedReturnParametersAreRejected() throws Exception {
        mvc.perform(get(BASE + "authorize").param("purpose", "LOGIN").param("returnUrl", "https://evil.test"))
                .andExpect(status().isBadRequest());
        mvc.perform(get(BASE + "authorize").param("purpose", "LOGIN", "LINK")).andExpect(status().isBadRequest());
        mvc.perform(get(BASE + "authorize").param("purpose", "OTHER")).andExpect(status().isBadRequest());
        verifyNoInteractions(nativeService, web, verifier);
    }

    @Test
    void exchangeNeedsBodyVerifierButNoOriginWhileLinkStillRequiresBearer() throws Exception {
        when(nativeService.exchange(any())).thenReturn(new ZaloExchangeResponse("synthetic-custom-token", "Owner"));
        mvc.perform(post(BASE + "exchange").contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.firebaseCustomToken").value("synthetic-custom-token"))
                .andExpect(header().string("Cache-Control", containsString("no-store"))).andExpect(header().doesNotExist("Location"));
        mvc.perform(post(BASE + "link").contentType(MediaType.APPLICATION_JSON).content(body())).andExpect(status().isUnauthorized());
        verify(nativeService).exchange(new ZaloNativeHandoffRequest("android-staging", REQUEST, REFERENCE, VERIFIER));
        verifyNoInteractions(web, verifier);
    }

    @Test
    void linkPassesOnlyVerifiedPrincipalAndRawBearerAndReturnsNoToken() throws Exception {
        var principal = new VerifiedFirebaseToken("owner", null, false, null, null, null);
        when(verifier.verify("id-token")).thenReturn(principal);
        mvc.perform(post(BASE + "link").header("Authorization", "Bearer id-token").contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isNoContent()).andExpect(content().string(""));
        verify(nativeService).link(any(), eq(principal), eq("id-token"));
    }

    @Test
    void malformedOrExtraBodyFieldsFailBeforeServiceAndWebCorsRemainsClosed() throws Exception {
        mvc.perform(post(BASE + "exchange").contentType(MediaType.APPLICATION_JSON).content(body().replace("\"nativeClientId\"", "\"firebaseUid\":\"attacker\",\"nativeClientId\"")))
                .andExpect(status().isBadRequest());
        mvc.perform(post(BASE + "exchange").contentType(MediaType.APPLICATION_JSON).content(body().replace(VERIFIER, "short"))).andExpect(status().isBadRequest());
        mvc.perform(post(BASE + "exchange").header("Origin", "https://evil.test").contentType(MediaType.APPLICATION_JSON).content(body())).andExpect(status().isForbidden());
        mvc.perform(post(BASE + "exchange").contentType(MediaType.APPLICATION_JSON).content("x".repeat(8193))).andExpect(status().isPayloadTooLarge());
        verifyNoInteractions(nativeService, web, verifier);
    }

    @Test
    void callbackDispatchesUsingStoredChannelAndOnlyForwardsReferenceInFragment() throws Exception {
        when(nativeService.isNativeCallback(STATE)).thenReturn(true);
        when(nativeService.callback(STATE, "private-provider-code", null, null, BINDING))
                .thenReturn(new ZaloNativeCallbackResult(RETURN, "android-staging", REQUEST, ZaloPurpose.LOGIN, REFERENCE, null));
        mvc.perform(get("/api/v1/auth/zalo/callback").param("state", STATE).param("code", "private-provider-code").cookie(new Cookie(cookieName(), BINDING)))
                .andExpect(status().isFound()).andExpect(header().string("Location", RETURN + "#nativeClientId=android-staging&requestId=" + REQUEST + "&purpose=LOGIN&handoffReference=" + REFERENCE))
                .andExpect(header().string("Referrer-Policy", "no-referrer")).andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(header().string("Set-Cookie", containsString("Max-Age=0")))
                .andExpect(content().string(allOf(not(containsString("private-provider-code")), not(containsString(VERIFIER)), not(containsString("firebaseCustomToken")), not(containsString("postMessage")))));
        verifyNoInteractions(web, verifier);
    }

    @Test
    void untrustedCallbackParametersAndMissingCookieCannotDispatch() throws Exception {
        mvc.perform(get("/api/v1/auth/zalo/callback").param("state", STATE).param("code", "provider-code").cookie(new Cookie(cookieName(), BINDING))
                .param("returnUrl", "https://evil.test")).andExpect(status().isBadRequest()).andExpect(header().doesNotExist("Location"));
        mvc.perform(get("/api/v1/auth/zalo/callback").param("state", STATE).param("code", "provider-code"))
                .andExpect(status().isBadRequest()).andExpect(header().doesNotExist("Location"));
        verifyNoInteractions(nativeService, web, verifier);
    }

    @Test
    void associationAndFallbackAreExactPublicGetRoutesAndNeverExposeProductionCertificate() throws Exception {
        mvc.perform(get("/.well-known/assetlinks.json")).andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$[0].target.package_name").value("vn.teamhexa.songheloi"))
                .andExpect(jsonPath("$[0].target.sha256_cert_fingerprints.length()").value(1))
                .andExpect(content().string(not(containsString("87:2C:CC:33")))).andExpect(header().doesNotExist("Location"));
        mvc.perform(get("/mobile/auth/zalo/complete")).andExpect(status().isOk())
                .andExpect(header().string("Content-Security-Policy", containsString("script-src 'nonce-")))
                .andExpect(header().string("Referrer-Policy", "no-referrer")).andExpect(content().string(containsString("history.replaceState")));
        for (String path : new String[]{"/.well-known/other.json", "/mobile/auth/zalo/complete/extra", BASE + "link", BASE + "exchange"}) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/.well-known/assetlinks.json")).andExpect(status().isUnauthorized());
        mvc.perform(post(BASE + "authorize")).andExpect(status().isUnauthorized());
        verifyNoInteractions(nativeService, web, verifier);
    }
    private static String cookieName() { return ZaloAuthServiceImpl.cookieName(STATE); }
    private static String body() { return "{\"nativeClientId\":\"android-staging\",\"requestId\":\"" + REQUEST + "\",\"handoffReference\":\"" + REFERENCE + "\",\"clientVerifier\":\"" + VERIFIER + "\"}"; }
}
