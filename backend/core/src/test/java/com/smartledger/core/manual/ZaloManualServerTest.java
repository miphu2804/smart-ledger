package com.smartledger.core.manual;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ZaloManualServerTest {
    @Test
    void configurationPinsDatabaseAndFirebaseWhileIgnoringBusinessEnvironment() {
        var values = ZaloManualServer.settings(config(), "synthetic-service-account-json");
        assertThat(values).containsEntry("server.address", "127.0.0.1")
                .containsEntry("server.port", "18081")
                .containsEntry("spring.datasource.url", ZaloManualServer.JDBC_URL)
                .containsEntry("firebase.project-id", "smart-ledger-c2892")
                .containsEntry("cloudinary.enabled", "false")
                .containsEntry("zalo.callback-url", "https://manual.example.test/api/v1/auth/zalo/callback")
                .containsEntry("spring.jpa.hibernate.ddl-auto", "validate")
                .containsEntry("spring.flyway.enabled", "false");
        assertThat(values.get("zalo.session-encryption-key")).isNotBlank();
    }

    @Test
    void manualRunRequiresExplicitConsentAndExactHttpsOrigin() {
        var missingConsent = config();
        missingConsent.remove("ZALO_MANUAL_CONFIRM_FIREBASE_STAGING");
        assertThatThrownBy(() -> ZaloManualServer.settings(missingConsent, "json")).isInstanceOf(IllegalArgumentException.class);
        for (String origin : new String[] {"http://localhost:8792", "https://manual.example.test/",
                "https://manual.example.test/path", "https://u:p@manual.example.test", "https://*.example.test"}) {
            var config = config();
            config.put("ZALO_MANUAL_ORIGIN", origin);
            var invalid = config;
            assertThatThrownBy(() -> ZaloManualServer.settings(invalid, "json"))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void refusesWrongProjectOrNonServiceAccountWithoutEchoingCredential() {
        assertThatThrownBy(() -> ZaloManualServer.validateCredential(
                "{\"type\":\"service_account\",\"project_id\":\"smartledger-production\",\"private_key\":\"DO_NOT_ECHO\"}"))
                .isInstanceOf(IllegalArgumentException.class).hasMessageNotContaining("DO_NOT_ECHO");
        assertThatThrownBy(() -> ZaloManualServer.validateCredential("bad-json-DO_NOT_ECHO"))
                .isInstanceOf(IllegalArgumentException.class).hasMessageNotContaining("DO_NOT_ECHO");
        ZaloManualServer.validateCredential("{\"type\":\"service_account\",\"project_id\":\"smart-ledger-c2892\"}");
    }

    private static Map<String, String> config() {
        var config = new HashMap<String, String>();
        config.put("ZALO_MANUAL_CONFIRM_FIREBASE_STAGING", "true");
        config.put("ZALO_MANUAL_ORIGIN", "https://manual.example.test");
        config.put("ZALO_APP_ID", "3632655625730637557");
        config.put("ZALO_APP_SECRET", "synthetic-test-secret");
        return config;
    }
}
