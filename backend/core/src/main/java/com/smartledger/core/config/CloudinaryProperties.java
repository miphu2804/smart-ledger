package com.smartledger.core.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "cloudinary")
public class CloudinaryProperties {

    /** Defaults to disabled so a missing deployment variable cannot send files to an unintended account. */
    private boolean enabled;
    private String cloudName;
    private String apiKey;
    private String apiSecret;
    /** Required namespace boundary when multiple runtime environments share one Cloudinary account. */
    private String publicIdPrefix;
}
