package com.smartledger.core.billing;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Independently default-off admission and recovery; pausing admission retains pending evidence. */
@ConfigurationProperties("smartledger.ai-quota")
public record ChatQuotaProperties(boolean enabled, boolean recoveryEnabled) {}
