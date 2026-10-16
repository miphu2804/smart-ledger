package com.smartledger.core.zalo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.ApiErrorResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.Clock;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Fixed salted buckets bound memory without key admission failure or eviction-based quota resets. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class ZaloRequestLimiter extends OncePerRequestFilter {
    private static final String BASE = "/api/v1/auth/zalo/";
    private static final Set<String> PATHS = Set.of(BASE + "authorize", BASE + "callback", BASE + "exchange", BASE + "link");
    private static final int MAX_BODY_BYTES = 8192;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final int limit;
    private final Window[] windows;
    private final String bucketSalt = ZaloCrypto.randomToken();

    @Autowired
    public ZaloRequestLimiter(ObjectMapper mapper) { this(mapper, Clock.systemUTC(), 30, 4096); }
    ZaloRequestLimiter(ObjectMapper mapper, Clock clock, int limit, int bucketCount) {
        this.mapper = mapper; this.clock = clock; this.limit = limit;
        this.windows = new Window[bucketCount];
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) { return !PATHS.contains(request.getServletPath().isEmpty()
            ? request.getRequestURI().substring(request.getContextPath().length()) : request.getServletPath()); }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store");
        // Do not trust client-supplied forwarding headers as an identity/rate-limit key.
        String key = request.getRequestURI() + ":" + request.getRemoteAddr();
        if (!allow(key)) {
            response.setHeader("Retry-After", "60");
            error(response, 429, ErrorCode.ZALO_RATE_LIMITED);
            return;
        }
        if ("POST".equals(request.getMethod())) {
            byte[] body = request.getInputStream().readNBytes(MAX_BODY_BYTES + 1);
            if (body.length > MAX_BODY_BYTES) {
                error(response, 413, ErrorCode.INVALID_ZALO_REQUEST);
                return;
            }
            chain.doFilter(buffered(request, body), response);
        } else {
            chain.doFilter(request, response);
        }
    }

    private synchronized boolean allow(String key) {
        if (windows.length == 0 || limit <= 0) return false;
        long now = clock.millis();
        // Stable for this instance: key churn cannot evict/reset a bucket. A private salt prevents
        // choosing collisions from public String.hashCode. Colliding clients share quota conservatively.
        int bucket = Math.floorMod(ZaloCrypto.hash(bucketSalt + ":" + key).hashCode(), windows.length);
        Window window = windows[bucket];
        if (window == null || window.until <= now) {
            window = new Window(now + 60000);
            windows[bucket] = window;
        }
        if (window.count >= limit) return false;
        window.count++;
        return true;
    }

    private void error(HttpServletResponse response, int status, ErrorCode code) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        mapper.writeValue(response.getOutputStream(), new ApiErrorResponse(code.getCode(), code.getMessage(),
                List.of(), UUID.randomUUID().toString()));
    }

    private static HttpServletRequest buffered(HttpServletRequest request, byte[] body) {
        return new HttpServletRequestWrapper(request) {
            @Override public ServletInputStream getInputStream() {
                var input = new ByteArrayInputStream(body);
                return new ServletInputStream() {
                    @Override public int read() { return input.read(); }
                    @Override public int read(byte[] bytes, int offset, int length) { return input.read(bytes, offset, length); }
                    @Override public boolean isFinished() { return input.available() == 0; }
                    @Override public boolean isReady() { return true; }
                    @Override public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException(); }
                };
            }
            @Override public int getContentLength() { return body.length; }
            @Override public long getContentLengthLong() { return body.length; }
        };
    }

    private static final class Window {
        private final long until;
        private int count;
        private Window(long until) { this.until = until; }
    }
}
