package com.smartledger.core.controller;

import com.smartledger.core.dto.request.AuthSessionRequest;
import com.smartledger.core.dto.response.AuthSessionResponse;
import com.smartledger.core.dto.response.UserResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AuthSessionService;
import com.smartledger.core.service.MediaService;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Authentication")
@SecurityRequirement(name = "bearerAuth")
public class AuthController {

    private final AuthSessionService authSessionService;
    private final MediaService mediaService;

    public AuthController(AuthSessionService authSessionService, MediaService mediaService) {
        this.authSessionService = authSessionService;
        this.mediaService = mediaService;
    }

    @PostMapping("/auth/session")
    @Operation(
            summary = "Open a SmartLedger session from a Firebase ID token",
            description = "Creates a local OWNER account only on the first sign-in of a Firebase UID.")
    @ApiResponse(
            responseCode = "200",
            description = "Local account created or returned",
            content = @Content(schema = @Schema(implementation = AuthSessionResponse.class)))
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
    @ApiResponse(
            responseCode = "200",
            description = "Current local account",
            content = @Content(schema = @Schema(implementation = AuthSessionResponse.class)))
    public AuthSessionResponse getCurrentSession(@AuthenticationPrincipal VerifiedFirebaseToken firebaseToken) {
        return authSessionService.getCurrentSession(firebaseToken);
    }

    @PostMapping(path = "/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload the current user's avatar")
    @ApiResponse(responseCode = "200", description = "Avatar uploaded",
            content = @Content(schema = @Schema(implementation = UserResponse.class)))
    public UserResponse uploadAvatar(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestPart("image") MultipartFile image) {
        return mediaService.uploadAvatar(firebaseToken, image);
    }

    @DeleteMapping("/me/avatar")
    @Operation(summary = "Remove the current user's avatar")
    @ApiResponse(responseCode = "204", description = "Avatar removed or already absent")
    public ResponseEntity<Void> deleteAvatar(@AuthenticationPrincipal VerifiedFirebaseToken firebaseToken) {
        mediaService.deleteAvatar(firebaseToken);
        return ResponseEntity.noContent().build();
    }
}
