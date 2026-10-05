package com.smartledger.core.dto.response;

import com.smartledger.core.enums.AdminAccessAction;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.enums.UserStatus;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/** Explicit support projections: no ledger, Firebase identity, arbitrary metadata or subscription fields. */
public final class AdminDashboardViews {
    private AdminDashboardViews() { }

    public record OwnerCounts(long total, long active, long disabled, long createdInPeriod) { }
    public record ShopCounts(long total, long active, long inactive, long archived, long createdInPeriod) { }
    public record Overview(OffsetDateTime asOf, String timezone, LocalDate fromDate, LocalDate toDate,
            OwnerCounts owners, ShopCounts shops) { }
    public record OwnerSummary(Long id, String displayName, String maskedEmail, String maskedPhone,
            UserStatus status, OffsetDateTime createdAt, long shopCount) { }
    public record OwnerDetail(Long id, String displayName, String email, String phone, UserStatus status,
            OffsetDateTime createdAt, OffsetDateTime updatedAt, long shopCount) { }
    public record OwnerContact(Long id, String displayName, String email, String phone, UserStatus status) { }
    public record ShopSummary(Long id, Long ownerId, String ownerDisplayName, String name, String industry,
            String maskedPhone, ShopStatus status, OffsetDateTime createdAt) { }
    public record ShopDetail(Long id, String name, String industry, String phone, String address,
            ShopStatus status, String inactiveReason, String archivedReason, OffsetDateTime archivedAt,
            OffsetDateTime createdAt, OffsetDateTime updatedAt, OwnerContact owner) { }
    public record ShopStatusEvent(Long id, Long actorUserId, ShopStatus beforeStatus, ShopStatus afterStatus,
            String reason, String requestId, OffsetDateTime createdAt) { }
    public record AccessLog(Long id, Long actorUserId, String actorRole, AdminAccessAction action,
            String targetType, Long targetId, Long shopId, String outcome, String requestId,
            OffsetDateTime occurredAt, ShopStatus beforeStatus, ShopStatus afterStatus, String reason) { }
}
