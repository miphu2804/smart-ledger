package com.smartledger.core.zalo;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.config.ZaloProperties;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

/** Real loopback transport: never resolves or contacts a provider host and uses no credentials. */
class ZaloHttpDeadlineTest {
    @Test
    @Timeout(12)
    void requestDeadlineBoundsAResponseThatStallsAfterHeadersAndAPartialChunk() throws Exception {
        var headersSent = new CountDownLatch(1);
        var releaseBody = new CountDownLatch(1);
        try (var fixture = new LocalTransport(exchange -> {
            try {
                exchange.sendResponseHeaders(200, 0);
                exchange.getResponseBody().write("{\"access_token\":\"sensitive-partial-token".getBytes(StandardCharsets.UTF_8));
                exchange.getResponseBody().flush();
                headersSent.countDown();
                releaseBody.await(8, TimeUnit.SECONDS);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        })) {
            long began = System.nanoTime();
            Future<Throwable> result = fixture.request(Duration.ofSeconds(1));
            try {
                assertThat(headersSent.await(3, TimeUnit.SECONDS)).as("server delivered headers and partial body").isTrue();
                assertSanitizedUnavailable(result.get(4, TimeUnit.SECONDS));
                assertThat(Duration.ofNanos(System.nanoTime() - began)).isLessThan(Duration.ofSeconds(5));
            } finally {
                releaseBody.countDown();
                result.cancel(true);
            }
        }
    }

    @Test
    @Timeout(12)
    void actualTransportRejectsAnOversizedResponseWithoutLeakingItsBody() throws Exception {
        byte[] body = ("{\"access_token\":\"sensitive-partial-token" + "a".repeat(65536) + "\"}")
                .getBytes(StandardCharsets.UTF_8);
        try (var fixture = new LocalTransport(exchange -> {
            try {
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
            } catch (IOException cancelledByClient) {
                // The production subscriber may cancel while the loopback server is writing.
            } finally {
                exchange.close();
            }
        })) {
            Future<Throwable> result = fixture.request(Duration.ofSeconds(5));
            try {
                assertSanitizedUnavailable(result.get(4, TimeUnit.SECONDS));
            } finally {
                result.cancel(true);
            }
        }
    }

    private static void assertSanitizedUnavailable(Throwable failure) {
        assertThat(failure).isInstanceOfSatisfying(BusinessException.class, exception -> {
            assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ZALO_PROVIDER_UNAVAILABLE);
            assertThat(exception).hasNoCause().hasMessageNotContaining("sensitive-partial-token");
        });
    }

    @FunctionalInterface
    private interface LocalHandler {
        void handle(HttpExchange exchange) throws IOException;
    }

    private static final class LocalTransport implements AutoCloseable {
        private final ExecutorService handlers = Executors.newSingleThreadExecutor();
        private final ExecutorService callers = Executors.newSingleThreadExecutor();
        private final HttpServer server;
        private final HttpClient client;
        private final HttpZaloProviderGateway gateway;
        private final Method send;

        private LocalTransport(LocalHandler handler) throws Exception {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.setExecutor(handlers);
            server.createContext("/response", handler::handle);
            server.start();
            client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
                    .followRedirects(HttpClient.Redirect.NEVER).build();
            gateway = new HttpZaloProviderGateway(new ZaloProperties(), client, new ObjectMapper());
            // Only the transport is exercised locally; production provider URI constants stay fixed.
            send = HttpZaloProviderGateway.class.getDeclaredMethod("send", HttpRequest.class);
            send.setAccessible(true);
        }

        private Future<Throwable> request(Duration timeout) {
            var uri = URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/response");
            var request = HttpRequest.newBuilder(uri).timeout(timeout).GET().build();
            return callers.submit(() -> {
                try {
                    send.invoke(gateway, request);
                    return null;
                } catch (InvocationTargetException invocation) {
                    return invocation.getCause();
                }
            });
        }

        @Override
        public void close() throws InterruptedException {
            server.stop(0);
            callers.shutdownNow();
            handlers.shutdownNow();
            try {
                assertThat(callers.awaitTermination(3, TimeUnit.SECONDS)).as("HTTP caller terminates").isTrue();
                assertThat(handlers.awaitTermination(3, TimeUnit.SECONDS)).as("local server handler terminates").isTrue();
            } finally {
                client.shutdownNow();
                client.awaitTermination(Duration.ofSeconds(2));
            }
        }
    }
}
