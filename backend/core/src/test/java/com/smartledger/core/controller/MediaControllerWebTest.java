package com.smartledger.core.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.dto.response.ShopResponse;
import com.smartledger.core.dto.response.UserResponse;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.exception.ApiExceptionHandler;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.MediaService;
import com.smartledger.core.service.ProductService;
import com.smartledger.core.service.ShopService;
import com.smartledger.core.service.AuthSessionService;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockMultipartFile;

@WebMvcTest(controllers = {ProductController.class, ShopController.class, AuthController.class})
@Import({SecurityConfiguration.class, BearerTokenAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class, ApiExceptionHandler.class})
class MediaControllerWebTest {
    @Autowired private MockMvc mvc;
    @MockitoBean private FirebaseTokenVerifier tokenVerifier;
    @MockitoBean private MediaService media;
    @MockitoBean private ProductService productService;
    @MockitoBean private ShopService shopService;
    @MockitoBean private AuthSessionService authSessionService;

    @BeforeEach
    void authenticate() {
        when(tokenVerifier.verify("valid-token"))
                .thenReturn(new VerifiedFirebaseToken("uid", null, false, null, null, null));
    }

    @Test
    void productUploadRequiresShopAndIdempotencyHeadersAndForwardsTheImage() throws Exception {
        when(media.uploadProductImage(any(), eq("7"), eq("9"), eq("request-key"), any()))
                .thenReturn(product());
        MockMultipartFile image = new MockMultipartFile("image", "item.png", MediaType.IMAGE_PNG_VALUE,
                new byte[] {1, 2, 3});

        mvc.perform(multipart("/api/v1/products/9/image").file(image)
                        .header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7")
                        .header("Idempotency-Key", "request-key"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imageUrl").value("https://cdn.example/product.png"));

        verify(media).uploadProductImage(any(), eq("7"), eq("9"), eq("request-key"), any());
    }

    @Test
    void shopLogoAndAvatarExposeOnlyThePublicDeliveryUrl() throws Exception {
        when(media.uploadShopLogo(any(), eq("7"), eq("shop-key"), any())).thenReturn(shop());
        when(media.uploadAvatar(any(), any())).thenReturn(new UserResponse(
                1L, "Thảo", null, null, "https://cdn.example/avatar.png"));
        MockMultipartFile image = new MockMultipartFile("image", "image.png", MediaType.IMAGE_PNG_VALUE,
                new byte[] {1});

        mvc.perform(multipart("/api/v1/shops/7/logo").file(image)
                        .header("Authorization", "Bearer valid-token")
                        .header("Idempotency-Key", "shop-key"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.logoUrl").value("https://cdn.example/logo.png"));
        mvc.perform(multipart("/api/v1/me/avatar").file(image)
                        .header("Authorization", "Bearer valid-token"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.avatarUrl").value("https://cdn.example/avatar.png"));
    }

    @Test
    void imageDeleteIsIdempotentAtTheHttpBoundary() throws Exception {
        mvc.perform(delete("/api/v1/products/9/image")
                        .header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7"))
                .andExpect(status().isNoContent());
        verify(media).deleteProductImage(any(), eq("7"), eq("9"));
    }

    private static ProductResponse product() {
        return new ProductResponse(9L, 7L, null, "Mì", null, "https://cdn.example/product.png", "gói",
                10000L, null, false, null, CatalogStatus.ACTIVE, OffsetDateTime.now(), OffsetDateTime.now());
    }

    private static ShopResponse shop() {
        return new ShopResponse(7L, "Tiệm", "Grocery", null, null, "https://cdn.example/logo.png",
                ShopStatus.ACTIVE, null, null);
    }
}
