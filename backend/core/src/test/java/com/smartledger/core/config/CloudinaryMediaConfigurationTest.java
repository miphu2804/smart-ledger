package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.smartledger.core.media.MediaStorage;
import com.smartledger.core.media.CloudinaryMediaStorage;
import com.smartledger.core.media.UnavailableMediaStorage;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class CloudinaryMediaConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(CloudinaryMediaConfiguration.class);

    @Test
    void keepsMediaUnavailableUnlessCloudinaryIsExplicitlyEnabled() {
        runner.run(context -> assertThat(context.getBean(MediaStorage.class)).isInstanceOf(UnavailableMediaStorage.class));
    }

    @Test
    void refusesToStartEnabledMediaWithoutAllProviderCredentials() {
        runner.withPropertyValues("cloudinary.enabled=true", "cloudinary.cloud-name=demo", "cloudinary.api-key=key")
                .run(context -> assertThat(context.getStartupFailure()).isNotNull());
    }

    @Test
    void refusesToStartEnabledMediaWithoutAnEnvironmentNamespace() {
        runner.withPropertyValues(
                        "cloudinary.enabled=true",
                        "cloudinary.cloud-name=demo",
                        "cloudinary.api-key=key",
                        "cloudinary.api-secret=secret")
                .run(context -> assertThat(context.getStartupFailure()).isNotNull());
    }

    @Test
    void createsTheCloudinaryAdapterWithoutCallingTheProviderDuringStartup() {
        runner.withPropertyValues(
                        "cloudinary.enabled=true",
                        "cloudinary.cloud-name=demo",
                        "cloudinary.api-key=key",
                        "cloudinary.api-secret=secret",
                        "cloudinary.public-id-prefix=smartledger/test")
                .run(context -> {
                    assertThat(context.getStartupFailure()).isNull();
                    assertThat(context.getBean(MediaStorage.class)).isInstanceOf(CloudinaryMediaStorage.class);
                });
    }
}
