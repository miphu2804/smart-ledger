package com.smartledger.core.controller;

import com.smartledger.core.config.ZaloNativeProperties;
import com.smartledger.core.dto.request.ZaloNativeHandoffRequest;
import com.smartledger.core.dto.response.ZaloExchangeResponse;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ZaloNativeAuthService;
import com.smartledger.core.zalo.ZaloNativePage;
import com.smartledger.core.zalo.ZaloPurpose;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.Parameters;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@SecurityRequirements
@Tag(name = "Zalo Android authentication", description = "External browser + verified HTTPS App Links; requires V18 and explicit environment enablement")
public class ZaloNativeAuthController {
    private final ZaloNativeAuthService service;
    private final ZaloNativePage page;
    public ZaloNativeAuthController(ZaloNativeAuthService service, ZaloNativePage page) { this.service = service; this.page = page; }

    @GetMapping("/api/v1/auth/zalo/native/authorize")
    @Parameters({
        @Parameter(name = "nativeClientId", in = ParameterIn.QUERY, required = true, description = "Public configured Android client ID; not a secret"),
        @Parameter(name = "purpose", in = ParameterIn.QUERY, required = true, schema = @Schema(allowableValues = {"LOGIN", "LINK"})),
        @Parameter(name = "requestId", in = ParameterIn.QUERY, required = true, schema = @Schema(pattern = "[A-Za-z0-9_-]{16,100}")),
        @Parameter(name = "clientChallenge", in = ParameterIn.QUERY, required = true, schema = @Schema(pattern = "[A-Za-z0-9_-]{43}"))
    })
    @ApiResponse(responseCode = "302", description = "Browser-bound Zalo redirect; fixed server-side return target")
    @Operation(summary = "Start Android LOGIN/LINK in an external browser", description = "No Origin is required or used as authentication. No arbitrary return URL or target UID accepted.")
    public ResponseEntity<Void> authorize(@Parameter(hidden = true) @RequestParam MultiValueMap<String, String> params) {
        ZaloAuthController.singleParameters(params, Set.of("nativeClientId", "purpose", "requestId", "clientChallenge"));
        ZaloPurpose purpose;
        try { purpose = ZaloPurpose.valueOf(params.getFirst("purpose")); }
        catch (IllegalArgumentException | NullPointerException failure) { throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST); }
        var result = service.authorize(params.getFirst("nativeClientId"), purpose, params.getFirst("requestId"), params.getFirst("clientChallenge"));
        return ResponseEntity.status(302).header(HttpHeaders.LOCATION, result.authorizationUrl())
                .header(HttpHeaders.CACHE_CONTROL, "no-store").header("Referrer-Policy", "no-referrer")
                .header(HttpHeaders.SET_COOKIE, ZaloAuthController.cookie(result.cookieName(), result.cookieValue(), result.maxAge())).build();
    }

    @PostMapping(value = "/api/v1/auth/zalo/native/exchange", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Consume Android LOGIN handoff", description = "Reference + client-held verifier, request ID and client ID must match. "
            + "No Origin required. One-use/short-lived. Sign in with Firebase custom token from body, then use Firebase ID token for business APIs.")
    public ZaloExchangeResponse exchange(@Valid @RequestBody ZaloNativeHandoffRequest body, HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        return service.exchange(body);
    }

    @PostMapping(value = "/api/v1/auth/zalo/native/link", consumes = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponse(responseCode = "204", description = "Linked to verified current UID, no token minted")
    @Operation(summary = "Consume Android LINK handoff for current OWNER", description = "Requires recent Firebase authentication within 300s, revocation check and ACTIVE OWNER. "
            + "Never accepts target UID; identity conflicts return 409 zalo_identity_conflict. No Origin required.")
    public ResponseEntity<Void> link(@Valid @RequestBody ZaloNativeHandoffRequest body,
            @AuthenticationPrincipal VerifiedFirebaseToken principal, HttpServletRequest request) {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        String rawToken = authorization != null && authorization.length() > 7 ? authorization.substring(7).trim() : null;
        service.link(body, principal, rawToken);
        return ResponseEntity.noContent().header(HttpHeaders.CACHE_CONTROL, "no-store").build();
    }

    @GetMapping(value = ZaloNativeProperties.RETURN_PATH, produces = MediaType.TEXT_HTML_VALUE)
    @Operation(summary = "Safe Android App Link fallback", description = "Only verifier-bound reference and request metadata in fragment. No authentication performed here.")
    public ResponseEntity<String> landing() { return page.landing(); }

    @GetMapping(value = "/.well-known/assetlinks.json", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Environment-specific Android domain association", description = "Only explicitly configured package/certificates, never automatically trusts staging on production.")
    public ResponseEntity<List<Map<String, Object>>> assetLinks() {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").header("X-Content-Type-Options", "nosniff").body(page.assetLinks());
    }
}
