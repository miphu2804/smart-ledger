package com.smartledger.core.config;

import com.smartledger.core.activity.UserDailyActivityCleanup;
import com.smartledger.core.activity.UserDailyActivityInterceptor;
import com.smartledger.core.activity.UserDailyActivityRepository;
import com.smartledger.core.activity.UserDailyActivityService;
import java.time.Clock;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Apply V19 before enabling; public OAuth endpoints and non-API probes never count as app activity. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(prefix = "smartledger.user-activity", name = "enabled", havingValue = "true")
public class UserDailyActivityConfiguration {
    @Bean
    UserDailyActivityRepository userDailyActivityRepository(DataSource source, PlatformTransactionManager manager) {
        JdbcTemplate jdbc = new JdbcTemplate(source);
        jdbc.setQueryTimeout(2);
        return new UserDailyActivityRepository(jdbc, manager);
    }

    @Bean
    UserDailyActivityService userDailyActivityService(UserDailyActivityRepository repository,
            @Value("${smartledger.user-activity.cache-maximum-size:10000}") int maximumEntries) {
        return new UserDailyActivityService(repository, Clock.systemUTC(), maximumEntries);
    }

    @Bean
    UserDailyActivityCleanup userDailyActivityCleanup(UserDailyActivityService service) {
        return new UserDailyActivityCleanup(service);
    }

    @Bean
    WebMvcConfigurer userDailyActivityWebConfigurer(UserDailyActivityService service) {
        return new WebMvcConfigurer() {
            @Override
            public void addInterceptors(InterceptorRegistry registry) {
                registry.addInterceptor(new UserDailyActivityInterceptor(service)).addPathPatterns("/api/v1/**")
                        .excludePathPatterns("/api/v1/auth/zalo/authorize", "/api/v1/auth/zalo/callback",
                                "/api/v1/auth/zalo/exchange", "/api/v1/auth/zalo/native/authorize",
                                "/api/v1/auth/zalo/native/exchange");
            }
        };
    }
}
