package com.smartledger.core.billing;

import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Independent payment and grant gates; this configuration does not enable AI quota enforcement. */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({BillingProperties.class, SubscriptionProperties.class, ChatQuotaProperties.class})
@EnableScheduling
public class BillingConfiguration {
    @Bean("billingClock") Clock billingClock() { return Clock.systemUTC(); }
}
