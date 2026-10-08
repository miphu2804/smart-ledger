package com.smartledger.core.service;

import com.smartledger.core.entity.MediaCleanupJob;
import com.smartledger.core.enums.MediaAssetType;
import java.time.OffsetDateTime;
import java.util.List;

public interface MediaCleanupJobService {
    void enqueue(String publicId, MediaAssetType assetType);
    List<MediaCleanupJob> dueJobs(OffsetDateTime now);
    void complete(Long jobId);
    void process(Long jobId);
    void retry(Long jobId, String error, OffsetDateTime nextAttemptAt);
}
