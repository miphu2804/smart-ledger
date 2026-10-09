package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.controller.AuthController;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AuthSessionService;
import com.smartledger.core.service.MediaService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** Real HTTP is required here: MockMvc does not reproduce the container's ERROR redispatch. */
@SpringBootTest(classes = ApiDocumentationHttpTest.TestApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"OPENAPI_ENABLED=false", "SWAGGER_UI_ENABLED=false", "server.address=127.0.0.1"})
class ApiDocumentationHttpTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class,
            FlywayAutoConfiguration.class})
    @Import({SecurityConfiguration.class, OpenApiConfiguration.class, AuthController.class,
            BearerTokenAuthenticationFilter.class, RestAuthenticationEntryPoint.class})
    static class TestApplication { }

    @LocalServerPort private int port;
    @Autowired private ObjectMapper mapper;
    @MockitoBean private FirebaseTokenVerifier verifier;
    @MockitoBean private AuthSessionService service;
    @MockitoBean private MediaService media;
    @MockitoBean(name = "dbHealthIndicator") private HealthIndicator database;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @BeforeEach
    void healthy() {
        when(database.health()).thenReturn(Health.up().withDetail("jdbc", "must-not-be-exposed").build());
        when(database.getHealth(anyBoolean())).thenAnswer(invocation -> database.health());
    }

    @AfterEach
    void closeClient() {
        client.close();
    }

    @ParameterizedTest
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs/swagger-config", "/swagger-ui.html",
            "/swagger-ui/index.html"})
    void disabledDocumentationPreserves404ThroughContainerErrorDispatch(String path) throws Exception {
        HttpResponse<String> response = get(path, null);
        assertThat(response.statusCode()).isEqualTo(404);
        JsonNode body = mapper.readTree(response.body());
        assertThat(body.path("status").asInt()).isEqualTo(404);
        assertThat(body.path("path").asText()).isEqualTo(path);
        assertThat(body.has("trace")).isFalse();
        assertThat(body.has("exception")).isFalse();
        assertThat(response.headers().firstValue("WWW-Authenticate")).isEmpty();
        verifyNoInteractions(verifier, service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/v1/me", "/api/v1/products", "/api/v1/debts", "/api/v1/expenses",
            "/actuator/env", "/error"})
    void normalRequestsStillRequireAuthenticationIncludingDirectErrorAccess(String path) throws Exception {
        HttpResponse<String> response = get(path, null);
        assertThat(response.statusCode()).isEqualTo(401);
        JsonNode body = mapper.readTree(response.body());
        assertThat(body.path("code").asText()).isEqualTo("unauthorized");
        assertThat(body.path("traceId").asText()).isNotBlank();
        assertThat(response.headers().firstValue("WWW-Authenticate")).contains("Bearer");
        verifyNoInteractions(verifier, service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/actuator/health/liveness", "/actuator/health/readiness"})
    void healthRemainsPublicAndDoesNotExposeDetails(String path) throws Exception {
        HttpResponse<String> response = get(path, null);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(response.body())).isEqualTo(mapper.readTree("{\"status\":\"UP\"}"));
        verifyNoInteractions(verifier, service);
    }

    @Test
    void authenticatedMissingRouteAlsoPreservesItsOriginal404() throws Exception {
        when(verifier.verify("http-test-token"))
                .thenReturn(new VerifiedFirebaseToken("owner", null, false, null, null, null));
        HttpResponse<String> response = get("/api/v1/not-a-real-route", "http-test-token");
        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(mapper.readTree(response.body()).path("status").asInt()).isEqualTo(404);
        verify(verifier).verify("http-test-token");
        verifyNoInteractions(service);
    }

    private HttpResponse<String> get(String path, String token) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(10)).header("Accept", "application/json").GET();
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
}
