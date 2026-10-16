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
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class ZaloRequestLimiterTest {
    private static final String EXCHANGE = "/api/v1/auth/zalo/exchange";

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
    void boundedRateMapRejectsNewKeysUntilWindowExpiresThenResets() throws Exception {
        MutableClock clock = new MutableClock();
        var limiter = new ZaloRequestLimiter(new ObjectMapper(), clock, 1, 1);
        var first = new MockHttpServletResponse();
        limiter.doFilter(request("GET", "/api/v1/auth/zalo/authorize", new byte[0], false), first, (r, s) -> {});
        assertThat(first.getStatus()).isEqualTo(200);
        var capacity = new MockHttpServletResponse();
        limiter.doFilter(request("POST", EXCHANGE, new byte[0], false), capacity, (r, s) -> {
            throw new AssertionError("capacity exceeded");
        });
        assertThat(capacity.getStatus()).isEqualTo(429);
        clock.instant = clock.instant.plusSeconds(60);
        var reset = new MockHttpServletResponse();
        limiter.doFilter(request("POST", EXCHANGE, new byte[0], false), reset, (r, s) -> {});
        assertThat(reset.getStatus()).isEqualTo(200);
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
