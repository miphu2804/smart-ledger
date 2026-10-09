package com.smartledger.core.controller;

import com.smartledger.core.dto.request.NotificationReadRequest;
import com.smartledger.core.dto.response.NotificationPageResponse;
import com.smartledger.core.dto.response.NotificationUnreadCountResponse;
import com.smartledger.core.enums.NotificationType;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me/notifications")
@Tag(name = "Notifications")
@SecurityRequirement(name = "bearerAuth")
public class NotificationController {
    private final NotificationService service;
    public NotificationController(NotificationService service) { this.service = service; }

    @GetMapping
    @Operation(summary = "Read the current OWNER's in-app notifications",
            description = "No X-Shop-Id required. Optional shopId filter. page starts at 0; size 1-100. "
                    + "INACTIVE shops expose only status notifications; ARCHIVED shops are excluded.")
    public NotificationPageResponse list(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestParam(required = false) Long shopId, @RequestParam(required = false) NotificationType type,
            @RequestParam(defaultValue = "false") boolean unreadOnly,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.list(token, shopId, type, unreadOnly, page, size);
    }

    @GetMapping("/unread-count")
    @Operation(summary = "Count visible unread notifications with the same shop/type filters as the inbox")
    public NotificationUnreadCountResponse count(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestParam(required = false) Long shopId, @RequestParam(required = false) NotificationType type) {
        return new NotificationUnreadCountResponse(service.unreadCount(token, shopId, type));
    }

    @PatchMapping("/{notificationId}/read")
    @Operation(summary = "Mark one notification as read; repeated calls preserve the first readAt")
    public ResponseEntity<Void> read(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @PathVariable Long notificationId) {
        service.markRead(token, List.of(notificationId));
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/read")
    @Operation(summary = "Mark 1-100 explicit notification IDs as read atomically",
            description = "Any inaccessible ID rejects the entire batch. Does not mark notifications arriving later.")
    public ResponseEntity<Void> readBatch(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @Valid @RequestBody NotificationReadRequest request) {
        service.markRead(token, request.ids());
        return ResponseEntity.noContent().build();
    }
}
