package com.smartledger.core.zalo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.config.ZaloProperties;
import com.smartledger.core.exception.BusinessException;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

class HttpZaloProviderGatewayTest {
    private final HttpClient client = mock(HttpClient.class);
    private final ZaloProperties properties = properties();
    private final HttpZaloProviderGateway gateway = new HttpZaloProviderGateway(properties, client, new ObjectMapper());

    @Test
    void exchangesCodeThenReadsVerifiedSubjectUsingFixedHostsAndSecretHeaders() throws Exception {
        HttpResponse<InputStream> tokenResponse = response(200,
                "{\"access_token\":\"provider-secret-token\",\"refresh_token\":\"never-store\"}");
        HttpResponse<InputStream> profileResponse = response(200,
                "{\"error\":0,\"id\":\"user123\",\"name\":\"Tên người dùng\"}");
        when(client.<InputStream>sendAsync(any(), any(HttpResponse.BodyHandler.class))).thenReturn(
                CompletableFuture.completedFuture(tokenResponse), CompletableFuture.completedFuture(profileResponse));
        String verifier = ZaloCrypto.randomToken();
        ZaloProfile profile = gateway.exchangeCode("authorization-code", verifier);
        assertThat(profile.subject()).isEqualTo("user123");
        assertThat(profile.displayName()).isEqualTo("Tên người dùng");
        ArgumentCaptor<HttpRequest> requests = ArgumentCaptor.forClass(HttpRequest.class);
        verify(client, times(2)).sendAsync(requests.capture(), any(HttpResponse.BodyHandler.class));
        HttpRequest token = requests.getAllValues().getFirst();
        assertThat(token.uri().toString()).isEqualTo("https://oauth.zaloapp.com/v4/access_token");
        assertThat(token.method()).isEqualTo("POST");
        assertThat(token.headers().firstValue("secret_key")).contains("test-only-secret");
        assertThat(token.timeout()).isPresent();
        assertThat(body(token)).contains("app_id=3632655625730637557", "code=authorization-code",
                "grant_type=authorization_code", "code_verifier=" + verifier)
                .doesNotContain("test-only-secret");
        HttpRequest me = requests.getAllValues().getLast();
        assertThat(me.uri().getScheme()).isEqualTo("https");
        assertThat(me.uri().getHost()).isEqualTo("graph.zalo.me");
        assertThat(me.uri().getPath()).isEqualTo("/v2.0/me");
        assertThat(me.uri().toString()).doesNotContain("provider-secret-token");
        assertThat(me.headers().firstValue("access_token")).contains("provider-secret-token");
    }

    @Test
    void disabledFeatureMakesNoProviderRequest() {
        properties.setEnabled(false);
        assertThatThrownBy(() -> gateway.exchangeCode("code", "verifier")).isInstanceOf(BusinessException.class);
        verifyNoInteractions(client);
    }

    @Test
    void rejectsProviderHttpErrorsRedirectsMalformedJsonAndOversizedBodiesWithoutRetry() throws Exception {
        for (HttpResponse<InputStream> bad : List.of(response(302, ""), response(500, "sensitive-provider-body"),
                response(200, "not-json"), response(200, "{\"access_token\":\"" + "a".repeat(66000) + "\"}"),
                response(200, "{\"error\":-1,\"message\":\"test-only-secret\"}"))) {
            reset(client);
            when(client.<InputStream>sendAsync(any(), any(HttpResponse.BodyHandler.class)))
                    .thenReturn(CompletableFuture.completedFuture(bad));
            assertThatThrownBy(() -> gateway.exchangeCode("authorization-code", ZaloCrypto.randomToken()))
                    .isInstanceOf(BusinessException.class).hasNoCause().hasMessageNotContaining("test-only-secret")
                    .hasMessageNotContaining("sensitive-provider-body");
            verify(client, times(1)).sendAsync(any(), any(HttpResponse.BodyHandler.class));
        }
    }

    @Test
    void rejectsInvalidProfilesEvenWithAnIdPresent() throws Exception {
        for (String profile : List.of("{\"error\":210,\"id\":\"id\",\"name\":\"name\"}",
                "{\"error\":0,\"name\":\"name\"}", "{\"error\":0,\"id\":\"id\",\"name\":\"\"}")) {
            HttpResponse<InputStream> tokenResponse = response(200, "{\"access_token\":\"token\"}");
            HttpResponse<InputStream> profileResponse = response(200, profile);
            when(client.<InputStream>sendAsync(any(), any(HttpResponse.BodyHandler.class))).thenReturn(
                    CompletableFuture.completedFuture(tokenResponse), CompletableFuture.completedFuture(profileResponse));
            assertThatThrownBy(() -> gateway.exchangeCode("code", ZaloCrypto.randomToken()))
                    .isInstanceOf(BusinessException.class).hasNoCause();
        }
    }

    @Test
    void productionTransportNeverRedirectsAndHasAConnectTimeoutWithoutReadingDisabledSecrets() {
        var disabled = new HttpZaloProviderGateway(new ZaloProperties(), new ObjectMapper());
        HttpClient transport = (HttpClient) ReflectionTestUtils.getField(disabled, "client");
        assertThat(transport.followRedirects()).isEqualTo(HttpClient.Redirect.NEVER);
        assertThat(transport.connectTimeout()).isPresent();
    }

    @Test
    @SuppressWarnings("unchecked")
    void productionBodySubscriberCancelsOversizedBodiesBeforeCompletion() throws Exception {
        when(client.sendAsync(any(), any(HttpResponse.BodyHandler.class))).thenAnswer(invocation -> {
            HttpResponse.BodyHandler<InputStream> handler = invocation.getArgument(1);
            HttpResponse.BodySubscriber<InputStream> subscriber = handler.apply(mock(HttpResponse.ResponseInfo.class));
            Flow.Subscription subscription = mock(Flow.Subscription.class);
            subscriber.onSubscribe(subscription);
            subscriber.onNext(List.of(ByteBuffer.wrap(new byte[65537])));
            assertThat(subscriber.getBody().toCompletableFuture().isCompletedExceptionally()).isTrue();
            verify(subscription).cancel();
            return CompletableFuture.failedFuture(new java.io.IOException("raw-provider-secret"));
        });
        assertThatThrownBy(() -> gateway.exchangeCode("code", ZaloCrypto.randomToken()))
                .isInstanceOf(BusinessException.class).hasNoCause().hasMessageNotContaining("raw-provider-secret");
        verify(client, times(1)).sendAsync(any(), any(HttpResponse.BodyHandler.class));
    }

    @Test
    void interruptedProviderRequestPreservesInterruptAndDoesNotRetry() throws Exception {
        CompletableFuture<HttpResponse<InputStream>> pending = new CompletableFuture<>();
        when(client.<InputStream>sendAsync(any(), any(HttpResponse.BodyHandler.class))).thenReturn(pending);
        try {
            Thread.currentThread().interrupt();
            assertThatThrownBy(() -> gateway.exchangeCode("code", ZaloCrypto.randomToken()))
                    .isInstanceOf(BusinessException.class).hasNoCause();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            assertThat(pending.isCancelled()).isTrue();
            verify(client, times(1)).sendAsync(any(), any(HttpResponse.BodyHandler.class));
        } finally {
            Thread.interrupted();
        }
    }

    @SuppressWarnings("unchecked")
    private static HttpResponse<InputStream> response(int status, String json) {
        HttpResponse<InputStream> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
        return response;
    }

    private static ZaloProperties properties() {
        ZaloProperties properties = new ZaloProperties();
        properties.setEnabled(true);
        properties.setAppId("3632655625730637557");
        properties.setAppSecret("test-only-secret");
        properties.setCallbackUrl("https://core.example/api/v1/auth/zalo/callback");
        properties.setClientOrigins(List.of("https://web.example"));
        properties.setSessionEncryptionKey(Base64.getEncoder().encodeToString(new byte[32]));
        return properties;
    }

    private static String body(HttpRequest request) throws Exception {
        var bytes = new ByteArrayOutputStream();
        var done = new CompletableFuture<String>();
        request.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<ByteBuffer>() {
            public void onSubscribe(Flow.Subscription subscription) { subscription.request(Long.MAX_VALUE); }
            public void onNext(ByteBuffer buffer) {
                byte[] part = new byte[buffer.remaining()];
                buffer.get(part);
                bytes.writeBytes(part);
            }
            public void onError(Throwable error) { done.completeExceptionally(error); }
            public void onComplete() { done.complete(bytes.toString(StandardCharsets.UTF_8)); }
        });
        return done.get(2, TimeUnit.SECONDS);
    }
}
