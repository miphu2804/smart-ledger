package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;

import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** Real HTTP verifies static resource delivery through the deployed security filter chain. */
@SpringBootTest(classes = ZaloDomainVerificationHttpTest.TestApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"OPENAPI_ENABLED=false", "SWAGGER_UI_ENABLED=false", "server.address=127.0.0.1"})
class ZaloDomainVerificationHttpTest {
    private static final String FILE = "zalo_verifierMysnBA7R831YqgKCwDCT0HgaYGlsqb9MCpOu.html";
    private static final String PATH = "/" + FILE;

    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class,
            FlywayAutoConfiguration.class})
    @Import({SecurityConfiguration.class, BearerTokenAuthenticationFilter.class, RestAuthenticationEntryPoint.class})
    static class TestApplication { }

    @LocalServerPort private int port;
    @MockitoBean private FirebaseTokenVerifier verifier;
    @MockitoBean(name = "dbHealthIndicator") private HealthIndicator database;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @AfterEach
    void closeClient() {
        client.close();
        verifyNoInteractions(verifier, database);
    }

    @Test
    void exactVerificationFileIsPublicAndReturnsTheBundledHtml() throws Exception {
        var response = request("GET", PATH);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(value ->
                assertThat(value).startsWith("text/html"));
        try (var resource = new ClassPathResource("static/" + FILE).getInputStream()) {
            assertThat(response.body()).isEqualTo(new String(resource.readAllBytes(), StandardCharsets.UTF_8));
        }
        assertThat(response.body()).contains("property=\"zalo-platform-site-verification\"",
                "content=\"MysnBA7R831YqgKCwDCT0HgaYGlsqb9MCpOu\"");
        assertThat(response.headers().firstValue("WWW-Authenticate")).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"})
    void verificationExceptionDoesNotOpenOtherHttpMethods(String method) throws Exception {
        assertThat(request(method, PATH).statusCode()).isEqualTo(401);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/zalo_verifier-other.html", "/nested/" + FILE, PATH + "/extra",
            "/api/v1/me", "/api/v1/products", "/api/v1/auth/zalo/authorize", "/api/v1/auth/zalo/callback"})
    void unrelatedFilesBusinessApisAndUnreleasedZaloRoutesStillRequireAuthentication(String path) throws Exception {
        assertThat(request("GET", path).statusCode()).isEqualTo(401);
    }

    private HttpResponse<String> request(String method, String path) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(10)).method(method, HttpRequest.BodyPublishers.noBody()).build();
        return client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }
}
