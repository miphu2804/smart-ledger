package com.smartledger.core.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(FirebaseProperties.class)
public class FirebaseAdminConfiguration {

    @Bean
    FirebaseApp firebaseApp(FirebaseProperties properties) throws IOException {
        if (!FirebaseApp.getApps().isEmpty()) {
            return FirebaseApp.getInstance();
        }

        FirebaseOptions.Builder options = FirebaseOptions.builder()
                .setCredentials(credentials(properties));
        if (StringUtils.hasText(properties.getProjectId())) {
            options.setProjectId(properties.getProjectId());
        }
        return FirebaseApp.initializeApp(options.build());
    }

    // Hosts such as Railway cannot mount a key file, so the key may arrive as env JSON text.
    private static GoogleCredentials credentials(FirebaseProperties properties) throws IOException {
        if (!StringUtils.hasText(properties.getServiceAccountJson())) {
            return GoogleCredentials.getApplicationDefault();
        }
        return GoogleCredentials.fromStream(new ByteArrayInputStream(
                properties.getServiceAccountJson().getBytes(StandardCharsets.UTF_8)));
    }

    @Bean
    FirebaseAuth firebaseAuth(FirebaseApp firebaseApp) {
        return FirebaseAuth.getInstance(firebaseApp);
    }
}
