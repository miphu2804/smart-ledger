package com.smartledger.core.controller;

import com.smartledger.core.dto.response.AdminDashboardViews.*;
import com.smartledger.core.dto.response.AdminPageResponse;
import com.smartledger.core.enums.AdminAccessAction;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.enums.UserStatus;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AdminDashboardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** HTTP support projections; authorization and fail-closed audit are enforced before returning data. */
@RestController
@RequestMapping("/api/v1/admin")
@Tag(name = "Admin Dashboard", description = "Support-only projections; active DB ADMIN required. Every successful read is audited.")
@SecurityRequirement(name = "bearerAuth")
public class AdminDashboardController {
    private final AdminDashboardService service;
    /** Binds the audited dashboard service used by all ADMIN reads. */
    public AdminDashboardController(AdminDashboardService service) { this.service = service; }

    /** Returns current status totals and creation counts for the requested Vietnam date range. */
    @GetMapping("/overview")
    @Operation(summary = "Read platform support counts, not financial reports",
            description = "Both dates or neither. Inclusive Vietnam dates, maximum 366 days; default last 30 days. Status counts are current, not historical.")
    public Overview overview(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate) {
        return service.overview(token, fromDate, toDate);
    }

    /** Returns ascending, zero-filled creation counts; each request is audited as an overview read. */
    @GetMapping("/overview/growth")
    @Operation(summary = "Read daily OWNER and shop creation counts for dashboard charts",
            description = "Both dates or neither; default last 30 Vietnam days, maximum 366 inclusive days. "
                    + "Points are ascending and zero-filled. Counts include currently disabled OWNERs and inactive/archived shops; "
                    + "they measure creation, not logins, usage or historical status. Audited as an overview read.")
    public Growth growth(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fromDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate toDate) {
        return service.growth(token, fromDate, toDate);
    }

    /** Searches only OWNER profiles and exposes masked contacts in a bounded page. */
    @GetMapping("/users")
    @Operation(summary = "Search OWNER profiles with masked contacts",
            description = "Literal case-insensitive name/email/phone search. page starts at 0; size 1-100; createdAt/id descending.")
    public AdminPageResponse<OwnerSummary> owners(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestParam(required = false) String query, @RequestParam(required = false) UserStatus status,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.owners(token, query, status, page, size);
    }

    /** Returns an OWNER support profile with audited full contact access. */
    @GetMapping("/users/{userId}")
    @Operation(summary = "Read an OWNER support profile with audited full contact",
            description = "Related shops are paginated via GET /admin/shops?ownerId=...; no Firebase identities or business ledgers.")
    public OwnerDetail owner(@AuthenticationPrincipal VerifiedFirebaseToken token, @PathVariable long userId) {
        return service.owner(token, userId);
    }

    /** Searches shops across current statuses without exposing business ledgers. */
    @GetMapping("/shops")
    @Operation(summary = "Search shops, including INACTIVE and ARCHIVED, with masked shop phone")
    public AdminPageResponse<ShopSummary> shops(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestParam(required = false) String query, @RequestParam(required = false) ShopStatus status,
            @RequestParam(required = false) Long ownerId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.shops(token, query, status, ownerId, page, size);
    }

    /** Returns the support profile of a shop, including inactive or archived shops. */
    @GetMapping("/shops/{shopId}")
    @Operation(summary = "Read an audited shop support profile, including archived shops",
            description = "No sale, payment, refund, debt, expense, product or business audit metadata is disclosed.")
    public ShopDetail shop(@AuthenticationPrincipal VerifiedFirebaseToken token, @PathVariable long shopId) {
        return service.shop(token, shopId);
    }

    /** Lists only ADMIN activation and inactivation events for the selected shop. */
    @GetMapping("/shops/{shopId}/status-history")
    @Operation(summary = "Read only ADMIN inactivation/reactivation history of this shop")
    public AdminPageResponse<ShopStatusEvent> history(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @PathVariable long shopId, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.statusHistory(token, shopId, page, size);
    }

    /** Lists the caller's administrative history; client filters cannot select another actor. */
    @GetMapping("/access-logs")
    @Operation(summary = "Read only the current ADMIN's administrative access history",
            description = "Not OWNER business audit. No actor filter; from inclusive, to exclusive. The read itself is audited after selecting the page.")
    public AdminPageResponse<AccessLog> accessLogs(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestParam(required = false) AdminAccessAction action, @RequestParam(required = false) Long shopId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.accessLogs(token, action, shopId, from, to, page, size);
    }
}
