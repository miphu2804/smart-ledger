package com.smartledger.core.zalo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.config.ZaloNativeProperties;
import com.smartledger.core.config.ZaloProperties;
import com.smartledger.core.exception.BusinessException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

class ZaloNativePageTest {
    private static final String TARGET = "https://core.example.test/mobile/auth/zalo/complete";
    private static final String CERTIFICATE = "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C";
    private static ZaloNativePage page() {
        var properties = new ZaloNativeProperties(); properties.setClientId("android-staging");
        properties.setReturnTargetId("core-staging"); properties.setReturnUrl(TARGET); properties.setCertificateSha256(List.of(CERTIFICATE));
        var zalo = new ZaloProperties(); zalo.setCallbackUrl("https://core.example.test/api/v1/auth/zalo/callback");
        return new ZaloNativePage(properties, zalo);
    }

    @Test
    void callbackUsesOnlyFixedTargetAndOpaqueReferenceFragmentWithSafeHeaders() {
        var result = new ZaloNativeCallbackResult(TARGET, "android-staging", "request-1234567890", ZaloPurpose.LOGIN, "r".repeat(43), null);
        var response = page().callback(result, "flow=; Max-Age=0; Secure; HttpOnly");
        String location = response.getHeaders().getFirst("Location");
        assertThat(location).startsWith(TARGET + "#").contains("handoffReference=" + "r".repeat(43)).doesNotContain("?", "proof=", "code=", "verifier=", "token=");
        assertThat(response.getBody()).contains("&amp;", "Quay lại ứng dụng").doesNotContain("<script", "access_token", "firebaseCustomToken");
        assertThat(response.getHeaders().getFirst("Cache-Control")).isEqualTo("no-store");
        assertThat(response.getHeaders().getFirst("Referrer-Policy")).isEqualTo("no-referrer");
        assertThat(response.getHeaders().getFirst("Content-Security-Policy")).contains("default-src 'none'", "frame-ancestors 'none'");
        assertThat(response.getHeaders().getFirst("Set-Cookie")).contains("Max-Age=0");
        var error = page().callback(new ZaloNativeCallbackResult(TARGET, "android-staging", "request-1234567890", ZaloPurpose.LINK, null, "zalo_consent_denied"), "clear");
        assertThat(error.getHeaders().getFirst("Location")).contains("purpose=LINK", "error=zalo_consent_denied").doesNotContain("handoffReference");
    }

    @Test
    void publicAssociationIsExplicitEvenWhileNativeOffAndInvalidConfigFailsClosed() {
        assertThat(page().assetLinks()).singleElement().satisfies(value -> {
            assertThat(value.get("relation")).isEqualTo(List.of("delegate_permission/common.handle_all_urls"));
            assertThat(value.get("target")).isEqualTo(Map.of("namespace", "android_app", "package_name", "vn.teamhexa.songheloi", "sha256_cert_fingerprints", List.of(CERTIFICATE)));
        });
        var disabled = new ZaloNativePage(new ZaloNativeProperties(), new ZaloProperties());
        assertThatThrownBy(disabled::assetLinks).isInstanceOf(BusinessException.class);
        assertThatThrownBy(disabled::landing).isInstanceOf(BusinessException.class);
    }

    @Test
    void landingHasMatchingNonceStrictCspAndExportsOnlySyntheticArtifactForScriptTests() throws Exception {
        var response = page().landing();
        String html = response.getBody();
        var nonce = Pattern.compile("<script nonce=\"([A-Za-z0-9_-]{43})\">").matcher(html);
        assertThat(nonce.find()).isTrue();
        assertThat(response.getHeaders().getFirst("Content-Security-Policy")).contains("script-src 'nonce-" + nonce.group(1) + "'", "base-uri 'none'", "form-action 'none'")
                .doesNotContain("unsafe-inline", "unsafe-eval", "https:");
        assertThat(html).contains("history.replaceState", "link.hidden = false", "params.getAll(k).length !== 1")
                .doesNotContain("fetch(", "localStorage", "postMessage", "innerHTML", "access_token", "firebaseCustomToken");
        Path output = Path.of("target", "zalo-native-landing-test.json");
        Files.createDirectories(output.getParent());
        new ObjectMapper().writeValue(output.toFile(), Map.of("html", html, "target", TARGET, "clientId", "android-staging", "synthetic", true));
        assertThat(Files.size(output)).isPositive();
    }
}
