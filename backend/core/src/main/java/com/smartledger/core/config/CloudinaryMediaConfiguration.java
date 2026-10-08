package com.smartledger.core.config;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.smartledger.core.media.CloudinaryGateway;
import com.smartledger.core.media.CloudinaryMediaStorage;
import com.smartledger.core.media.CloudinarySdkGateway;
import com.smartledger.core.media.MediaStorage;
import com.smartledger.core.media.UnavailableMediaStorage;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.util.StringUtils;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(CloudinaryProperties.class)
@EnableScheduling
public class CloudinaryMediaConfiguration {

    @Bean
    @ConditionalOnProperty(prefix = "cloudinary", name = "enabled", havingValue = "true")
    CloudinaryGateway cloudinaryGateway(CloudinaryProperties properties) {
        requireText(properties.getCloudName(), "CLOUDINARY_CLOUD_NAME");
        requireText(properties.getApiKey(), "CLOUDINARY_API_KEY");
        requireText(properties.getApiSecret(), "CLOUDINARY_API_SECRET");
        requirePublicIdPrefix(properties.getPublicIdPrefix());
        Cloudinary cloudinary = new Cloudinary(ObjectUtils.asMap(
                "cloud_name", properties.getCloudName(),
                "api_key", properties.getApiKey(),
                "api_secret", properties.getApiSecret(),
                "secure", true));
        return new CloudinarySdkGateway(cloudinary);
    }

    @Bean
    @ConditionalOnBean(CloudinaryGateway.class)
    MediaStorage cloudinaryMediaStorage(CloudinaryGateway gateway) {
        return new CloudinaryMediaStorage(gateway);
    }

    @Bean
    @ConditionalOnMissingBean(MediaStorage.class)
    MediaStorage unavailableMediaStorage() {
        return new UnavailableMediaStorage();
    }

    private static void requireText(String value, String variable) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalStateException(variable + " is required when CLOUDINARY_ENABLED=true");
        }
    }

    private static void requirePublicIdPrefix(String prefix) {
        if (!StringUtils.hasText(prefix)) {
            throw new IllegalStateException("CLOUDINARY_PUBLIC_ID_PREFIX is required when CLOUDINARY_ENABLED=true");
        }
        String normalized = prefix.trim();
        if (normalized.startsWith("/") || normalized.endsWith("/") || normalized.contains("..")
                || !normalized.matches("[A-Za-z0-9_/-]+")) {
            throw new IllegalStateException("CLOUDINARY_PUBLIC_ID_PREFIX must be a relative slash-separated namespace");
        }
    }
}
