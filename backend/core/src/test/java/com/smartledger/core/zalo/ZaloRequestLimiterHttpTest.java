package com.smartledger.core.zalo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.Filter;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.core.Ordered;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

/** Exercises actual Tomcat mapping and the unchanged production Spring Security firewall. */
@SpringBootTest(classes = ZaloRequestLimiterHttpTest.TestApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"server.address=127.0.0.1", "server.servlet.context-path=/limiter-test",
                "OPENAPI_ENABLED=false", "SWAGGER_UI_ENABLED=false"})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ZaloRequestLimiterHttpTest {
    private static final String BASE = "/api/v1/auth/zalo/";

    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class,
            FlywayAutoConfiguration.class})
    @Import({SecurityConfiguration.class, BearerTokenAuthenticationFilter.class,
            RestAuthenticationEntryPoint.class, ProbeController.class})
    static class TestApplication {
        @Bean
        ZaloRequestLimiter limiter(ObjectMapper mapper) {
            return new ZaloRequestLimiter(mapper,
                    Clock.fixed(Instant.parse("2026-10-16T00:00:00Z"), ZoneOffset.UTC), 2, 4096);
        }

        @Bean
        AtomicReference<ObservedPath> observedPath() { return new AtomicReference<>(); }

        @Bean
        FilterRegistrationBean<Filter> observeBeforeLimiter(AtomicReference<ObservedPath> observed) {
            Filter filter = (request, response, chain) -> {
                HttpServletRequest http = (HttpServletRequest) request;
                observed.set(new ObservedPath(http.getRequestURI(), http.getServletPath(), http.getContextPath()));
                chain.doFilter(request, response);
            };
            var registration = new FilterRegistrationBean<>(filter);
            registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 19);
            registration.setDispatcherTypes(DispatcherType.REQUEST);
            return registration;
        }
    }

    @RestController
    static class ProbeController {
        private final AtomicInteger calls = new AtomicInteger();

        @RequestMapping(value = {BASE + "{endpoint}", BASE + "native/{endpoint}"}, method = {RequestMethod.GET, RequestMethod.POST})
        String endpoint() {
            calls.incrementAndGet();
            return "test-only";
        }
    }

    private record ObservedPath(String uri, String servletPath, String contextPath) { }

    @LocalServerPort private int port;
    @Autowired private AtomicReference<ObservedPath> observed;
    @Autowired private ProbeController controller;
    @MockitoBean private FirebaseTokenVerifier verifier;
    @MockitoBean(name = "dbHealthIndicator") private HealthIndicator database;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @AfterEach
    void closeClient() {
        client.close();
        verifyNoInteractions(verifier, database);
    }

    @ParameterizedTest
    @ValueSource(strings = {"authorize", "callback", "exchange", "native/authorize", "native/exchange", "native/link"})
    void semicolonVariantsShareQuotaButStillCannotPassFirewall(String endpoint) throws Exception {
        for (int index = 1; index <= 2; index++) {
            assertThat(request(endpoint + ";a=" + index).statusCode()).isEqualTo(400);
            assertThat(observed.get()).isEqualTo(new ObservedPath(
                    "/limiter-test" + BASE + endpoint + ";a=" + index, BASE + endpoint, "/limiter-test"));
        }
        assertRateLimited(request(endpoint + ";a=3"));
        assertRateLimited(request(endpoint));
        assertThat(controller.calls.get()).isZero();
    }

    @Test
    void encodedAndPlainPathsShareQuotaAfterTomcatDecoding() throws Exception {
        assertThat(request("%61uthorize").statusCode()).isEqualTo(200);
        assertThat(observed.get().servletPath()).isEqualTo(BASE + "authorize");
        assertThat(observed.get().uri()).endsWith("/%61uthorize");
        assertThat(request("authorize").statusCode()).isEqualTo(200);
        assertRateLimited(request("%61uthorize"));
        assertThat(controller.calls.get()).isEqualTo(2);
    }

    @Test
    void queryChangesDoNotCreateANewQuota() throws Exception {
        assertThat(request("authorize?attempt=1").statusCode()).isEqualTo(200);
        assertThat(request("authorize?attempt=2").statusCode()).isEqualTo(200);
        assertRateLimited(request("authorize?attempt=3"));
        assertThat(controller.calls.get()).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {"native/exchange", "native/link"})
    void nativeBodiesAreLimitedBeforeAuthenticationAndParsing(String endpoint) throws Exception {
        var response = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/limiter-test" + BASE + endpoint))
                .timeout(Duration.ofSeconds(5)).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("x".repeat(8193))).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(response.body()).contains("invalid_zalo_request");
        assertThat(controller.calls.get()).isZero();
    }

    private HttpResponse<String> request(String endpoint) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/limiter-test" + BASE + endpoint))
                .timeout(Duration.ofSeconds(5));
        if (endpoint.startsWith("exchange") || endpoint.startsWith("native/exchange")) builder.POST(HttpRequest.BodyPublishers.ofString("{}"));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private static void assertRateLimited(HttpResponse<String> response) {
        assertThat(response.statusCode()).isEqualTo(429);
        assertThat(response.body()).contains("zalo_rate_limited");
        assertThat(response.headers().firstValue("Retry-After")).contains("60");
    }
}
