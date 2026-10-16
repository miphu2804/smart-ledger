package com.smartledger.core.controller;

import com.smartledger.core.dto.request.ZaloProofRequest;
import com.smartledger.core.dto.response.ZaloExchangeResponse;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ZaloAuthService;
import com.smartledger.core.service.ZaloNativeAuthService;
import com.smartledger.core.service.impl.ZaloAuthServiceImpl;
import com.smartledger.core.zalo.ZaloCallbackPage;
import com.smartledger.core.zalo.ZaloNativePage;
import com.smartledger.core.zalo.ZaloPurpose;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.Parameters;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.Arrays;
import java.util.Collections;
import java.util.Set;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth/zalo")
@Tag(name = "Zalo authentication", description = "Web popup flow; disabled until its schema and runtime configuration are ready")
@SecurityRequirements
public class ZaloAuthController {
    private final ZaloAuthService service;
    private final ZaloCallbackPage page;
    private final ZaloNativeAuthService nativeService;
    private final ZaloNativePage nativePage;
    public ZaloAuthController(ZaloAuthService service, ZaloCallbackPage page,
            ZaloNativeAuthService nativeService, ZaloNativePage nativePage) {
        this.service = service; this.page = page; this.nativeService = nativeService; this.nativePage = nativePage;
    }

    @GetMapping("/authorize")
    @Parameters({
        @Parameter(name = "purpose", in = ParameterIn.QUERY, required = true,
                schema = @Schema(allowableValues = {"LOGIN", "LINK"})),
        @Parameter(name = "clientOrigin", in = ParameterIn.QUERY, required = true,
                description = "Exact configured HTTPS frontend origin"),
        @Parameter(name = "requestId", in = ParameterIn.QUERY, required = true,
                schema = @Schema(pattern = "[A-Za-z0-9_-]{16,100}")),
        @Parameter(name = "clientChallenge", in = ParameterIn.QUERY, required = true,
                schema = @Schema(pattern = "[A-Za-z0-9_-]{43}"))
    })
    @ApiResponse(responseCode = "302", description = "Redirect to Zalo; browser-bound host cookie set")
    @Operation(summary = "Start a browser-bound Zalo LOGIN or LINK popup",
            description = "Anonymous. Query: purpose=LOGIN|LINK, clientOrigin=exact configured HTTPS origin, "
                    + "requestId=16-100 URL-safe characters, clientChallenge=SHA-256 base64url of a client-held 43-character verifier. "
                    + "Returns 302 and Secure HttpOnly SameSite=Lax cookie. Does not accept target UID or tokens.")
    public ResponseEntity<Void> authorize(@Parameter(hidden = true) @RequestParam MultiValueMap<String, String> params) {
        singleParameters(params, Set.of("purpose", "clientOrigin", "requestId", "clientChallenge"));
        ZaloPurpose purpose;
        try { purpose = ZaloPurpose.valueOf(params.getFirst("purpose")); }
        catch (IllegalArgumentException | NullPointerException failure) { throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST); }
        var result = service.authorize(purpose, params.getFirst("clientOrigin"), params.getFirst("requestId"), params.getFirst("clientChallenge"));
        return ResponseEntity.status(302).header(HttpHeaders.LOCATION, result.authorizationUrl())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("Referrer-Policy", "no-referrer")
                .header(HttpHeaders.SET_COOKIE, cookie(result.cookieName(), result.cookieValue(), result.maxAge())).build();
    }

    @GetMapping(value = "/callback", produces = MediaType.TEXT_HTML_VALUE)
    @Parameters({
        @Parameter(name = "state", in = ParameterIn.QUERY, required = true,
                schema = @Schema(pattern = "[A-Za-z0-9_-]{43}")),
        @Parameter(name = "code", in = ParameterIn.QUERY, description = "Provider code, mutually exclusive with error"),
        @Parameter(name = "error", in = ParameterIn.QUERY, description = "Consent failure, mutually exclusive with code"),
        @Parameter(name = "code_challenge", in = ParameterIn.QUERY, description = "Optional provider PKCE challenge")
    })
    @ApiResponse(responseCode = "200", description = "Nonce-protected popup handoff, not login success by itself",
            content = @Content(mediaType = MediaType.TEXT_HTML_VALUE, schema = @Schema(type = "string")))
    @ApiResponse(responseCode = "302", description = "ANDROID session only: fixed App Link with verifier-bound handoff reference in fragment")
    @Operation(summary = "Receive Zalo callback in the browser that started the flow",
            description = "Provider callback only. Dispatches using persisted WEB/ANDROID channel, never input mode/return URL. "
                    + "WEB returns a nonce-protected popup message to the exact originating frontend; validate message origin/source/requestId/purpose. "
                    + "ANDROID redirects to the fixed HTTPS return target with only verifier-bound handoffReference and request metadata in fragment, never provider/Firebase tokens.")
    public ResponseEntity<String> callback(@Parameter(hidden = true) @RequestParam MultiValueMap<String, String> params, HttpServletRequest request) {
        singleParameters(params, Set.of("state", "code", "error", "code_challenge"));
        String state = params.getFirst("state");
        if (state == null || !state.matches("[A-Za-z0-9_-]{43}")) throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
        String name = ZaloAuthServiceImpl.cookieName(state);
        var matching = request.getCookies() == null ? java.util.List.<Cookie>of()
                : Arrays.stream(request.getCookies()).filter(cookie -> name.equals(cookie.getName())).toList();
        if (matching.size() != 1) throw new BusinessException(ErrorCode.ZALO_SESSION_INVALID);
        if (nativeService.isNativeCallback(state)) {
            return nativePage.callback(nativeService.callback(state, params.getFirst("code"), params.getFirst("error"),
                    params.getFirst("code_challenge"), matching.getFirst().getValue()), cookie(name, "", 0));
        }
        var result = service.callback(state, params.getFirst("code"), params.getFirst("error"),
                params.getFirst("code_challenge"), matching.getFirst().getValue());
        return page.render(result, cookie(name, "", 0));
    }

    @PostMapping(value = "/exchange", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Parameter(name = "Origin", in = ParameterIn.HEADER, required = true, description = "Exact initiating client origin")
    @Operation(summary = "Exchange a LOGIN proof for a Firebase custom token",
            description = "Anonymous, exact Origin required. Proof and clientVerifier are one-time body credentials. "
                    + "Use the result with Firebase signInWithCustomToken, then send its ID token to /auth/session. Never log the result.")
    public ZaloExchangeResponse exchange(@Valid @RequestBody ZaloProofRequest body, HttpServletRequest request, HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        return service.exchange(body, origin(request));
    }

    @PostMapping(value = "/link", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Parameter(name = "Origin", in = ParameterIn.HEADER, required = true, description = "Exact initiating client origin")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponse(responseCode = "204", description = "Identity linked; no token minted")
    @Operation(summary = "Link Zalo to the authenticated existing OWNER",
            description = "Requires a LINK proof and Firebase ID token with auth_time within 5 minutes, checked for revocation. "
                    + "The UID comes only from that token; conflicting existing identities return 409 and are never moved.")
    public ResponseEntity<Void> link(@Valid @RequestBody ZaloProofRequest body,
            @AuthenticationPrincipal VerifiedFirebaseToken principal, HttpServletRequest request) {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        String rawToken = authorization != null && authorization.length() > 7 ? authorization.substring(7).trim() : null;
        service.link(body, origin(request), principal, rawToken);
        return ResponseEntity.noContent().header(HttpHeaders.CACHE_CONTROL, "no-store").build();
    }

    static String cookie(String name, String value, int seconds) {
        return ResponseCookie.from(name, value).secure(true).httpOnly(true).sameSite("Lax").path("/").maxAge(seconds).build().toString();
    }

    private static String origin(HttpServletRequest request) {
        var origins = Collections.list(request.getHeaders("Origin"));
        if (origins.size() != 1) throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
        return origins.getFirst();
    }

    static void singleParameters(MultiValueMap<String, String> params, Set<String> allowed) {
        if (!allowed.containsAll(params.keySet()) || params.values().stream().anyMatch(values -> values.size() != 1)) {
            throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
        }
    }
}
