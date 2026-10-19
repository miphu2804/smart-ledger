package com.smartledger.core.zalo;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.config.ZaloProperties;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.ConnectException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.ByteBuffer;
import java.nio.channels.UnresolvedAddressException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import javax.net.ssl.SSLException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** Fixed-host OAuth transport. A code is never retried or redirected to another endpoint. */
@Component
public class HttpZaloProviderGateway implements ZaloProviderGateway {
    private static final Logger LOG = LoggerFactory.getLogger(HttpZaloProviderGateway.class);
    private static final URI TOKEN_URI = URI.create("https://oauth.zaloapp.com/v4/access_token");
    private static final URI PROFILE_URI = URI.create("https://graph.zalo.me/v2.0/me?fields=id%2Cname");
    private static final int MAX_RESPONSE_BYTES = 65536;
    private final ZaloProperties properties;
    private final HttpClient client;
    private final ObjectMapper mapper;

    @Autowired
    public HttpZaloProviderGateway(ZaloProperties properties, ObjectMapper mapper) {
        this(properties, HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER)
                .connectTimeout(Duration.ofSeconds(5)).build(), mapper);
    }

    HttpZaloProviderGateway(ZaloProperties properties, HttpClient client, ObjectMapper mapper) {
        this.properties = properties;
        this.client = client;
        this.mapper = mapper;
    }

    @Override
    public ZaloProfile exchangeCode(String code, String verifier) {
        properties.requireEnabled();
        if (code == null || code.isBlank() || code.length() > 4096 || verifier == null
                || !verifier.matches("[A-Za-z0-9_-]{43}")) {
            throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
        }
        String body = "app_id=" + encoded(properties.getAppId()) + "&code=" + encoded(code)
                + "&grant_type=authorization_code&code_verifier=" + encoded(verifier);
        long tokenStarted = System.nanoTime();
        JsonNode token = send(HttpRequest.newBuilder(TOKEN_URI).timeout(timeout())
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("secret_key", properties.getAppSecret())
                .POST(HttpRequest.BodyPublishers.ofString(body)).build());
        String accessToken = text(token, "access_token", 16000);
        if (hasProviderError(token)) {
            throw unavailable(Stage.TOKEN, token.get("error").isIntegralNumber()
                    ? Reason.PROVIDER_ERROR : Reason.INVALID_ERROR_FIELD, 200, token, tokenStarted);
        }
        if (accessToken == null) throw unavailable(Stage.TOKEN, Reason.MISSING_ACCESS_TOKEN, 200, token, tokenStarted);
        if (!safeHeader(accessToken)) throw unavailable(Stage.TOKEN, Reason.INVALID_ACCESS_TOKEN, 200, token, tokenStarted);
        long profileStarted = System.nanoTime();
        JsonNode profile = send(HttpRequest.newBuilder(PROFILE_URI).timeout(timeout())
                .header("access_token", accessToken).GET().build());
        String subject = text(profile, "id", 255);
        String displayName = text(profile, "name", 150);
        if (!profile.has("error") || !profile.get("error").isIntegralNumber()) {
            throw unavailable(Stage.PROFILE, Reason.INVALID_ERROR_FIELD, 200, profile, profileStarted);
        }
        if (profile.get("error").longValue() != 0) {
            throw unavailable(Stage.PROFILE, Reason.PROVIDER_ERROR, 200, profile, profileStarted);
        }
        if (subject == null || displayName == null
                || subject.chars().anyMatch(character -> Character.isISOControl(character))
                || displayName.chars().anyMatch(character -> Character.isISOControl(character))) {
            throw unavailable(Stage.PROFILE, Reason.INVALID_PROFILE, 200, profile, profileStarted);
        }
        return new ZaloProfile(subject, displayName);
    }

    private JsonNode send(HttpRequest request) {
        // Only fixed provider URIs reach here; never log the URI, request, response or exception.
        Stage stage = PROFILE_URI.equals(request.uri()) ? Stage.PROFILE : Stage.TOKEN;
        long started = System.nanoTime();
        int httpStatus = 0;
        CompletableFuture<HttpResponse<InputStream>> pending = null;
        try {
            pending = client.sendAsync(request, ignored -> new LimitedBodySubscriber());
            // HttpRequest.timeout alone may stop covering the response after headers arrive.
            // This deadline includes the bounded subscriber's complete body transfer.
            HttpResponse<InputStream> response = pending.get(request.timeout().orElseThrow().toMillis(), TimeUnit.MILLISECONDS);
            httpStatus = response.statusCode();
            try (InputStream stream = response.body()) {
                if (httpStatus != 200) {
                    throw unavailable(stage, Reason.HTTP_ERROR, httpStatus, null, started);
                }
                if (stream == null) throw unavailable(stage, Reason.INVALID_RESPONSE, httpStatus, null, started);
                byte[] bytes = stream.readNBytes(MAX_RESPONSE_BYTES + 1);
                if (bytes.length > MAX_RESPONSE_BYTES) {
                    throw unavailable(stage, Reason.RESPONSE_TOO_LARGE, httpStatus, null, started);
                }
                JsonNode result = mapper.readTree(bytes);
                if (result == null || !result.isObject()) {
                    throw unavailable(stage, Reason.INVALID_RESPONSE, httpStatus, null, started);
                }
                return result;
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw unavailable(stage, Reason.INTERRUPTED, httpStatus, null, started);
        } catch (JsonProcessingException exception) {
            throw unavailable(stage, Reason.INVALID_JSON, httpStatus, null, started);
        } catch (IOException | IllegalArgumentException | ExecutionException | TimeoutException exception) {
            throw unavailable(stage, transportReason(exception), httpStatus, null, started);
        } finally {
            if (pending != null && !pending.isDone()) pending.cancel(true);
        }
    }

    private static boolean hasProviderError(JsonNode token) {
        JsonNode error = token.get("error");
        return error != null && (!error.isIntegralNumber() || error.longValue() != 0);
    }

    private static String text(JsonNode node, String field, int maximum) {
        JsonNode value = node.get(field);
        return value != null && value.isTextual() && !value.textValue().isBlank()
                && value.textValue().codePointCount(0, value.textValue().length()) <= maximum
                ? value.textValue() : null;
    }

    private static boolean safeHeader(String value) {
        return value.chars().allMatch(character -> character >= 33 && character <= 126);
    }

    private static String encoded(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    private Duration timeout() { return Duration.ofSeconds(properties.getHttpTimeoutSeconds()); }
    /** Allowlisted scalars only: no free-form provider strings, identifiers, payloads or throwables. */
    private static BusinessException unavailable(Stage stage, Reason reason, int httpStatus, JsonNode body, long started) {
        JsonNode error = body == null ? null : body.get("error");
        String errorShape = body == null ? "unknown" : error == null ? "absent"
                : !error.isIntegralNumber() ? "non_integer" : error.canConvertToInt() ? "integer" : "out_of_range";
        String providerError = error != null && error.isIntegralNumber() && error.canConvertToInt()
                ? Integer.toString(error.intValue()) : "unknown";
        LOG.warn("zalo_provider_failure stage={} reason={} http_status={} provider_error={} error_shape={} elapsed_ms={}",
                stage.name().toLowerCase(Locale.ROOT), reason.name().toLowerCase(Locale.ROOT), httpStatus,
                providerError, errorShape, Math.max(0, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started)));
        return new BusinessException(ErrorCode.ZALO_PROVIDER_UNAVAILABLE);
    }

    private static Reason transportReason(Throwable failure) {
        // Inspect types only, with a bound even for a cyclic/hostile cause chain. Messages may contain credentials.
        Reason fallback = Reason.TRANSPORT_ERROR;
        for (int depth = 0; failure != null && depth < 8; depth++, failure = failure.getCause()) {
            if (failure instanceof ResponseTooLargeException) return Reason.RESPONSE_TOO_LARGE;
            if (failure instanceof TimeoutException || failure instanceof HttpTimeoutException) return Reason.TIMEOUT;
            if (failure instanceof UnknownHostException || failure instanceof UnresolvedAddressException) return Reason.DNS_ERROR;
            if (failure instanceof SSLException) return Reason.TLS_ERROR;
            if (failure instanceof ConnectException) fallback = Reason.CONNECT_ERROR;
            else if (failure instanceof IOException && fallback == Reason.TRANSPORT_ERROR) fallback = Reason.IO_ERROR;
        }
        return fallback;
    }

    private enum Stage { TOKEN, PROFILE }
    private enum Reason {
        HTTP_ERROR, PROVIDER_ERROR, INVALID_ERROR_FIELD, MISSING_ACCESS_TOKEN, INVALID_ACCESS_TOKEN,
        INVALID_PROFILE, INVALID_JSON, INVALID_RESPONSE, RESPONSE_TOO_LARGE, INTERRUPTED,
        TIMEOUT, DNS_ERROR, TLS_ERROR, CONNECT_ERROR, IO_ERROR, TRANSPORT_ERROR
    }

    private static final class ResponseTooLargeException extends IOException {
        private static final long serialVersionUID = 1L;
    }

    /**
     * Complete only after the bounded body arrives, so the future deadline covers the entire transfer.
     * Unlike ofInputStream, no post-header blocking read escapes that deadline.
     */
    private static final class LimitedBodySubscriber implements HttpResponse.BodySubscriber<InputStream> {
        private final CompletableFuture<InputStream> result = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private Flow.Subscription subscription;

        @Override
        public CompletionStage<InputStream> getBody() { return result; }

        @Override
        public void onSubscribe(Flow.Subscription subscription) {
            this.subscription = subscription;
            subscription.request(1);
        }

        @Override
        public void onNext(List<ByteBuffer> buffers) {
            if (result.isDone()) {
                return;
            }
            for (ByteBuffer buffer : buffers) {
                if (buffer.remaining() > MAX_RESPONSE_BYTES - bytes.size()) {
                    subscription.cancel();
                    result.completeExceptionally(new ResponseTooLargeException());
                    return;
                }
                byte[] part = new byte[buffer.remaining()];
                buffer.get(part);
                bytes.writeBytes(part);
            }
            subscription.request(1);
        }

        @Override
        public void onError(Throwable error) { result.completeExceptionally(error); }

        @Override
        public void onComplete() { result.complete(new ByteArrayInputStream(bytes.toByteArray())); }
    }
}
