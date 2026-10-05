package com.smartledger.core.service.impl;

import com.smartledger.core.dto.response.AdminDashboardViews.*;
import com.smartledger.core.dto.response.AdminPageResponse;
import com.smartledger.core.enums.AdminAccessAction;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.enums.UserStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.AdminDashboardRepository;
import com.smartledger.core.security.AdminAccessGuard;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AdminAccessAuditService;
import com.smartledger.core.service.AdminDashboardService;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import org.springframework.stereotype.Service;
import org.springframework.dao.DataAccessException;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(isolation = Isolation.REPEATABLE_READ)
public class AdminDashboardServiceImpl implements AdminDashboardService {
    private static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private final AdminAccessGuard guard;
    private final AdminDashboardRepository repository;
    private final AdminAccessAuditService audit;

    public AdminDashboardServiceImpl(AdminAccessGuard guard, AdminDashboardRepository repository, AdminAccessAuditService audit) {
        this.guard = guard; this.repository = repository; this.audit = audit;
    }

    @Override
    public Overview overview(VerifiedFirebaseToken token, LocalDate fromDate, LocalDate toDate) {
        var admin = guard.requireAdmin(token);
        LocalDate today = LocalDate.now(ZONE);
        if ((fromDate == null) != (toDate == null)) { throw invalid(); }
        LocalDate from = fromDate == null ? today.minusDays(29) : fromDate;
        LocalDate to = toDate == null ? today : toDate;
        if (from.getYear() < 1 || to.getYear() > 9998 || to.isBefore(from) || ChronoUnit.DAYS.between(from, to) >= 366) {
            throw invalid();
        }
        var start = from.atStartOfDay(ZONE).toOffsetDateTime();
        var end = to.plusDays(1).atStartOfDay(ZONE).toOffsetDateTime();
        var response = new Overview(OffsetDateTime.now(ZoneOffset.UTC), ZONE.getId(), from, to,
                repository.ownerCounts(start, end), repository.shopCounts(start, end));
        audit.record(admin.getId(), AdminAccessAction.OVERVIEW_VIEWED, null, null, false, 1);
        return response;
    }

    @Override
    public AdminPageResponse<OwnerSummary> owners(VerifiedFirebaseToken token, String query, UserStatus status, int page, int size) {
        var admin = guard.requireAdmin(token);
        validatePage(page, size);
        String normalized = query(query);
        var response = repository.owners(normalized, status, page, size);
        audit.record(admin.getId(), AdminAccessAction.OWNERS_SEARCHED, null, null, !normalized.isEmpty(), response.items().size());
        return response;
    }

    @Override
    public OwnerDetail owner(VerifiedFirebaseToken token, long id) {
        var admin = guard.requireAdmin(token);
        positive(id);
        var response = repository.owner(id).orElseThrow(() -> new BusinessException(ErrorCode.ADMIN_OWNER_NOT_FOUND));
        audit.record(admin.getId(), AdminAccessAction.OWNER_VIEWED, id, null, false, 1);
        return response;
    }

    @Override
    public AdminPageResponse<ShopSummary> shops(VerifiedFirebaseToken token, String query, ShopStatus status, Long ownerId, int page, int size) {
        var admin = guard.requireAdmin(token);
        validatePage(page, size);
        if (ownerId != null) { positive(ownerId); }
        String normalized = query(query);
        var response = repository.shops(normalized, status, ownerId, page, size);
        audit.record(admin.getId(), AdminAccessAction.SHOPS_SEARCHED, null, null, !normalized.isEmpty(), response.items().size());
        return response;
    }

    @Override
    public ShopDetail shop(VerifiedFirebaseToken token, long id) {
        var admin = guard.requireAdmin(token);
        positive(id);
        var response = repository.shop(id).orElseThrow(() -> new BusinessException(ErrorCode.SHOP_NOT_FOUND));
        audit.record(admin.getId(), AdminAccessAction.SHOP_VIEWED, id, id, false, 1);
        return response;
    }

    @Override
    public AdminPageResponse<ShopStatusEvent> statusHistory(VerifiedFirebaseToken token, long shopId, int page, int size) {
        var admin = guard.requireAdmin(token);
        positive(shopId); validatePage(page, size);
        if (repository.shop(shopId).isEmpty()) { throw new BusinessException(ErrorCode.SHOP_NOT_FOUND); }
        var response = repository.statusHistory(shopId, page, size);
        audit.record(admin.getId(), AdminAccessAction.SHOP_STATUS_HISTORY_VIEWED, shopId, shopId, false, response.items().size());
        return response;
    }

    @Override
    public AdminPageResponse<AccessLog> accessLogs(VerifiedFirebaseToken token, AdminAccessAction action, Long shopId,
            OffsetDateTime from, OffsetDateTime to, int page, int size) {
        var admin = guard.requireAdmin(token);
        validatePage(page, size);
        if (shopId != null) { positive(shopId); }
        var start = from == null ? OffsetDateTime.parse("0001-01-01T00:00:00Z") : from;
        var end = to == null ? OffsetDateTime.parse("9999-12-31T23:59:59Z") : to;
        if (start.getYear() < 1 || end.getYear() > 9999 || !start.isBefore(end)) { throw invalid(); }
        // Actor scope cannot be widened with X-Shop-Id or a client actorUserId parameter.
        AdminPageResponse<AccessLog> response;
        try {
            response = repository.ownAccessHistory(admin.getId(), action, shopId, start, end, page, size);
        } catch (DataAccessException unavailable) {
            throw new BusinessException(ErrorCode.ADMIN_AUDIT_UNAVAILABLE);
        }
        audit.record(admin.getId(), AdminAccessAction.ACCESS_LOGS_VIEWED, null, null, false, response.items().size());
        return response;
    }

    private void validatePage(int page, int size) {
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE) { throw invalid(); }
    }
    private void positive(long id) { if (id <= 0) { throw invalid(); } }
    private String query(String value) {
        if (value == null) { return ""; }
        String trimmed = value.trim();
        if (trimmed.length() > 150) { throw invalid(); }
        return trimmed;
    }
    private BusinessException invalid() { return new BusinessException(ErrorCode.INVALID_ADMIN_QUERY); }
}
