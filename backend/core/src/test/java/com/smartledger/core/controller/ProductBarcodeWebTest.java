package com.smartledger.core.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.ApiExceptionHandler;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.repository.CategoryRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AuditLogService;
import com.smartledger.core.service.IdempotencyService;
import com.smartledger.core.service.MediaService;
import com.smartledger.core.service.NotificationEventService;
import com.smartledger.core.service.ShopService;
import com.smartledger.core.service.impl.ProductServiceImpl;
import jakarta.persistence.EntityManager;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

/** Exercises request binding and the real normalization service, without provider or DB writes. */
@WebMvcTest(ProductController.class)
@Import({SecurityConfiguration.class, BearerTokenAuthenticationFilter.class, RestAuthenticationEntryPoint.class,
        ApiExceptionHandler.class, ProductServiceImpl.class})
class ProductBarcodeWebTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @MockitoBean FirebaseTokenVerifier tokenVerifier;
    @MockitoBean ShopService shops;
    @MockitoBean ProductRepository products;
    @MockitoBean CategoryRepository categories;
    @MockitoBean AuditLogService audit;
    @MockitoBean IdempotencyService idempotency;
    @MockitoBean NotificationEventService notifications;
    @MockitoBean MediaService media;
    @MockitoBean EntityManager entityManager;

    @BeforeEach
    void authorize() {
        when(tokenVerifier.verify("valid-token"))
                .thenReturn(new VerifiedFirebaseToken("uid", null, false, null, null, null));
        Shop shop = Shop.create(42L, "Shop", "Retail", null, null);
        ReflectionTestUtils.setField(shop, "id", 7L);
        when(shops.requireOwnedActiveShop(any(), eq("7"))).thenReturn(shop);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t\n", "\u2003\u00a0", "ABC 123", "ABC\t123", "ABC\u00a0123"})
    void lookupRejectsMissingBlankOrMalformedCodesWithBarcodeDetails(String barcode) throws Exception {
        var request = get("/api/v1/products/lookup")
                .header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7");
        if (barcode != null) {
            request.param("barcode", barcode);
        }
        mvc.perform(request).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("validation_failed"))
                .andExpect(jsonPath("$.details[0].field").value("barcode"));
        org.mockito.Mockito.verifyNoInteractions(products);
    }

    @Test
    void lookupTrimsScannerSuffixAndPreservesLettersPunctuationAndCase() throws Exception {
        when(products.findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(7L, "AbC-123", CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product("AbC-123")));
        mvc.perform(get("/api/v1/products/lookup").param("barcode", "\u2003\u00a0 AbC-123\r\n")
                        .header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(3))
                .andExpect(jsonPath("$.barcode").value("AbC-123"))
                .andExpect(jsonPath("$.status").value("ACTIVE"));
        verify(products).findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(7L, "AbC-123", CatalogStatus.ACTIVE);
        verify(products, never()).findByIdAndShopIdAndStatus(any(), any(), any());
    }

    @ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = ErrorCode.class,
            names = {"SHOP_ACCESS_DENIED", "SHOP_INACTIVE", "ACCOUNT_DISABLED"})
    void lookupCannotBypassOwnerActiveShopOrAccountChecks(ErrorCode code) throws Exception {
        when(shops.requireOwnedActiveShop(any(), eq("7"))).thenThrow(new BusinessException(code));
        mvc.perform(get("/api/v1/products/lookup").param("barcode", "ABC-123")
                        .header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value(code.getCode()));
        org.mockito.Mockito.verifyNoInteractions(products);
    }

    @ParameterizedTest
    @ValueSource(ints = {0x41, 0x1F600, 0x20000})
    void allThreeOperationsEnforceLengthAfterTrimNotBeforeRequestBinding(int codePoint) throws Exception {
        String character = new String(Character.toChars(codePoint));
        String barcode = character.repeat(100);
        when(products.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(products.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product("old")));
        when(products.findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(7L, barcode, CatalogStatus.ACTIVE))
                .thenReturn(Optional.empty(), Optional.of(product(barcode)));

        mvc.perform(post("/api/v1/products").header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON).content(createBody("\u2003\u00a0 " + barcode + "\n")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.barcode").value(barcode));
        mvc.perform(patch("/api/v1/products/3").header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("barcode", "\u2003 " + barcode + "\u00a0"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.barcode").value(barcode));
        mvc.perform(get("/api/v1/products/lookup").param("barcode", " " + barcode + "\n")
                        .header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.barcode").value(barcode));

        for (String invalid : java.util.List.of(barcode + character, "ABC 123", "ABC\n123")) {
            mvc.perform(post("/api/v1/products").header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                            .contentType(MediaType.APPLICATION_JSON).content(createBody(invalid)))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"))
                    .andExpect(jsonPath("$.details[0].field").value("barcode"));
            mvc.perform(patch("/api/v1/products/3").header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("barcode", invalid))))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"))
                    .andExpect(jsonPath("$.details[0].field").value("barcode"));
            mvc.perform(get("/api/v1/products/lookup").param("barcode", invalid)
                            .header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"))
                    .andExpect(jsonPath("$.details[0].field").value("barcode"));
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {0x000B, 0x000C, 0x001C, 0x001D, 0x001E, 0x001F})
    void allThreeOperationsRejectNonScannerControlsAtBoundariesWithoutWrites(int codePoint) throws Exception {
        String control = Character.toString(codePoint);
        Product original = product("OLD");
        when(products.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(original));

        for (String invalid : java.util.List.of(control + "ABC", "ABC" + control, control,
                "\t " + control + "ABC\r\n")) {
            mvc.perform(post("/api/v1/products").header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                            .contentType(MediaType.APPLICATION_JSON).content(createBody(invalid)))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"))
                    .andExpect(jsonPath("$.details[0].field").value("barcode"));
            mvc.perform(patch("/api/v1/products/3").header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(Map.of("barcode", invalid, "name", "Must not change"))))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"))
                    .andExpect(jsonPath("$.details[0].field").value("barcode"));
            mvc.perform(get("/api/v1/products/lookup").param("barcode", invalid)
                            .header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"))
                    .andExpect(jsonPath("$.details[0].field").value("barcode"));
        }
        org.assertj.core.api.Assertions.assertThat(original.getBarcode()).isEqualTo("OLD");
        org.assertj.core.api.Assertions.assertThat(original.getName()).isEqualTo("Coffee");
        verify(products, never()).save(any());
        verify(products, never()).findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(any(), any(), any());
        verify(products, never()).findFirstByShopIdAndBarcodeAndStatusAndIdNotOrderByIdDesc(any(), any(), any(), any());
        org.mockito.Mockito.verifyNoInteractions(audit, notifications);
    }

    @Test
    void lookupRejectsOverlongCodeBeforeReadingProducts() throws Exception {
        mvc.perform(get("/api/v1/products/lookup").param("barcode", "A".repeat(101))
                        .header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"))
                .andExpect(jsonPath("$.details[0].field").value("barcode"));
        org.mockito.Mockito.verifyNoInteractions(products);
    }

    @Test
    void createConflictIncludesTheActiveProductIdWithoutSavingOrAuditing() throws Exception {
        when(products.findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(7L, "AbC-123", CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product("AbC-123")));
        mvc.perform(post("/api/v1/products").header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON).content(createBody(" AbC-123\n")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("product_barcode_conflict"))
                .andExpect(jsonPath("$.details.length()").value(1))
                .andExpect(jsonPath("$.details[0].field").value("barcode"))
                .andExpect(jsonPath("$.details[0].issue").value("already_in_use"))
                .andExpect(jsonPath("$.details[0].productId").value(3))
                .andExpect(jsonPath("$.details[0].status").value("ACTIVE"));
        verify(products).findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(7L, "AbC-123", CatalogStatus.ACTIVE);
        verify(products, never()).save(any());
        org.mockito.Mockito.verifyNoInteractions(audit, notifications);
    }

    @Test
    void patchConflictIncludesTheCompetingProductAndDoesNotChangeTheOriginal() throws Exception {
        Product original = product("OLD");
        when(products.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(original));
        Product conflict = product("AbC-123");
        ReflectionTestUtils.setField(conflict, "id", 4L);
        when(products.findFirstByShopIdAndBarcodeAndStatusAndIdNotOrderByIdDesc(7L, "AbC-123", CatalogStatus.ACTIVE, 3L))
                .thenReturn(Optional.of(conflict));
        mvc.perform(patch("/api/v1/products/3").header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("barcode", " AbC-123\n", "name", "Must not change"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("product_barcode_conflict"))
                .andExpect(jsonPath("$.details[0].productId").value(4))
                .andExpect(jsonPath("$.details[0].status").value("ACTIVE"));
        org.assertj.core.api.Assertions.assertThat(original.getBarcode()).isEqualTo("OLD");
        org.assertj.core.api.Assertions.assertThat(original.getName()).isEqualTo("Coffee");
        org.mockito.Mockito.verifyNoInteractions(audit, notifications);
    }

    @Test
    void ordinaryValidationErrorsDoNotAddNullConflictFields() throws Exception {
        mvc.perform(post("/api/v1/products").header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON).content(createBody("ABC 123")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("barcode"))
                .andExpect(jsonPath("$.details[0].productId").doesNotExist())
                .andExpect(jsonPath("$.details[0].status").doesNotExist());
        org.mockito.Mockito.verifyNoInteractions(products, audit, notifications);
    }

    @ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = ErrorCode.class,
            names = {"SHOP_ACCESS_DENIED", "SHOP_INACTIVE", "ACCOUNT_DISABLED"})
    void writesCheckShopAccessBeforeReadingConflictingProducts(ErrorCode code) throws Exception {
        when(shops.requireOwnedActiveShop(any(), eq("7"))).thenThrow(new BusinessException(code));
        mvc.perform(post("/api/v1/products").header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON).content(createBody("AbC-123")))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value(code.getCode()));
        mvc.perform(patch("/api/v1/products/3").header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"barcode\":\"AbC-123\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value(code.getCode()));
        org.mockito.Mockito.verifyNoInteractions(products, audit, notifications);
    }

    private String createBody(String barcode) throws Exception {
        return mapper.writeValueAsString(Map.of("name", "Coffee", "barcode", barcode, "unit", "cup",
                "sellingPriceVnd", 25000, "tracked", false));
    }

    private Product product(String barcode) {
        Product product = Product.create(7L);
        ReflectionTestUtils.setField(product, "id", 3L);
        product.replace(null, "Coffee", barcode, null, "cup", 25000L, null, false, null);
        return product;
    }
}
