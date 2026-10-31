package com.smartledger.core.config;

import com.smartledger.core.security.UserRateLimitFilter;
import com.smartledger.core.ratelimit.UserRateLimitService;
import com.smartledger.core.repository.AuthIdentityRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class UserRateLimitConfiguration {
    @Bean
    UserRateLimitFilter userRateLimitFilter(UserRateLimitService quota, AuthIdentityRepository identities,
            ObjectMapper mapper) {
        return new UserRateLimitFilter(quota, identities, mapper);
    }
    /** Only the security chain executes this filter, after Firebase authentication. */
    @Bean
    FilterRegistrationBean<UserRateLimitFilter> userRateLimitRegistration(UserRateLimitFilter filter) {
        var registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }
}
