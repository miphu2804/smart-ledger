package com.smartledger.core.service;

import com.smartledger.core.dto.response.AdminDashboardViews.*;
import com.smartledger.core.dto.response.AdminPageResponse;
import com.smartledger.core.enums.AdminAccessAction;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.enums.UserStatus;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/** Support-only reads requiring an active DB ADMIN and successful audit persistence. */
public interface AdminDashboardService {
    /** Returns current totals and creations in an inclusive Vietnam range of at most 366 days. */
    Overview overview(VerifiedFirebaseToken token, LocalDate fromDate, LocalDate toDate);
    /** Returns one creation-count point per date using the same range rules as {@link #overview}. */
    Growth growth(VerifiedFirebaseToken token, LocalDate fromDate, LocalDate toDate);
    /** Searches OWNER profiles, masking contacts and auditing only query presence and result count. */
    AdminPageResponse<OwnerSummary> owners(VerifiedFirebaseToken token, String query, UserStatus status, int page, int size);
    /** Returns an OWNER's support details; an ADMIN profile is never returned as an OWNER. */
    OwnerDetail owner(VerifiedFirebaseToken token, long id);
    /** Searches shops in all statuses with optional OWNER scope and masked shop contacts. */
    AdminPageResponse<ShopSummary> shops(VerifiedFirebaseToken token, String query, ShopStatus status, Long ownerId, int page, int size);
    /** Returns a shop's support details without financial or Firebase identity data. */
    ShopDetail shop(VerifiedFirebaseToken token, long id);
    /** Reads only ADMIN activation/inactivation history for an existing shop. */
    AdminPageResponse<ShopStatusEvent> statusHistory(VerifiedFirebaseToken token, long shopId, int page, int size);
    /** Reads only the current ADMIN's history, then audits that read after selecting the page. */
    AdminPageResponse<AccessLog> accessLogs(VerifiedFirebaseToken token, AdminAccessAction action, Long shopId,
            OffsetDateTime from, OffsetDateTime to, int page, int size);
}
