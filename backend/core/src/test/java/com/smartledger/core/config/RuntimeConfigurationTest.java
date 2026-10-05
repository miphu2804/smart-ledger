package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class RuntimeConfigurationTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer());

    @Test
    void corsDefaultsToNoAllowedOrigins() {
        runner.run(context -> assertThat(context.getEnvironment()
                .getProperty("smartledger.cors.allowed-origins")).isEmpty());
    }

    @Test
    void acceptsHostedRuntimePort() {
        runner.withPropertyValues("PORT=9080").run(context ->
                assertThat(context.getEnvironment().getProperty("server.port", Integer.class)).isEqualTo(9080));
    }

    @Test
    void explicitServerPortTakesPrecedence() {
        runner.withPropertyValues("PORT=9080", "SERVER_PORT=9081").run(context ->
                assertThat(context.getEnvironment().getProperty("server.port", Integer.class)).isEqualTo(9081));
    }

    @Test
    void mapsCorsEnvironmentVariableAndKeepsSafeHealthSettings() {
        runner.withPropertyValues("CORS_ALLOWED_ORIGINS=https://owner.example.test").run(context -> {
            var environment = context.getEnvironment();
            assertThat(environment.getProperty("smartledger.cors.allowed-origins")).isEqualTo("https://owner.example.test");
            assertThat(environment.getProperty("management.endpoints.web.exposure.include")).isEqualTo("health");
            assertThat(environment.getProperty("management.endpoint.health.show-details")).isEqualTo("never");
            assertThat(environment.getProperty("management.endpoint.health.show-components")).isEqualTo("never");
            assertThat(environment.getProperty("management.endpoint.health.group.readiness.include")).isEqualTo("readinessState,db");
        });
    }

    @Test
    void documentationCanBeEnabledForStagingAndDisabledForProduction() {
        for (String enabled : new String[] {"true", "false"}) {
            runner.withPropertyValues("OPENAPI_ENABLED=" + enabled, "SWAGGER_UI_ENABLED=" + enabled)
                    .run(context -> {
                        assertThat(context.getEnvironment().getProperty("springdoc.api-docs.enabled", Boolean.class))
                                .isEqualTo(Boolean.valueOf(enabled));
                        assertThat(context.getEnvironment().getProperty("springdoc.swagger-ui.enabled", Boolean.class))
                                .isEqualTo(Boolean.valueOf(enabled));
                    });
        }
    }
}
