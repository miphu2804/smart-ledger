package com.smartledger.core.billing;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Independent default-off grant writer; pausing collection must not pause issued-money recovery. */
@ConfigurationProperties("billing.subscription")
public record SubscriptionProperties(boolean fulfillmentEnabled) {}
