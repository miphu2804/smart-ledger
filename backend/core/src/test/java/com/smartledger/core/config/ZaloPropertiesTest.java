package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.exception.BusinessException;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.Test;

class ZaloPropertiesTest {
    @Test
    void disabledDefaultsFailClosedWithoutRequiringSecrets() {
        assertThatThrownBy(() -> new ZaloProperties().requireEnabled()).isInstanceOf(BusinessException.class);
    }

    @Test
    void validConfigurationAcceptsStringAppIdAndExactHttpsEndpoints() {
        valid().requireEnabled();
    }

    @Test
    void enabledConfigurationRejectsIncompleteOrUnsafeValues() {
        for (String callback : List.of("http://core.example/api/v1/auth/zalo/callback",
                "https://core.example/other", "https://user@core.example/api/v1/auth/zalo/callback",
                "https://core.example/api/v1/auth/zalo/callback?code=x")) {
            ZaloProperties properties = valid();
            properties.setCallbackUrl(callback);
            assertThatThrownBy(properties::requireEnabled).isInstanceOf(BusinessException.class);
        }
        for (String origin : List.of("*", "https://*.example", "https://web.example/", "http://web.example",
                "https://user@web.example", "https://web.example?x=1")) {
            ZaloProperties properties = valid();
            properties.setClientOrigins(List.of(origin));
            assertThatThrownBy(properties::requireEnabled).isInstanceOf(BusinessException.class);
        }
        ZaloProperties properties = valid();
        properties.setAppSecret("secret\r\nheader");
        assertThatThrownBy(properties::requireEnabled).isInstanceOf(BusinessException.class)
                .hasMessageNotContaining("secret");
        properties = valid();
        properties.setSessionEncryptionKey(Base64.getEncoder().encodeToString(new byte[16]));
        assertThatThrownBy(properties::requireEnabled).isInstanceOf(BusinessException.class);
    }

    @Test
    void rejectsInvalidTtlsTimeoutAndMissingCredentials() {
        ZaloProperties properties = valid();
        properties.setProofTtlSeconds(0);
        assertThatThrownBy(properties::requireEnabled).isInstanceOf(BusinessException.class);
        properties = valid();
        properties.setSessionTtlSeconds(0);
        assertThatThrownBy(properties::requireEnabled).isInstanceOf(BusinessException.class);
        properties = valid();
        properties.setHttpTimeoutSeconds(0);
        assertThatThrownBy(properties::requireEnabled).isInstanceOf(BusinessException.class);
        properties = valid();
        properties.setClientOrigins(List.of());
        assertThatThrownBy(properties::requireEnabled).isInstanceOf(BusinessException.class);
        properties = valid();
        properties.setAppSecret(" ");
        assertThatThrownBy(properties::requireEnabled).isInstanceOf(BusinessException.class);
    }

    private static ZaloProperties valid() {
        ZaloProperties properties = new ZaloProperties();
        properties.setEnabled(true);
        properties.setAppId("3632655625730637557");
        properties.setAppSecret("test-only-secret");
        properties.setCallbackUrl("https://core.example/api/v1/auth/zalo/callback");
        properties.setClientOrigins(List.of("https://web.example"));
        properties.setSessionEncryptionKey(Base64.getEncoder().encodeToString(new byte[32]));
        return properties;
    }
}
