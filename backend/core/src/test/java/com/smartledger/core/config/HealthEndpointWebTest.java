package com.smartledger.core.config;

import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.actuate.jdbc.DataSourceHealthIndicator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.availability.AvailabilityChangeEvent;
import org.springframework.boot.availability.LivenessState;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(classes = HealthEndpointWebTest.TestApplication.class)
@AutoConfigureMockMvc
class HealthEndpointWebTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class,
            FlywayAutoConfiguration.class})
    @Import({SecurityConfiguration.class, BearerTokenAuthenticationFilter.class, RestAuthenticationEntryPoint.class})
    static class TestApplication { }

    @Autowired private MockMvc mvc;
    @Autowired private ApplicationContext context;
    @MockitoBean private FirebaseTokenVerifier verifier;
    @MockitoBean(name = "dbHealthIndicator") private HealthIndicator database;

    @BeforeEach
    void healthy() {
        when(database.health()).thenReturn(Health.up().withDetail("jdbc", "must-not-be-exposed").build());
        when(database.getHealth(anyBoolean())).thenAnswer(invocation -> database.health());
        when(verifier.verify("valid")).thenReturn(new VerifiedFirebaseToken("owner", null, false, null, null, null));
        AvailabilityChangeEvent.publish(context, LivenessState.CORRECT);
        AvailabilityChangeEvent.publish(context, ReadinessState.ACCEPTING_TRAFFIC);
        clearInvocations(database, verifier);
    }

    @Test
    void publicHealthShowsStatusOnly() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"UP\",\"groups\":[\"liveness\",\"readiness\"]}", JsonCompareMode.STRICT));
        for (String path : new String[] {"/actuator/health/liveness", "/actuator/health/readiness"}) {
            mvc.perform(get(path)).andExpect(status().isOk())
                    .andExpect(content().json("{\"status\":\"UP\"}", JsonCompareMode.STRICT));
        }
        verifyNoInteractions(verifier);
    }

    @Test
    void databaseFailureAffectsReadinessButNotLiveness() throws Exception {
        when(database.health()).thenReturn(Health.down().withDetail("error", "must-not-be-exposed").build());
        mvc.perform(get("/actuator/health/readiness")).andExpect(status().isServiceUnavailable())
                .andExpect(content().json("{\"status\":\"DOWN\"}", JsonCompareMode.STRICT));
        mvc.perform(get("/actuator/health")).andExpect(status().isServiceUnavailable())
                .andExpect(content().json("{\"status\":\"DOWN\",\"groups\":[\"liveness\",\"readiness\"]}", JsonCompareMode.STRICT));
        clearInvocations(database);
        mvc.perform(get("/actuator/health/liveness")).andExpect(status().isOk());
        verifyNoInteractions(database, verifier);
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "CORE_TEST_POSTGRES_URL", matches = "jdbc:postgresql:.+")
    void readinessUsesRealPostgresConnectivityAndRejectsBadCredentials() throws Exception {
        // Delegate to Boot's actual JDBC contributor, using only the disposable test database.
        var source = new DriverManagerDataSource(System.getenv("CORE_TEST_POSTGRES_URL"),
                System.getenv("CORE_TEST_POSTGRES_USERNAME"), System.getenv("CORE_TEST_POSTGRES_PASSWORD"));
        var contributor = new DataSourceHealthIndicator(source);
        doAnswer(invocation -> contributor.health()).when(database).health();
        mvc.perform(get("/actuator/health/readiness")).andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"UP\"}", JsonCompareMode.STRICT));
        source.setUsername("invalid_core004_probe_user");
        mvc.perform(get("/actuator/health/readiness")).andExpect(status().isServiceUnavailable())
                .andExpect(content().json("{\"status\":\"DOWN\"}", JsonCompareMode.STRICT));
        clearInvocations(database);
        mvc.perform(get("/actuator/health/liveness")).andExpect(status().isOk());
        verifyNoInteractions(database, verifier);
    }

    @Test
    void readinessTracksApplicationAvailability() throws Exception {
        AvailabilityChangeEvent.publish(context, ReadinessState.REFUSING_TRAFFIC);
        mvc.perform(get("/actuator/health/readiness")).andExpect(status().isServiceUnavailable())
                .andExpect(content().json("{\"status\":\"OUT_OF_SERVICE\"}", JsonCompareMode.STRICT));
        mvc.perform(get("/actuator/health/liveness")).andExpect(status().isOk());
    }

    @Test
    void brokenProcessFailsLiveness() throws Exception {
        AvailabilityChangeEvent.publish(context, LivenessState.BROKEN);
        mvc.perform(get("/actuator/health/liveness")).andExpect(status().isServiceUnavailable());
    }

    @Test
    void noOtherManagementEndpointIsExposed() throws Exception {
        for (String path : new String[] {"/actuator/env", "/actuator/beans", "/actuator/configprops"}) {
            mvc.perform(get(path).header("Authorization", "Bearer valid")).andExpect(status().isNotFound());
        }
    }

    @Test
    void publicAccessIsLimitedToExactGetPaths() throws Exception {
        mvc.perform(post("/actuator/health")).andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/health/db")).andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/env")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/products")).andExpect(status().isUnauthorized());
        verifyNoInteractions(verifier);
    }
}
