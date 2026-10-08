package com.smartledger.core.repository;

import com.smartledger.core.entity.MediaCleanupJob;
import com.smartledger.core.enums.MediaCleanupStatus;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Repository seam for the cleanup worker introduced with the media write endpoints. */
public interface MediaCleanupJobRepository extends JpaRepository<MediaCleanupJob, Long> {

    List<MediaCleanupJob> findTop100ByStatusAndNextAttemptAtLessThanEqualOrderById(
            MediaCleanupStatus status, OffsetDateTime now);
}
