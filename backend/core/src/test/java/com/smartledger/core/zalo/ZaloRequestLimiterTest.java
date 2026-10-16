package com.smartledger.core.zalo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class ZaloRequestLimiterTest {
    private static final String EXCHANGE = "/api/v1/auth/zalo/exchange";

    @ParameterizedTest
    @ValueSource(strings = {"authorize", "callback", "exchange", "link"})
    void servletPathVariantsShareOneQuotaForEachEndpoint(String endpoint) throws Exception {
        String path = "/api/v1/auth/zalo/" + endpoint;
        var limiter = new ZaloRequestLimiter(new ObjectMapper(), new MutableClock(), 1, 4096);
        var first = request("GET", "/app" + path, new byte[0], false);
        first.setContextPath("/app");
        first.setServletPath(path);
        limiter.doFilter(first, new MockHttpServletResponse(), (r, s) -> {});

        for (String variant : new String[] {path + ";a=1", path + ";a=2",
                path.replace(endpoint, "%" + Integer.toHexString(endpoint.charAt(0)) + endpoint.substring(1))}) {
            var request = request("GET", "/app" + variant, new byte[0], false);
            request.setContextPath("/app");
            request.setServletPath(path);
            var response = new MockHttpServletResponse();
            FilterChain chain = mock(FilterChain.class);
            limiter.doFilter(request, response, chain);
            assertThat(response.getStatus()).as(variant).isEqualTo(429);
            assertThat(response.getContentAsString()).contains("zalo_rate_limited");
            verifyNoInteractions(chain);
        }
    }

    @Test
    void emptyServletPathFallbackExcludesContextPathFromQuotaKey() throws Exception {
        var limiter = new ZaloRequestLimiter(new ObjectMapper(), new MutableClock(), 1, 4096);
        var first = request("GET", "/app" + EXCHANGE, new byte[0], false);
        first.setContextPath("/app");
        limiter.doFilter(first, new MockHttpServletResponse(), (r, s) -> {});
        var second = request("GET", EXCHANGE, new byte[0], false);
        var response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);
        limiter.doFilter(second, response, chain);
        assertThat(response.getStatus()).isEqualTo(429);
        verifyNoInteractions(chain);
    }

    @Test
    void rejectsBeforeParsingOrReadingBodyWhenRateExceededAndIgnoresForwardingSpoof() throws Exception {
        var limiter = new ZaloRequestLimiter(new ObjectMapper(), Clock.systemUTC(), 1, 10);
        MockHttpServletRequest first = request("POST", EXCHANGE, new byte[0], false);
        first.addHeader("X-Forwarded-For", "192.0.2.1");
        limiter.doFilter(first, new MockHttpServletResponse(), (request, response) -> {});
        MockHttpServletRequest second = new MockHttpServletRequest("POST", EXCHANGE) {
            @Override public ServletInputStream getInputStream() { throw new AssertionError("must not read body"); }
        };
        second.addHeader("X-Forwarded-For", "192.0.2.2");
        FilterChain chain = mock(FilterChain.class);
        var response = new MockHttpServletResponse();
        limiter.doFilter(second, response, chain);
        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getContentAsString()).contains("zalo_rate_limited");
        assertThat(response.getHeader("Retry-After")).isEqualTo("60");
        verifyNoInteractions(chain);
    }

    @Test
    void newKeysRemainEligibleBeyondCapacityWithoutDroppingExistingCounters() throws Exception {
        MutableClock clock = new MutableClock();
        var limiter = new ZaloRequestLimiter(new ObjectMapper(), clock, 20, 1);
        for (int index = 0; index < 20; index++) {
            assertThat(rateStatus(limiter, "192.0.2." + index)).isEqualTo(200);
        }
        assertThat(rateStatus(limiter, "192.0.2.0")).isEqualTo(429);
    }

    @Test
    void churnCannotResetExhaustedQuotaAndCollisionWindowExpiresAtItsBoundary() throws Exception {
        MutableClock clock = new MutableClock();
        var limiter = new ZaloRequestLimiter(new ObjectMapper(), clock, 2, 1);
        assertThat(rateStatus(limiter, "192.0.2.1")).isEqualTo(200);
        assertThat(rateStatus(limiter, "192.0.2.1")).isEqualTo(200);
        for (int index = 2; index < 40; index++) {
            assertThat(rateStatus(limiter, "192.0.2." + index)).isEqualTo(429);
        }
        assertThat(rateStatus(limiter, "192.0.2.1")).isEqualTo(429);
        clock.instant = clock.instant.plusMillis(59_999);
        assertThat(rateStatus(limiter, "192.0.2.1")).isEqualTo(429);
        clock.instant = clock.instant.plusMillis(1);
        assertThat(rateStatus(limiter, "192.0.2.1")).isEqualTo(200);
        assertThat(rateStatus(limiter, "2001:db8::2")).isEqualTo(200);
        assertThat(rateStatus(limiter, "192.0.2.1")).isEqualTo(429);
    }

    @Test
    void concurrentDistinctClientsShareOneBoundedBucketWithoutExceedingItsQuota() throws Exception {
        var limiter = new ZaloRequestLimiter(new ObjectMapper(), new MutableClock(), 7, 1);
        List<Callable<Integer>> calls = IntStream.range(0, 80)
                .mapToObj(index -> (Callable<Integer>) () -> rateStatus(limiter, "192.0.2." + index)).toList();
        try (var executor = Executors.newFixedThreadPool(8)) {
            int accepted = 0;
            for (var result : executor.invokeAll(calls)) {
                int status = result.get();
                assertThat(status).isIn(200, 429);
                if (status == 200) accepted++;
            }
            assertThat(accepted).isEqualTo(7);
        }
    }

    @Test
    void zeroCapacityFailsClosedForZaloRoutes() throws Exception {
        var limiter = new ZaloRequestLimiter(new ObjectMapper(), new MutableClock(), 30, 0);
        assertThat(rateStatus(limiter, "192.0.2.1")).isEqualTo(429);
    }

    @Test
    void unrelatedPathsBypassLimiterAndDoNotReadBodies() throws Exception {
        var limiter = new ZaloRequestLimiter(new ObjectMapper(), Clock.systemUTC(), 0, 0);
        for (String path : new String[] {"/api/v1/auth/session", "/api/v1/products", "/api/v1/auth/zalo/not-an-endpoint"}) {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", path) {
                @Override public ServletInputStream getInputStream() { throw new AssertionError("unrelated body read"); }
            };
            var response = new MockHttpServletResponse();
            var called = new AtomicReference<>(false);
            limiter.doFilter(request, response, (r, s) -> called.set(true));
            assertThat(called.get()).isTrue();
            assertThat(response.getStatus()).isEqualTo(200);
            assertThat(response.getHeader("Cache-Control")).isNull();
        }
    }

    @Test
    void acceptsExactlyEightKiBAndPreservesBodyForKnownAndUnknownContentLength() throws Exception {
        for (boolean unknownLength : new boolean[] {false, true}) {
            var limiter = new ZaloRequestLimiter(new ObjectMapper(), Clock.systemUTC(), 10, 10);
            byte[] body = "x".repeat(8192).getBytes(java.nio.charset.StandardCharsets.UTF_8);
            var response = new MockHttpServletResponse();
            var received = new AtomicReference<byte[]>();
            limiter.doFilter(request("POST", EXCHANGE, body, unknownLength), response, (r, s) -> {
                received.set(r.getInputStream().readAllBytes());
                assertThat(((HttpServletRequest) r).getContentLengthLong()).isEqualTo(8192);
            });
            assertThat(received.get()).isEqualTo(body);
            assertThat(response.getStatus()).isEqualTo(200);
        }
    }

    @Test
    void rejectsOverEightKiBWithoutCallingParserForKnownAndUnknownContentLength() throws Exception {
        for (boolean unknownLength : new boolean[] {false, true}) {
            var limiter = new ZaloRequestLimiter(new ObjectMapper(), Clock.systemUTC(), 10, 10);
            FilterChain chain = mock(FilterChain.class);
            var response = new MockHttpServletResponse();
            limiter.doFilter(request("POST", EXCHANGE, new byte[8193], unknownLength), response, chain);
            assertThat(response.getStatus()).isEqualTo(413);
            assertThat(response.getContentAsString()).contains("invalid_zalo_request");
            verifyNoInteractions(chain);
        }
    }

    private static int rateStatus(ZaloRequestLimiter limiter, String remoteAddress) throws Exception {
        var request = request("GET", "/api/v1/auth/zalo/authorize", new byte[0], false);
        request.setRemoteAddr(remoteAddress);
        var response = new MockHttpServletResponse();
        limiter.doFilter(request, response, (r, s) -> {});
        return response.getStatus();
    }

    private static MockHttpServletRequest request(String method, String path, byte[] body, boolean unknownLength) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path) {
            @Override public int getContentLength() { return unknownLength ? -1 : super.getContentLength(); }
            @Override public long getContentLengthLong() { return unknownLength ? -1 : super.getContentLengthLong(); }
        };
        request.setContent(body);
        return request;
    }

    private static final class MutableClock extends Clock {
        private Instant instant = Instant.parse("2026-10-16T00:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return instant; }
    }
}
