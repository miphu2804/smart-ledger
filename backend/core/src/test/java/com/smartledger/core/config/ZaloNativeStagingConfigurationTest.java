package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.exception.BusinessException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;

class ZaloNativeStagingConfigurationTest {
    @Test
    void reviewedStagingExampleEnablesOnlyItsExplicitClientAndAssociation() throws Exception {
        var values = new Properties();
        try (var reader = Files.newBufferedReader(Path.of("config", "zalo-native-staging.env.example"), StandardCharsets.UTF_8)) {
            values.load(reader);
        }
        Map<String, Object> variables = new HashMap<>();
        values.forEach((key, value) -> variables.put(key.toString(), value));
        var environment = new StandardEnvironment();
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
        environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource("reviewed-staging", variables));
        var nativeProperties = Binder.get(environment).bind("zalo.native", Bindable.of(ZaloNativeProperties.class)).get();
        String callback = environment.getProperty("zalo.callback-url");
        assertThat(values.getProperty("ZALO_ENABLED")).isEqualTo("true");
        assertThat(nativeProperties.isEnabled()).isTrue();
        nativeProperties.requireClient("android-staging", callback);
        assertThat(nativeProperties.getReturnTargetId()).isEqualTo("core-staging");
        assertThat(nativeProperties.getReturnUrl()).isEqualTo("https://core-staging-01d2.up.railway.app/mobile/auth/zalo/complete");
        assertThat(nativeProperties.getPackageName()).isEqualTo("vn.teamhexa.songheloi");
        assertThat(nativeProperties.getCertificateSha256()).containsExactly("FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C");
        assertThatThrownBy(() -> nativeProperties.requireClient("android-production", callback)).isInstanceOf(BusinessException.class);
        assertThat(variables.keySet()).doesNotContain("ZALO_APP_SECRET", "ZALO_SESSION_ENCRYPTION_KEY",
                "FIREBASE_SERVICE_ACCOUNT_JSON", "DATABASE_URL", "DATABASE_PASSWORD", "FLYWAY_ENABLED");
    }

    @Test
    void runtimeDefaultRemainsOffAndExampleIsNeverAutoLoaded() throws Exception {
        assertThat(new ZaloNativeProperties().isEnabled()).isFalse();
        String application = Files.readString(Path.of("src", "main", "resources", "application.yml"));
        assertThat(application).contains("${ZALO_NATIVE_ENABLED:false}").doesNotContain("zalo-native-staging.env.example");
    }
}
