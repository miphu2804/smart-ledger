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

@Service
public class MediaCleanupJobServiceImpl implements MediaCleanupJobService {

    private final MediaCleanupJobRepository repository;

    public MediaCleanupJobServiceImpl(MediaCleanupJobRepository repository) {
        this.repository = repository;
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
        repository.findById(jobId).ifPresent(MediaCleanupJob::markCompleted);
    }

    @Override
    @Transactional
    public void retry(Long jobId, String error, OffsetDateTime nextAttemptAt) {
        repository.findById(jobId).ifPresent(job -> job.scheduleRetry(error, nextAttemptAt));
    }
}
