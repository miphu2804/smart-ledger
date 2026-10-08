package com.smartledger.core.service;

import com.smartledger.core.entity.MediaCleanupJob;
import com.smartledger.core.enums.MediaAssetType;
import com.smartledger.core.media.MediaDeliveryType;
import com.smartledger.core.media.MediaStorage;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Deletes only a previously unlinked asset, outside the transaction that changed business data. */
@Component
@ConditionalOnProperty(prefix = "cloudinary", name = "enabled", havingValue = "true")
public class MediaCleanupWorker {
    private static final Logger log = LoggerFactory.getLogger(MediaCleanupWorker.class);
    private final MediaCleanupJobService jobs;
    private final MediaStorage storage;

    public MediaCleanupWorker(MediaCleanupJobService jobs, MediaStorage storage) {
        this.jobs = jobs;
        this.storage = storage;
    }

    @Scheduled(fixedDelayString = "${cloudinary.cleanup.fixed-delay-ms:60000}")
    public void cleanDueAssets() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        for (MediaCleanupJob job : jobs.dueJobs(now)) {
            try {
                storage.delete(job.getPublicId(), deliveryType(job.getAssetType()));
                jobs.complete(job.getId());
            } catch (RuntimeException exception) {
                int minutes = Math.min(60, 1 << Math.min(job.getAttemptCount(), 6));
                log.warn("Media cleanup failed jobId={} assetType={}", job.getId(), job.getAssetType());
                jobs.retry(job.getId(), exception.getMessage(), now.plusMinutes(minutes));
            }
        }
    }

    private static MediaDeliveryType deliveryType(MediaAssetType assetType) {
        return assetType == MediaAssetType.USER_AVATAR
                ? MediaDeliveryType.AUTHENTICATED
                : MediaDeliveryType.PUBLIC;
    }
}
