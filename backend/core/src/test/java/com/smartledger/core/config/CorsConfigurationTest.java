package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.cors.CorsConfiguration;

class CorsConfigurationTest {
    private final SecurityConfiguration configuration = new SecurityConfiguration();

    @Test
    void emptyOriginsDenyCrossOriginAccess() {
        CorsConfiguration cors = apiCors(" , ");
        assertThat(cors.getAllowedOrigins()).isEmpty();
        assertThat(cors.checkOrigin("https://owner.example.test")).isNull();
        assertThat(cors.getAllowedOriginPatterns()).isNull();
        assertThat(cors.getAllowCredentials()).isFalse();
    }

    @Test
    void trimsDeduplicatesAndKeepsOriginsExact() {
        CorsConfiguration cors = apiCors(" https://owner.example.test ,http://localhost:8081,"
                + "https://owner.example.test ");
        assertThat(cors.getAllowedOrigins()).containsExactly("https://owner.example.test", "http://localhost:8081");
        assertThat(cors.checkOrigin("https://preview.owner.example.test")).isNull();
        assertThat(cors.checkOrigin("http://localhost:8082")).isNull();
        assertThat(cors.getAllowedHeaders()).containsExactly("Authorization", "Content-Type", "X-Shop-Id", "Idempotency-Key");
        assertThat(cors.getAllowedMethods()).containsExactly("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS");
        assertThat(cors.getMaxAge()).isEqualTo(600L);
        assertThat(configuration.corsConfigurationSource("https://owner.example.test")
                .getCorsConfiguration(new MockHttpServletRequest("GET", "/actuator/health"))).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://owner.example.test", "http://localhost:8081", "http://127.0.0.1:8081", "http://[::1]:8081"})
    void acceptsExactHttpOrigins(String origin) {
        assertThat(apiCors(origin).checkOrigin(origin)).isEqualTo(origin);
    }

    @ParameterizedTest
    @ValueSource(strings = {"*", "https://*.vercel.app", "null", "localhost:8081", "ftp://owner.example.test",
            "https://owner.example.test/", "https://owner.example.test/api", "https://owner.example.test?q=x",
            "https://owner.example.test#x", "https://user:secret@owner.example.test", "https://owner.example.test:65536",
            "https://[bad-host", "https://owner.example.test:-2"})
    void rejectsUnsafeOrNonOriginValues(String origin) {
        assertThatThrownBy(() -> configuration.corsConfigurationSource(origin))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("CORS_ALLOWED_ORIGINS requires exact");
    }

    private CorsConfiguration apiCors(String origins) {
        return configuration.corsConfigurationSource(origins)
                .getCorsConfiguration(new MockHttpServletRequest("POST", "/api/v1/expenses"));
    }
}
