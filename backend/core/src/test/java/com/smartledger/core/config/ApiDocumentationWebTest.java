package com.smartledger.core.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.controller.AuthController;
import com.smartledger.core.controller.CustomerController;
import com.smartledger.core.controller.DebtController;
import com.smartledger.core.controller.ExpenseController;
import com.smartledger.core.controller.ProductController;
import com.smartledger.core.controller.SaleController;
import com.smartledger.core.controller.SaleDraftController;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.service.AuthSessionService;
import com.smartledger.core.service.CustomerService;
import com.smartledger.core.service.DebtService;
import com.smartledger.core.service.ExpenseService;
import com.smartledger.core.service.MediaService;
import com.smartledger.core.service.ProductService;
import com.smartledger.core.service.SaleService;
import com.smartledger.core.service.SaleDraftService;
import com.smartledger.core.service.SaleVoidService;
import java.util.List;
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
            SaleController.class, SaleDraftController.class, CustomerController.class,
            DebtController.class, ExpenseController.class,
            BearerTokenAuthenticationFilter.class, RestAuthenticationEntryPoint.class})
    static class TestApplication { }

    abstract static class SecurityChecks {
        @Autowired protected MockMvc mvc;
        @Autowired protected ObjectMapper mapper;
        @MockitoBean protected FirebaseTokenVerifier verifier;
        @MockitoBean protected AuthSessionService service;
        @MockitoBean protected MediaService media;
        @MockitoBean protected ProductService products;
        @MockitoBean protected SaleService sales;
        @MockitoBean protected SaleDraftService drafts;
        @MockitoBean protected CustomerService customers;
        @MockitoBean protected DebtService debts;
        @MockitoBean protected ExpenseService expenses;
        @MockitoBean protected SaleVoidService voids;
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
        void ownerListSchemasAreObjectsWithPaginationDefaultsRatherThanArrays() throws Exception {
            JsonNode api = mapper.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString());
            for (String resource : List.of("products", "sales", "sale-drafts", "customers", "debts", "expenses")) {
                JsonNode operation = api.path("paths").path("/api/v1/" + resource).path("get");
                JsonNode content = operation.path("responses").path("200").path("content");
                assertThat(content.isEmpty()).as(resource + " response content").isFalse();
                JsonNode response = content.elements().next().path("schema");
                JsonNode schema = response.has("$ref") ? api.at(response.path("$ref").asText().substring(1)) : response;
                assertThat(schema.path("type").asText()).as(resource).isEqualTo("object");
                assertThat(schema.path("properties").has("items")).as(resource).isTrue();
                assertThat(schema.path("properties").path("items").path("type").asText()).isEqualTo("array");
                for (String field : List.of("page", "size", "totalElements", "totalPages")) {
                    assertThat(schema.path("properties").path(field).path("type").asText())
                            .as(resource + "." + field).isEqualTo("integer");
                }
                assertThat(parameter(operation, "page").path("schema").path("default").asInt(-1)).isZero();
                assertThat(parameter(operation, "size").path("schema").path("default").asInt(-1)).isEqualTo(20);
                assertThat(operation.path("description").asText()).contains("size 1-100", "not an array");
            }
            verifyNoInteractions(products, sales, drafts, customers, debts, expenses);
        }

        @Test
        void salesAndExpensesDocumentOffsetTimestampNamesAndHalfOpenRanges() throws Exception {
            JsonNode api = mapper.readTree(mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString());
            for (String resource : List.of("sales", "expenses")) {
                JsonNode operation = api.path("paths").path("/api/v1/" + resource).path("get");
                for (String name : List.of("from", "to")) {
                    JsonNode query = parameter(operation, name);
                    assertThat(query.path("in").asText()).isEqualTo("query");
                    assertThat(query.path("required").asBoolean()).isFalse();
                    assertThat(query.path("schema").path("type").asText()).isEqualTo("string");
                    assertThat(query.path("schema").path("format").asText()).isEqualTo("date-time");
                }
                for (JsonNode query : operation.path("parameters")) {
                    assertThat(query.path("name").asText()).isNotIn("fromDate", "toDate");
                }
                String timeField = resource.equals("sales") ? "soldAt" : "expenseAt";
                assertThat(operation.path("description").asText())
                        .contains("offset", timeField + " >= from", timeField + " < to");
            }
            verifyNoInteractions(sales, expenses);
        }

        private JsonNode parameter(JsonNode operation, String name) {
            for (JsonNode parameter : operation.path("parameters")) {
                if (name.equals(parameter.path("name").asText())) return parameter;
            }
            throw new AssertionError("Missing OpenAPI parameter: " + name);
        }

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
