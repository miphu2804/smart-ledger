package com.smartledger.core.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.dto.response.CategoryResponse;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.ApiExceptionHandler;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.CategoryService;
import com.smartledger.core.service.ProductService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = {CategoryController.class, ProductController.class})
@Import({SecurityConfiguration.class, BearerTokenAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class, ApiExceptionHandler.class})
class CatalogControllerWebTest {
    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private FirebaseTokenVerifier tokenVerifier;

    @MockitoBean
    private CategoryService categoryService;

    @MockitoBean
    private ProductService productService;

    @BeforeEach
    void validToken() {
        when(tokenVerifier.verify("valid-token"))
                .thenReturn(new VerifiedFirebaseToken("uid", null, false, null, null, null));
    }

    @Test
    void categoryCreateReturns201() throws Exception {
        when(categoryService.create(any(), eq("7"), any()))
                .thenReturn(new CategoryResponse(3L, 7L, "Đồ uống", CatalogStatus.ACTIVE, null, null));

        mvc.perform(post("/api/v1/categories")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Đồ uống\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(3))
                .andExpect(jsonPath("$.shopId").value(7));
    }

    @Test
    void categoryCreateRejectsBlankNameWith400() throws Exception {
        mvc.perform(post("/api/v1/categories")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\" \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
    }

    @Test
    void categoryListRequiresAuthentication() throws Exception {
        mvc.perform(get("/api/v1/categories").header("X-Shop-Id", "7"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("unauthorized"));
    }

    @Test
    void categoryArchiveWithActiveProductsReturns409() throws Exception {
        org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.CATEGORY_HAS_PRODUCTS))
                .when(categoryService).archive(any(), eq("7"), eq("3"));

        mvc.perform(delete("/api/v1/categories/3")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("category_has_products"));
    }

    @Test
    void categoryArchiveReturns204WhenEmpty() throws Exception {
        mvc.perform(delete("/api/v1/categories/3")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7"))
                .andExpect(status().isNoContent());

        verify(categoryService).archive(any(), eq("7"), eq("3"));
    }

    @Test
    void productCreateWithCategoryReturns201() throws Exception {
        when(productService.create(any(), eq("7"), any()))
                .thenReturn(new ProductResponse(5L, 7L, 3L, "Cà phê", null, null, "ly",
                        25000L, null, false, null, CatalogStatus.ACTIVE, null, null));

        mvc.perform(post("/api/v1/products")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":3,"name":"Cà phê","unit":"ly",
                                 "sellingPriceVnd":25000,"tracked":false}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(5))
                .andExpect(jsonPath("$.categoryId").value(3));
    }

    @Test
    void productCreateRejectsInvalidPriceWith400() throws Exception {
        mvc.perform(post("/api/v1/products")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"categoryId":3,"name":"Cà phê","unit":"ly",
                                 "sellingPriceVnd":-1,"tracked":false}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"));
    }

    @Test
    void productListReturns403WhenShopIsNotAccessible() throws Exception {
        when(productService.list(any(), eq("8")))
                .thenThrow(new BusinessException(ErrorCode.SHOP_ACCESS_DENIED));

        mvc.perform(get("/api/v1/products")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "8"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("shop_access_denied"));
    }

    @Test
    void productArchiveReturns204() throws Exception {
        mvc.perform(delete("/api/v1/products/5")
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7"))
                .andExpect(status().isNoContent());

        verify(productService).archive(any(), eq("7"), eq("5"));
    }
}
