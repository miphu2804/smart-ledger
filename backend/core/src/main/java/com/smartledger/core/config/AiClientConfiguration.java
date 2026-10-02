package com.smartledger.core.config;

import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AiProperties.class)
public class AiClientConfiguration {

    /**
     * A chat turn can include several model and tool calls, so the read timeout is well above a normal API call.
     * It stays below the mobile chat timeout (45 s) so the app receives ai_unavailable instead of aborting first.
     */
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(40);

    @Bean
    RestClient aiRestClient(RestClient.Builder builder, AiProperties properties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(3));
        requestFactory.setReadTimeout(READ_TIMEOUT);
        return builder
                .baseUrl(properties.getBaseUrl())
                .defaultHeader("X-Internal-Token", properties.getInternalToken())
                .requestFactory(requestFactory)
                .build();
    }
}
