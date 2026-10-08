package com.smartledger.core.repository;

import com.smartledger.core.entity.MediaCleanupJob;
import com.smartledger.core.enums.MediaCleanupStatus;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import java.util.Optional;

/** Repository seam for the cleanup worker introduced with the media write endpoints. */
public interface MediaCleanupJobRepository extends JpaRepository<MediaCleanupJob, Long> {

    @Query(value = "SELECT * FROM media_cleanup_jobs WHERE id = :id AND status = 'PENDING' FOR UPDATE SKIP LOCKED", nativeQuery = true)
    Optional<MediaCleanupJob> lockPending(Long id);

    @Modifying
    @Query("""
            update MediaCleanupJob job set job.attemptCount = job.attemptCount + 1,
                job.lastError = :error, job.nextAttemptAt = :nextAttemptAt
            where job.id = :id and job.status = :pending
            """)
    int retryIfPending(Long id, String error, OffsetDateTime nextAttemptAt, MediaCleanupStatus pending);

    List<MediaCleanupJob> findTop100ByStatusAndNextAttemptAtLessThanEqualOrderById(
            MediaCleanupStatus status, OffsetDateTime now);
}
