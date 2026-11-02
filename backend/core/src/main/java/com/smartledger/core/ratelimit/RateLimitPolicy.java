package com.smartledger.core.ratelimit;

import java.time.Duration;
import java.util.List;
import java.util.regex.Pattern;

/** One policy per shared user quota; resource ids never become counter keys. */
public enum RateLimitPolicy {
    MEDIA_UPLOAD(10, Duration.ofSeconds(60), List.of(
            Pattern.compile("/api/v1/me/avatar"),
            Pattern.compile("/api/v1/products/[^/]+/image"),
            Pattern.compile("/api/v1/shops/[^/]+/logo"))),
    SHOP_CREATE(5, Duration.ofHours(24), List.of(Pattern.compile("/api/v1/shops")));

    private final int limit;
    private final Duration duration;
    private final List<Pattern> routes;

    RateLimitPolicy(int limit, Duration duration, List<Pattern> routes) {
        this.limit = limit; this.duration = duration; this.routes = routes;
    }
    public int limit() { return limit; }
    public long seconds() { return duration.toSeconds(); }
    public static RateLimitPolicy match(String method, String path) {
        if (!"POST".equals(method)) return null;
        for (var policy : values()) {
            if (policy.routes.stream().anyMatch(p -> p.matcher(path).matches())) return policy;
        }
        return null;
    }
}
