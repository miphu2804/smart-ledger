package com.smartledger.core.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smartledger.core.entity.MediaCleanupJob;
import com.smartledger.core.enums.MediaAssetType;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class MediaCleanupWorkerTest {

    @Test
    void dispatchesAvatarToLockedCleanupProcessor() {
        MediaCleanupJobService jobs = mock(MediaCleanupJobService.class);
        MediaCleanupJob avatar = mock(MediaCleanupJob.class);
        when(avatar.getId()).thenReturn(3L);
        when(avatar.getPublicId()).thenReturn("users/5/avatar/opaque");
        when(avatar.getAssetType()).thenReturn(MediaAssetType.USER_AVATAR);
        when(jobs.dueJobs(any(OffsetDateTime.class))).thenReturn(List.of(avatar));

        new MediaCleanupWorker(jobs).cleanDueAssets();

        verify(jobs).process(3L);
    }

    @Test
    void dispatchesProductImageToLockedCleanupProcessor() {
        MediaCleanupJobService jobs = mock(MediaCleanupJobService.class);
        MediaCleanupJob product = mock(MediaCleanupJob.class);
        when(product.getId()).thenReturn(4L);
        when(product.getPublicId()).thenReturn("shops/7/products/9/opaque");
        when(product.getAssetType()).thenReturn(MediaAssetType.PRODUCT_IMAGE);
        when(jobs.dueJobs(any(OffsetDateTime.class))).thenReturn(List.of(product));

        new MediaCleanupWorker(jobs).cleanDueAssets();

        verify(jobs).process(4L);
    }
}
