package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.smartledger.core.media.MediaStorage;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

class MediaCleanupWorkerConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(WorkerConfiguration.class);

    @Test
    void doesNotStartCleanupWorkerWhenCloudinaryIsDisabled() {
        runner.run(context -> assertThat(context).doesNotHaveBean(MediaCleanupWorker.class));
    }

    @Test
    void startsCleanupWorkerOnlyWhenCloudinaryIsEnabled() {
        runner.withPropertyValues("cloudinary.enabled=true")
                .run(context -> assertThat(context).hasSingleBean(MediaCleanupWorker.class));
    }

    @Configuration(proxyBeanMethods = false)
    @Import(MediaCleanupWorker.class)
    static class WorkerConfiguration {
        @Bean
        MediaCleanupJobService cleanupJobs() {
            return mock(MediaCleanupJobService.class);
        }

        @Bean
        MediaStorage mediaStorage() {
            return mock(MediaStorage.class);
        }
    }
}
