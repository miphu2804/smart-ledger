package com.smartledger.core.service.impl;

import com.smartledger.core.entity.MediaCleanupJob;
import com.smartledger.core.enums.MediaAssetType;
import com.smartledger.core.enums.MediaCleanupStatus;
import com.smartledger.core.repository.MediaCleanupJobRepository;
import com.smartledger.core.service.MediaCleanupJobService;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.smartledger.core.media.MediaStorage;
import com.smartledger.core.media.MediaDeliveryType;
import org.springframework.jdbc.core.JdbcTemplate;

@Service
public class MediaCleanupJobServiceImpl implements MediaCleanupJobService {

    private final MediaCleanupJobRepository repository;
    private final MediaStorage storage;
    private final JdbcTemplate jdbc;

    public MediaCleanupJobServiceImpl(MediaCleanupJobRepository repository, MediaStorage storage, JdbcTemplate jdbc) {
        this.repository = repository;
        this.storage = storage;
        this.jdbc = jdbc;
    }

    @Override
    @Transactional
    public void enqueue(String publicId, MediaAssetType assetType) {
        repository.save(MediaCleanupJob.create(publicId, assetType));
    }

    @Override
    @Transactional(readOnly = true)
    public List<MediaCleanupJob> dueJobs(OffsetDateTime now) {
        return repository.findTop100ByStatusAndNextAttemptAtLessThanEqualOrderById(MediaCleanupStatus.PENDING, now);
    }

    @Override
    @Transactional
    public void complete(Long jobId) {
        repository.lockPending(jobId).ifPresent(MediaCleanupJob::markCompleted);
    }

    @Override
    @Transactional
    public void retry(Long jobId, String error, OffsetDateTime nextAttemptAt) {
        repository.retryIfPending(jobId, error == null ? null : error.substring(0, Math.min(error.length(), 500)),
                nextAttemptAt, MediaCleanupStatus.PENDING);
    }

    /** Hold a per-job lock through delete; another worker skips it until this transaction commits. */
    @Override
    @Transactional
    public void process(Long jobId) {
        var candidate = repository.lockPending(jobId);
        if (candidate.isEmpty()) return;
        MediaCleanupJob job = candidate.get();
        String publicId = job.getPublicId();
        jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", publicId);
        boolean attached = Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM products WHERE image_public_id = ?)
                    OR EXISTS(SELECT 1 FROM shops WHERE logo_public_id = ?)
                    OR EXISTS(SELECT 1 FROM users WHERE avatar_public_id = ?)
                """, Boolean.class, publicId, publicId, publicId));
        if (attached) {
            // An obsolete job must never delete a currently attached asset.
            job.markCompleted();
            return;
        }
        boolean uploading = Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM media_upload_keys WHERE public_id = ?
                    AND response_body IS NULL AND expires_at > CURRENT_TIMESTAMP)
                """, Boolean.class, publicId));
        if (uploading) {
            job.scheduleRetry("UPLOAD_PENDING", OffsetDateTime.now().plusMinutes(1));
            return;
        }
        storage.delete(publicId, job.getAssetType() == MediaAssetType.USER_AVATAR
                ? MediaDeliveryType.AUTHENTICATED : MediaDeliveryType.PUBLIC);
        job.markCompleted();
    }
}
