package com.smartledger.core.entity;

import com.smartledger.core.enums.MediaAssetType;
import com.smartledger.core.enums.MediaCleanupStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Persistent outbox for deleting a replaced Cloudinary asset only after its database change commits.
 * The table is intentionally mapped now; its Flyway migration must be supplied before this model is used.
 */
@Entity
@Table(name = "media_cleanup_jobs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MediaCleanupJob {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, length = 500)
    private String publicId;

    @Enumerated(EnumType.STRING)
    @Column(name = "asset_type", nullable = false, length = 30)
    private MediaAssetType assetType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MediaCleanupStatus status;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "next_attempt_at", nullable = false)
    private OffsetDateTime nextAttemptAt;

    @Column(name = "last_error", length = 500)
    private String lastError;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    public static MediaCleanupJob create(String publicId, MediaAssetType assetType) {
        if (publicId == null || publicId.isBlank() || assetType == null) {
            throw new IllegalArgumentException("A cleanup job needs a public ID and asset type");
        }
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        MediaCleanupJob job = new MediaCleanupJob();
        job.publicId = publicId;
        job.assetType = assetType;
        job.status = MediaCleanupStatus.PENDING;
        job.attemptCount = 0;
        job.nextAttemptAt = now;
        job.createdAt = now;
        return job;
    }

    public void scheduleRetry(String error, OffsetDateTime nextAttemptAt) {
        if (nextAttemptAt == null) {
            throw new IllegalArgumentException("A retry time is required");
        }
        status = MediaCleanupStatus.PENDING;
        attemptCount++;
        lastError = error == null ? null : error.substring(0, Math.min(error.length(), 500));
        this.nextAttemptAt = nextAttemptAt;
        completedAt = null;
    }

    public void markCompleted() {
        status = MediaCleanupStatus.COMPLETED;
        completedAt = OffsetDateTime.now(ZoneOffset.UTC);
        lastError = null;
    }
}
