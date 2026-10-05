package com.smartledger.core.service;

import com.smartledger.core.dto.response.AdminDashboardViews.*;
import com.smartledger.core.dto.response.AdminPageResponse;
import com.smartledger.core.enums.AdminAccessAction;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.enums.UserStatus;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.time.LocalDate;
import java.time.OffsetDateTime;

public interface AdminDashboardService {
    Overview overview(VerifiedFirebaseToken token, LocalDate fromDate, LocalDate toDate);
    AdminPageResponse<OwnerSummary> owners(VerifiedFirebaseToken token, String query, UserStatus status, int page, int size);
    OwnerDetail owner(VerifiedFirebaseToken token, long id);
    AdminPageResponse<ShopSummary> shops(VerifiedFirebaseToken token, String query, ShopStatus status, Long ownerId, int page, int size);
    ShopDetail shop(VerifiedFirebaseToken token, long id);
    AdminPageResponse<ShopStatusEvent> statusHistory(VerifiedFirebaseToken token, long shopId, int page, int size);
    AdminPageResponse<AccessLog> accessLogs(VerifiedFirebaseToken token, AdminAccessAction action, Long shopId,
            OffsetDateTime from, OffsetDateTime to, int page, int size);
}
