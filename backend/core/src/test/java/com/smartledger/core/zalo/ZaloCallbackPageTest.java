package com.smartledger.core.zalo;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

class ZaloCallbackPageTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final ZaloCallbackPage page = new ZaloCallbackPage(mapper);

    @Test
    void htmlUsesExactOriginNonceAndNoUrlOrTokenFallback() {
        ResponseEntity<String> response = page.render(result("https://client.example", "request-123", "test-proof"),
                "attempt=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
        String html = response.getBody();
        assertThat(html).contains("const targetOrigin = \"https://client.example\";",
                "window.opener.postMessage(message, targetOrigin)", "window.opener && !window.opener.closed",
                "Không tìm thấy cửa sổ ứng dụng", "window.close()")
                .doesNotContain("postMessage(message, \"*\")", "location.href", "window.location",
                        "access_token", "refresh_token", "firebaseCustomToken", "?proof=");
        var matcher = Pattern.compile("<script nonce=\"([A-Za-z0-9_-]{43})\">").matcher(html);
        assertThat(matcher.find()).isTrue();
        String nonce = matcher.group(1);
        assertThat(response.getHeaders().getFirst("Content-Security-Policy"))
                .contains("default-src 'none'", "script-src 'nonce-" + nonce + "'", "frame-ancestors 'none'",
                        "base-uri 'none'", "form-action 'none'");
        assertThat(response.getHeaders().getFirst("Cache-Control")).isEqualTo("no-store");
        assertThat(response.getHeaders().getFirst("Referrer-Policy")).isEqualTo("no-referrer");
        assertThat(response.getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getHeaders().getFirst("Set-Cookie")).contains("Max-Age=0", "HttpOnly");
        assertThat(page.render(result("https://client.example", "r", "p"), "clear").getBody())
                .doesNotContain("nonce=\"" + nonce + "\"");
    }

    @Test
    void jsonEmbeddingEscapesScriptBreakoutAndUnicodeLineSeparators() {
        String malicious = "</script><script>window.injected=true</script>&\"\u2028\u2029";
        String html = page.render(result("https://client.example", malicious, malicious), "clear").getBody();
        assertThat(html).doesNotContain(malicious, "<script>window.injected")
                .contains("\\u003c/script\\u003e", "\\u0026", "\\u2028", "\\u2029");
        assertThat(html.split("</script>", -1)).hasSize(2);
    }

    @Test
    void exportsActualSyntheticResponseForBrowserRegressionWithoutCredentials() throws Exception {
        ResponseEntity<String> response = page.render(result("http://127.0.0.1:0", "browser-regression", "synthetic-proof"),
                "synthetic=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
        Path output = Path.of("target", "zalo-popup-test.json");
        Files.createDirectories(output.getParent());
        mapper.writeValue(output.toFile(), Map.of("html", response.getBody(),
                "headers", response.getHeaders().toSingleValueMap(), "proof", "synthetic-proof",
                "requestId", "browser-regression", "originPlaceholder", "http://127.0.0.1:0"));
        assertThat(Files.size(output)).isPositive();
    }

    private static ZaloCallbackResult result(String origin, String requestId, String proof) {
        return new ZaloCallbackResult(origin, requestId, ZaloPurpose.LOGIN, proof, null, "attempt");
    }
}
