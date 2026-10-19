package com.smartledger.core.zalo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.config.ZaloProperties;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.ConnectException;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import javax.net.ssl.SSLHandshakeException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.slf4j.LoggerFactory;

/** Synthetic payloads only; assertions must cover both safe metadata and absence of raw data. */
class ZaloProviderDiagnosticsTest {
    private static final String PRIVATE = "diagnostic-private-marker";
    private final HttpClient client = mock(HttpClient.class);
    private final ZaloProperties properties = properties();
    private final HttpZaloProviderGateway gateway = new HttpZaloProviderGateway(properties, client, new ObjectMapper());
    private final Logger logger = (Logger) LoggerFactory.getLogger(HttpZaloProviderGateway.class);
    private final ListAppender<ILoggingEvent> events = new ListAppender<>();
    private Level previousLevel;
    private boolean previousAdditive;

    @BeforeEach
    void capture() {
        previousLevel = logger.getLevel();
        previousAdditive = logger.isAdditive();
        logger.setLevel(Level.WARN);
        logger.setAdditive(false);
        events.start();
        logger.addAppender(events);
    }

    @AfterEach
    void restore() {
        logger.detachAppender(events);
        logger.setLevel(previousLevel);
        logger.setAdditive(previousAdditive);
        events.stop();
    }

    @ParameterizedTest
    @CsvSource({"token,403,1", "profile,503,2"})
    void identifiesHttpStageWithoutLoggingResponseHeadersOrBody(String stage, int status, int calls) {
        stub(stage, response(status, "{\"error\":-14014,\"message\":\"" + PRIVATE + "\"}"));
        fail();
        assertDiagnostic(stage, "http_error", status, "unknown", "unknown");
        verify(client, times(calls)).sendAsync(any(), any(HttpResponse.BodyHandler.class));
    }

    @ParameterizedTest
    @CsvSource({"token,-14014", "profile,210"})
    void logsOnlyNumericProviderErrorNotProviderMessageOrProfile(String stage, int code) {
        stub(stage, response(200, "{\"error\":" + code + ",\"message\":\"" + PRIVATE
                + "\\r\\nforged-log-entry\",\"id\":\"" + PRIVATE + "\",\"name\":\"" + PRIVATE
                + "\",\"access_token\":\"" + PRIVATE + "\",\"refresh_token\":\"" + PRIVATE + "\"}"));
        fail();
        assertDiagnostic(stage, "provider_error", 200, Integer.toString(code), "integer");
    }

    @ParameterizedTest
    @CsvSource({"missing,absent", "string,non_integer", "null,non_integer", "overflow,out_of_range"})
    void distinguishesProfileErrorShapeWithoutEchoingArbitraryValues(String variant, String shape) {
        String error = switch (variant) {
            case "missing" -> "";
            case "string" -> "\"error\":\"" + PRIVATE + "\",";
            case "null" -> "\"error\":null,";
            default -> "\"error\":9223372036854775807,";
        };
        stub("profile", response(200, "{" + error + "\"id\":\"" + PRIVATE + "\",\"name\":\"" + PRIVATE + "\"}"));
        fail();
        assertDiagnostic("profile", variant.equals("overflow") ? "provider_error" : "invalid_error_field",
                200, "unknown", shape);
    }

    @ParameterizedTest
    @CsvSource({"token,missing_access_token", "profile,invalid_profile"})
    void identifiesMissingRequiredFieldsWithoutRelaxingValidation(String stage, String reason) {
        stub(stage, response(200, "{\"error\":0,\"message\":\"" + PRIVATE + "\"}"));
        fail();
        assertDiagnostic(stage, reason, 200, "0", "integer");
    }

    @ParameterizedTest
    @CsvSource({"token", "profile"})
    void rejectsMalformedJsonWithoutLoggingParserException(String stage) {
        stub(stage, response(200, "{\"private\":\"" + PRIVATE));
        fail();
        assertDiagnostic(stage, "invalid_json", 200, "unknown", "unknown");
    }

    @Test
    void identifiesOversizedBodyWithoutLoggingItsContent() {
        stub("token", response(200, PRIVATE + "x".repeat(65537)));
        fail();
        assertDiagnostic("token", "response_too_large", 200, "unknown", "unknown");
    }

    @ParameterizedTest
    @CsvSource({"token", "profile"})
    void rejectsNonObjectOrEmptyJsonWithoutEchoingResponse(String stage) {
        for (String json : List.of("null", "[]", "\"" + PRIVATE + "\"", "")) {
            reset(client);
            events.list.clear();
            stub(stage, response(200, json));
            fail();
            assertDiagnostic(stage, "invalid_response", 200, "unknown", "unknown");
        }
    }

    @Test
    void invalidTokenHeaderDoesNotLeakTheToken() {
        stub("token", response(200, "{\"access_token\":\"" + PRIVATE + "\\r\\nheader-injection\"}"));
        fail();
        assertDiagnostic("token", "invalid_access_token", 200, "unknown", "absent");
    }

    @Test
    void invalidProfileControlsDoNotLeakIdentity() {
        stub("profile", response(200, "{\"error\":0,\"id\":\"" + PRIVATE + "\",\"name\":\"" + PRIVATE + "\\n\"}"));
        fail();
        assertDiagnostic("profile", "invalid_profile", 200, "0", "integer");
    }

    @Test
    void nullBodyIsClassifiedWithoutAnExceptionTrace() {
        var response = response(200, "");
        when(response.body()).thenReturn(null);
        stub("profile", response);
        fail();
        assertDiagnostic("profile", "invalid_response", 200, "unknown", "unknown");
    }

    @Test
    void profileTransportFailureIsNotMistakenForTokenFailure() {
        var token = response(200, "{\"access_token\":\"" + PRIVATE + "\"}");
        when(client.<InputStream>sendAsync(any(), any(HttpResponse.BodyHandler.class))).thenReturn(
                CompletableFuture.completedFuture(token), CompletableFuture.failedFuture(new HttpTimeoutException(PRIVATE)));
        fail();
        assertDiagnostic("profile", "timeout", 0, "unknown", "unknown");
    }

    @Test
    void wrappedConnectFailureRetainsItsClassification() {
        var cause = new ConnectException(PRIVATE);
        cause.initCause(new IOException(PRIVATE));
        when(client.<InputStream>sendAsync(any(), any(HttpResponse.BodyHandler.class)))
                .thenReturn(CompletableFuture.failedFuture(cause));
        fail();
        assertDiagnostic("token", "connect_error", 0, "unknown", "unknown");
    }

    @Test
    void unexpectedTransportFailureDoesNotLogItsClassOrMessage() {
        when(client.<InputStream>sendAsync(any(), any(HttpResponse.BodyHandler.class)))
                .thenReturn(CompletableFuture.failedFuture(new IllegalStateException(PRIVATE)));
        fail();
        assertDiagnostic("token", "transport_error", 0, "unknown", "unknown");
    }

    @ParameterizedTest
    @CsvSource({"dns,dns_error", "tls,tls_error", "connect,connect_error", "timeout,timeout", "io,io_error"})
    void classifiesAsynchronousTransportFailureWithoutExceptionDetails(String type, String reason) {
        Exception cause = switch (type) {
            case "dns" -> new UnknownHostException(PRIVATE);
            case "tls" -> new SSLHandshakeException(PRIVATE);
            case "connect" -> new ConnectException(PRIVATE);
            case "timeout" -> new HttpTimeoutException(PRIVATE);
            default -> new IOException(PRIVATE);
        };
        when(client.<InputStream>sendAsync(any(), any(HttpResponse.BodyHandler.class)))
                .thenReturn(CompletableFuture.failedFuture(new IOException(PRIVATE, cause)));
        fail();
        assertDiagnostic("token", reason, 0, "unknown", "unknown");
        verify(client, times(1)).sendAsync(any(), any(HttpResponse.BodyHandler.class));
    }

    @Test
    void interruptedCallKeepsInterruptCancelsAndLogsNoThrowable() {
        var pending = new CompletableFuture<HttpResponse<InputStream>>();
        when(client.<InputStream>sendAsync(any(), any(HttpResponse.BodyHandler.class))).thenReturn(pending);
        try {
            Thread.currentThread().interrupt();
            fail();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            assertThat(pending.isCancelled()).isTrue();
            assertDiagnostic("token", "interrupted", 0, "unknown", "unknown");
        } finally {
            Thread.interrupted();
        }
    }

    @Test
    void successfulFlowDoesNotLogProviderData() {
        var token = response(200, "{\"access_token\":\"" + PRIVATE + "\"}");
        var profile = response(200, "{\"error\":0,\"id\":\"" + PRIVATE + "\",\"name\":\"" + PRIVATE + "\"}");
        when(client.<InputStream>sendAsync(any(), any(HttpResponse.BodyHandler.class))).thenReturn(
                CompletableFuture.completedFuture(token), CompletableFuture.completedFuture(profile));
        assertThat(gateway.exchangeCode(PRIVATE, "A".repeat(43)).subject()).isEqualTo(PRIVATE);
        assertThat(events.list).isEmpty();
    }

    private void fail() {
        assertThatThrownBy(() -> gateway.exchangeCode(PRIVATE, "A".repeat(43)))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ZALO_PROVIDER_UNAVAILABLE);
                    assertThat(exception).hasNoCause().hasMessageNotContaining(PRIVATE);
                });
    }

    private void assertDiagnostic(String stage, String reason, int httpStatus, String code, String shape) {
        assertThat(events.list).hasSize(1);
        ILoggingEvent event = events.list.getFirst();
        assertThat(event.getLevel()).isEqualTo(Level.WARN);
        assertThat(event.getThrowableProxy()).isNull();
        assertThat(event.getFormattedMessage()).matches("zalo_provider_failure stage=" + stage + " reason=" + reason
                + " http_status=" + httpStatus + " provider_error=" + code + " error_shape=" + shape + " elapsed_ms=[0-9]+")
                .doesNotContain(PRIVATE, "forged-log-entry", "A".repeat(43), "3632655625730637557",
                        "secret_key=", "access_token=", "refresh_token=", "https://", "\n", "\r");
    }

    private void stub(String stage, HttpResponse<InputStream> failure) {
        if (stage.equals("profile")) {
            var token = response(200, "{\"access_token\":\"" + PRIVATE + "\"}");
            when(client.<InputStream>sendAsync(any(), any(HttpResponse.BodyHandler.class))).thenReturn(
                    CompletableFuture.completedFuture(token), CompletableFuture.completedFuture(failure));
        } else {
            when(client.<InputStream>sendAsync(any(), any(HttpResponse.BodyHandler.class)))
                    .thenReturn(CompletableFuture.completedFuture(failure));
        }
    }

    @SuppressWarnings("unchecked")
    private static HttpResponse<InputStream> response(int status, String body) {
        HttpResponse<InputStream> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
        return response;
    }

    private static ZaloProperties properties() {
        var properties = new ZaloProperties();
        properties.setEnabled(true);
        properties.setAppId("3632655625730637557");
        properties.setAppSecret(PRIVATE);
        properties.setCallbackUrl("https://core.example/api/v1/auth/zalo/callback");
        properties.setClientOrigins(List.of("https://web.example"));
        properties.setSessionEncryptionKey(Base64.getEncoder().encodeToString(new byte[32]));
        return properties;
    }
}
