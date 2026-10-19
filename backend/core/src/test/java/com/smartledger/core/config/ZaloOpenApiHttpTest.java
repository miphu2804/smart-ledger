package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.controller.ZaloAuthController;
import com.smartledger.core.dto.response.ZaloExchangeResponse;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.service.ZaloAuthService;
import com.smartledger.core.service.ZaloNativeAuthService;
import com.smartledger.core.zalo.ZaloNativePage;
import com.smartledger.core.controller.ZaloNativeAuthController;
import com.smartledger.core.zalo.ZaloCallbackPage;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
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

/** Generated OpenAPI is checked over real HTTP, with provider and serialized DTO shapes compared. */
@SpringBootTest(classes = ZaloOpenApiHttpTest.App.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"server.address=127.0.0.1", "springdoc.api-docs.enabled=true", "springdoc.swagger-ui.enabled=false"})
class ZaloOpenApiHttpTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class, FlywayAutoConfiguration.class})
    @Import({SecurityConfiguration.class, OpenApiConfiguration.class, ZaloAuthController.class,
            ZaloCallbackPage.class, ZaloNativeAuthController.class, BearerTokenAuthenticationFilter.class, RestAuthenticationEntryPoint.class})
    static class App { }

    @LocalServerPort private int port;
    @Autowired private ObjectMapper mapper;
    @MockitoBean private ZaloAuthService service;
    @MockitoBean private ZaloNativeAuthService nativeService;
    @MockitoBean private ZaloNativePage nativePage;
    @MockitoBean private FirebaseTokenVerifier verifier;
    @MockitoBean(name = "dbHealthIndicator") private HealthIndicator database;

    @Test
    void documentsExactParametersPublicOperationsAndAuthenticatedLink() throws Exception {
        var paths = document().path("paths");
        var authorize = paths.path("/api/v1/auth/zalo/authorize").path("get");
        Set<String> parameters = new HashSet<>();
        authorize.path("parameters").forEach(parameter -> {
            parameters.add(parameter.path("name").asText());
            assertThat(parameter.path("required").asBoolean()).isTrue();
        });
        assertThat(parameters).containsExactlyInAnyOrder("purpose", "clientOrigin", "requestId", "clientChallenge");
        assertThat(authorize.path("responses").has("302")).isTrue();
        assertThat(authorize.path("security").isEmpty()).isTrue();
        assertThat(paths.path("/api/v1/auth/zalo/exchange").path("post").path("security").isEmpty()).isTrue();
        var link = paths.path("/api/v1/auth/zalo/link").path("post");
        assertThat(link.path("security").get(0).has("bearerAuth")).isTrue();
        assertThat(link.path("responses").has("204")).isTrue();
        var callback = paths.path("/api/v1/auth/zalo/callback").path("get");
        Set<String> callbackParameters = new HashSet<>();
        callback.path("parameters").forEach(parameter -> callbackParameters.add(parameter.path("name").asText()));
        assertThat(callbackParameters).containsExactlyInAnyOrder("state", "code", "error", "code_challenge");
        assertThat(callback.path("responses").path("200").path("content").has("text/html")).isTrue();
    }

    @Test
    void requiredProofAndExchangeFieldsMatchRuntimeSerializationWithoutExtraCredentials() throws Exception {
        var schemas = document().path("components").path("schemas");
        var proof = schemas.path("ZaloProofRequest");
        assertThat(strings(proof.path("required"))).containsExactlyInAnyOrder("proof", "clientVerifier");
        assertThat(proof.path("additionalProperties").isBoolean()).isTrue();
        assertThat(proof.path("additionalProperties").asBoolean()).isFalse();
        assertThat(proof.path("properties").path("proof").path("pattern").asText()).isEqualTo("[A-Za-z0-9_-]{43}");
        var exchange = schemas.path("ZaloExchangeResponse");
        assertThat(strings(exchange.path("required"))).containsExactlyInAnyOrder("firebaseCustomToken", "displayName");
        var serialized = mapper.valueToTree(new ZaloExchangeResponse("synthetic-custom-token", "Test owner"));
        Set<String> fields = new HashSet<>();
        serialized.fieldNames().forEachRemaining(fields::add);
        Set<String> documented = new HashSet<>();
        exchange.path("properties").fieldNames().forEachRemaining(documented::add);
        assertThat(fields).isEqualTo(documented).containsExactlyInAnyOrder("firebaseCustomToken", "displayName");
        assertThat(serialized.toString()).doesNotContain("accessToken", "refreshToken", "appSecret", "providerSubject");
    }

    @Test
    void nativeContractHasOnlyApprovedInputsAndAuthenticatedLinkWithoutOriginRequirement() throws Exception {
        var doc = document();
        var paths = doc.path("paths");
        var authorize = paths.path("/api/v1/auth/zalo/native/authorize").path("get");
        Set<String> parameters = new HashSet<>();
        authorize.path("parameters").forEach(parameter -> {
            assertThat(parameter.path("required").asBoolean()).isTrue();
            parameters.add(parameter.path("name").asText());
        });
        assertThat(parameters).containsExactlyInAnyOrder("nativeClientId", "purpose", "requestId", "clientChallenge");
        assertThat(authorize.path("responses").has("302")).isTrue();
        assertThat(authorize.path("security").isEmpty()).isTrue();
        assertThat(paths.path("/api/v1/auth/zalo/native/exchange").path("post").path("security").isEmpty()).isTrue();
        var link = paths.path("/api/v1/auth/zalo/native/link").path("post");
        assertThat(link.path("security").get(0).has("bearerAuth")).isTrue();
        assertThat(link.path("responses").has("204")).isTrue();
        var handoff = doc.path("components").path("schemas").path("ZaloNativeHandoffRequest");
        assertThat(strings(handoff.path("required"))).containsExactlyInAnyOrder("nativeClientId", "requestId", "handoffReference", "clientVerifier");
        assertThat(handoff.path("additionalProperties").asBoolean(true)).isFalse();
        assertThat(handoff.path("properties").has("firebaseUid")).isFalse();
        assertThat(handoff.path("properties").has("returnUrl")).isFalse();
    }

    private JsonNode document() throws Exception {
        try (var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()) {
            var response = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/v3/api-docs"))
                    .timeout(Duration.ofSeconds(15)).GET().build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            return mapper.readTree(response.body());
        }
    }

    private static Set<String> strings(JsonNode array) {
        Set<String> values = new HashSet<>();
        array.forEach(value -> values.add(value.asText()));
        return values;
    }
}
