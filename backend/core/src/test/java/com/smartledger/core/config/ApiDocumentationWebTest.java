package com.smartledger.core.config;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.smartledger.core.controller.AuthController;
import com.smartledger.core.controller.ProductController;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.service.AuthSessionService;
import com.smartledger.core.service.MediaService;
import com.smartledger.core.service.ProductService;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

class ApiDocumentationWebTest {
    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class,
            FlywayAutoConfiguration.class})
    @Import({SecurityConfiguration.class, OpenApiConfiguration.class, AuthController.class, ProductController.class,
            BearerTokenAuthenticationFilter.class, RestAuthenticationEntryPoint.class})
    static class TestApplication { }

    abstract static class SecurityChecks {
        @Autowired protected MockMvc mvc;
        @MockitoBean protected FirebaseTokenVerifier verifier;
        @MockitoBean protected AuthSessionService service;
        @MockitoBean protected MediaService media;
        @MockitoBean protected ProductService products;
        @MockitoBean(name = "dbHealthIndicator") protected HealthIndicator database;

        @Test
        void documentationSettingNeverBypassesBusinessAuthentication() throws Exception {
            mvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("unauthorized"));
            verifyNoInteractions(verifier, service);
        }
    }

    @Nested
    @SpringBootTest(classes = TestApplication.class, properties = {"OPENAPI_ENABLED=true", "SWAGGER_UI_ENABLED=true"})
    @AutoConfigureMockMvc
    class Enabled extends SecurityChecks {
        @Test
        void productSchemasSeparateInitialStockFromPatchAndDocumentStockIn() throws Exception {
            mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.paths['/api/v1/products/{productId}/stock-in'].post.responses['200']").exists())
                    .andExpect(jsonPath("$.components.schemas.ProductStockInRequest.required[0]").value("quantity"))
                    .andExpect(jsonPath("$.components.schemas.ProductPatchRequest.properties.stockQuantity").doesNotExist())
                    .andExpect(jsonPath("$.components.schemas.ProductWriteRequest.properties.stockQuantity").exists())
                    .andExpect(jsonPath("$.components.schemas.ProductResponse.properties.stockQuantity").exists());
            verifyNoInteractions(products);
        }

        @Test
        void openApiAndSwaggerAreAvailableForStaging() throws Exception {
            mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.info.title").value("SmartLedger Core API"))
                    .andExpect(jsonPath("$.paths['/api/v1/me'].get").exists())
                    .andExpect(jsonPath("$.components.securitySchemes.bearerAuth.scheme").value("bearer"));
            mvc.perform(get("/v3/api-docs/swagger-config")).andExpect(status().isOk());
            mvc.perform(get("/swagger-ui.html")).andExpect(status().is3xxRedirection());
            mvc.perform(get("/swagger-ui/index.html")).andExpect(status().isOk());
            verifyNoInteractions(verifier, service);
        }
    }

    @Nested
    @SpringBootTest(classes = TestApplication.class, properties = {"OPENAPI_ENABLED=false", "SWAGGER_UI_ENABLED=false"})
    @AutoConfigureMockMvc
    class Disabled extends SecurityChecks {
        @Test
        void documentationRoutesAreUnavailableWhenDisabled() throws Exception {
            for (String path : new String[] {"/v3/api-docs", "/v3/api-docs/swagger-config", "/swagger-ui.html",
                    "/swagger-ui/index.html"}) {
                mvc.perform(get(path)).andExpect(status().isNotFound());
            }
            verifyNoInteractions(verifier, service);
        }
    }
}
