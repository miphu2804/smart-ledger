package com.smartledger.core.controller;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.config.TimeConfiguration;
import com.smartledger.core.dto.response.*;
import com.smartledger.core.enums.*;
import com.smartledger.core.exception.*;
import com.smartledger.core.security.*;
import com.smartledger.core.service.NotificationService;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.LongStream;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(NotificationController.class)
@Import({SecurityConfiguration.class, TimeConfiguration.class, BearerTokenAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class, ApiExceptionHandler.class})
class NotificationControllerWebTest {
    @Autowired MockMvc mvc;
    @MockitoBean FirebaseTokenVerifier verifier;
    @MockitoBean NotificationService service;

    @BeforeEach void authenticate() {
        when(verifier.verify("valid")).thenReturn(new VerifiedFirebaseToken("owner", null, false, null, null, null));
    }

    @Test void allRoutesRequireAuthentication() throws Exception {
        mvc.perform(get("/api/v1/me/notifications")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/me/notifications/unread-count")).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/v1/me/notifications/1/read")).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/v1/me/notifications/read").contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[1]}"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test void inboxNeedsNoShopHeaderAndReturnsExplicitSafeProjection() throws Exception {
        var time = OffsetDateTime.parse("2026-10-08T01:00:00Z");
        var item = new NotificationResponse(1L, 7L, NotificationType.LOW_STOCK, "Sắp hết", "Còn 2 chai",
                "PRODUCT", 5L, time, null, null);
        when(service.list(any(), isNull(), isNull(), eq(false), eq(0), eq(20)))
                .thenReturn(new NotificationPageResponse(List.of(item), 0, 20, 1, 1));
        mvc.perform(get("/api/v1/me/notifications").header("Authorization", "Bearer valid"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(1))
                .andExpect(jsonPath("$.items[0].createdAt").value("2026-10-08T08:00:00+07:00"))
                .andExpect(jsonPath("$.items[0].targetType").value("PRODUCT"))
                .andExpect(jsonPath("$.items[0].dedupKey").doesNotExist())
                .andExpect(jsonPath("$.items[0].dataJson").doesNotExist())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test void countPassesShopAndTypeFilters() throws Exception {
        when(service.unreadCount(any(), eq(7L), eq(NotificationType.OUT_OF_STOCK))).thenReturn(3L);
        mvc.perform(get("/api/v1/me/notifications/unread-count").header("Authorization", "Bearer valid")
                        .param("shopId", "7").param("type", "OUT_OF_STOCK"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.unreadCount").value(3));
    }

    @Test void readEndpointsReturnNoContentAndAcceptExplicitIds() throws Exception {
        mvc.perform(patch("/api/v1/me/notifications/1/read").header("Authorization", "Bearer valid"))
                .andExpect(status().isNoContent());
        verify(service).markRead(any(), eq(List.of(1L)));
        mvc.perform(patch("/api/v1/me/notifications/read").header("Authorization", "Bearer valid")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[2,3]}"))
                .andExpect(status().isNoContent());
        verify(service).markRead(any(), eq(List.of(2L, 3L)));
    }

    @Test void invalidBatchPayloadsNeverReachService() throws Exception {
        String oversized = "{\"ids\":[" + LongStream.rangeClosed(1, 101).mapToObj(Long::toString).collect(Collectors.joining(",")) + "]}";
        for (String body : List.of("{}", "{\"ids\":[]}", "{\"ids\":[null]}", "{\"ids\":[0]}", "{\"ids\":[-1]}", oversized)) {
            mvc.perform(patch("/api/v1/me/notifications/read").header("Authorization", "Bearer valid")
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        }
        verifyNoInteractions(service);
    }

    @Test void invalidEnumAndMalformedIdsReturnValidationErrors() throws Exception {
        mvc.perform(get("/api/v1/me/notifications").header("Authorization", "Bearer valid").param("type", "AI_FAKE"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/v1/me/notifications/not-an-id/read").header("Authorization", "Bearer valid"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test void serviceAccessErrorsPreserveCoreErrorContract() throws Exception {
        doThrow(new BusinessException(ErrorCode.NOTIFICATION_NOT_FOUND)).when(service).markRead(any(), any());
        mvc.perform(patch("/api/v1/me/notifications/999/read").header("Authorization", "Bearer valid"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("notification_not_found"))
                .andExpect(jsonPath("$.traceId").isNotEmpty());
        when(service.unreadCount(any(), any(), any())).thenThrow(new BusinessException(ErrorCode.SHOP_ACCESS_DENIED));
        mvc.perform(get("/api/v1/me/notifications/unread-count").header("Authorization", "Bearer valid"))
                .andExpect(status().isForbidden());
    }

    @Test void paginationOverflowPreservesBadRequestErrorContract() throws Exception {
        when(service.list(any(), isNull(), isNull(), eq(false), eq(Integer.MAX_VALUE), eq(20)))
                .thenThrow(new BusinessException(ErrorCode.INVALID_NOTIFICATION_QUERY));
        mvc.perform(get("/api/v1/me/notifications").header("Authorization", "Bearer valid")
                        .param("page", "2147483647").param("size", "20"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_notification_query"))
                .andExpect(jsonPath("$.traceId").isNotEmpty());
    }
}
