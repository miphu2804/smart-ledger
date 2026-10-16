package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ZaloNativePropertiesTest {
    private static final String CALLBACK = "https://core.example.test/api/v1/auth/zalo/callback";

    @Test
    void nativeIsOffByDefaultAndPublicClientIdIsNotAuthentication() {
        var properties = configured();
        assertThatThrownBy(() -> properties.requireClient("android-staging", CALLBACK)).isInstanceOf(BusinessException.class);
        properties.setEnabled(true);
        properties.requireClient("android-staging", CALLBACK);
        assertThatThrownBy(() -> properties.requireClient("android-production", CALLBACK)).isInstanceOf(BusinessException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"http://core.example.test/mobile/auth/zalo/complete",
            "https://evil.example.test/mobile/auth/zalo/complete",
            "https://core.example.test/other", "https://core.example.test/mobile/auth/zalo/complete?next=evil",
            "https://core.example.test/mobile/auth/zalo/complete#token", "https://user@core.example.test/mobile/auth/zalo/complete",
            "https://core.example.test/mobile/auth/zalo/%63omplete"})
    void targetMustBeExactHttpsReturnPathOnCallbackOrigin(String url) {
        var properties = configured();
        properties.setEnabled(true);
        properties.setReturnUrl(url);
        assertThatThrownBy(() -> properties.requireClient("android-staging", CALLBACK)).isInstanceOf(BusinessException.class);
    }

    @Test
    void requiresExplicitCertificateAndLimitsHandoffLifetime() {
        var properties = configured();
        properties.setEnabled(true);
        properties.setCertificateSha256(java.util.List.of());
        assertThatThrownBy(() -> properties.requireClient("android-staging", CALLBACK)).isInstanceOf(BusinessException.class);
        var invalid = configured();
        invalid.setEnabled(true);
        invalid.setHandoffTtlSeconds(91);
        assertThatThrownBy(() -> invalid.requireClient("android-staging", CALLBACK)).isInstanceOf(BusinessException.class);
        assertThat(configured().getPackageName()).isEqualTo("vn.teamhexa.songheloi");
    }

    public static ZaloNativeProperties configured() {
        var properties = new ZaloNativeProperties();
        properties.setClientId("android-staging");
        properties.setReturnTargetId("core-staging");
        properties.setReturnUrl("https://core.example.test/mobile/auth/zalo/complete");
        properties.setCertificateSha256(java.util.List.of("FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C"));
        return properties;
    }
}
