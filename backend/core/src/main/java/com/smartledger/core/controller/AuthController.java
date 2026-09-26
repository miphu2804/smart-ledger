package com.smartledger.core.controller;

import com.smartledger.core.dto.request.AuthSessionRequest;
import com.smartledger.core.dto.response.AuthSessionResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AuthSessionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Authentication")
@SecurityRequirement(name = "bearerAuth")
public class AuthController {

    private final AuthSessionService authSessionService;

    public AuthController(AuthSessionService authSessionService) {
        this.authSessionService = authSessionService;
    }

    @PostMapping("/auth/session")
    @Operation(
            summary = "Open a SmartLedger session from a Firebase ID token",
            description = "Creates a local OWNER account only on the first sign-in of a Firebase UID.")
    @ApiResponse(responseCode = "200", description = "Local account created or returned")
    @ApiResponse(responseCode = "400", description = "A first sign-in is missing displayName")
    @ApiResponse(responseCode = "401", description = "Firebase ID token is invalid or missing")
    @ApiResponse(responseCode = "403", description = "Account is disabled")
    public ResponseEntity<AuthSessionResponse> openSession(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @Valid @RequestBody(required = false) AuthSessionRequest request) {
        AuthSessionResponse session = authSessionService.openSession(
                firebaseToken,
                request == null ? null : request.displayName());
        return ResponseEntity.status(HttpStatus.OK).body(session);
    }

    @GetMapping("/me")
    @Operation(summary = "Get the current SmartLedger user and accessible shops")
    @ApiResponse(responseCode = "200", description = "Current local account")
    @ApiResponse(responseCode = "401", description = "Firebase ID token is invalid or missing")
    @ApiResponse(responseCode = "403", description = "Account is disabled")
    @ApiResponse(responseCode = "404", description = "No local SmartLedger profile exists yet")
    public AuthSessionResponse getCurrentSession(@AuthenticationPrincipal VerifiedFirebaseToken firebaseToken) {
        return authSessionService.getCurrentSession(firebaseToken);
    }
}
