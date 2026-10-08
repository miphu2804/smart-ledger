package com.smartledger.core.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.smartledger.core.config.*;
import com.smartledger.core.dto.response.AdminDashboardViews.*;
import com.smartledger.core.dto.response.AdminPageResponse;
import com.smartledger.core.entity.*;
import com.smartledger.core.enums.*;
import com.smartledger.core.exception.*;
import com.smartledger.core.repository.*;
import com.smartledger.core.security.*;
import com.smartledger.core.service.AdminAccessAuditService;
import com.smartledger.core.service.impl.AdminDashboardServiceImpl;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

/** Real controller, middleware, DB role guard and service. Only DB/Firebase boundaries are mocked. */
@WebMvcTest(AdminDashboardController.class)
@Import({SecurityConfiguration.class, TimeConfiguration.class, AdminWebConfiguration.class, AdminAccessGuard.class,
        BearerTokenAuthenticationFilter.class, RestAuthenticationEntryPoint.class, ApiExceptionHandler.class,
        AdminDashboardServiceImpl.class, AdminAccessAuditService.class})
class AdminDashboardControllerWebTest {
    private static final String[] ROUTES = {"overview", "users", "users/12", "shops", "shops/7", "shops/7/status-history", "access-logs"};
    private static final OffsetDateTime TIME = OffsetDateTime.parse("2026-10-01T14:30:00Z");
    @Autowired MockMvc mvc;
    @MockitoBean FirebaseTokenVerifier verifier;
    @MockitoBean AuthIdentityRepository identities;
    @MockitoBean AdminDashboardRepository dashboard;
    @MockitoBean AuditLogRepository audit;

    @BeforeEach
    void actors() {
        actor("admin", 42L, SystemRole.ADMIN, UserStatus.ACTIVE);
        actor("owner", 12L, SystemRole.OWNER, UserStatus.ACTIVE);
        actor("disabled", 43L, SystemRole.ADMIN, UserStatus.DISABLED);
        when(verifier.verify("invalid")).thenThrow(new FirebaseTokenVerificationException("invalid", null));
    }

    @Test
    void missingOrInvalidTokenCannotReachAnyAdminRepository() throws Exception {
        for (String route : ROUTES) {
            mvc.perform(get("/api/v1/admin/" + route)).andExpect(status().isUnauthorized());
            mvc.perform(get("/api/v1/admin/" + route).header("Authorization", "Bearer invalid"))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("unauthorized"));
        }
        verifyNoInteractions(dashboard, audit, identities);
    }

    @Test
    void ownerAndDisabledAdminAreRejectedBeforeReadingData() throws Exception {
        for (String route : ROUTES) {
            mvc.perform(get("/api/v1/admin/" + route).header("Authorization", "Bearer owner"))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("admin_access_required"));
            mvc.perform(get("/api/v1/admin/" + route).header("Authorization", "Bearer disabled"))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("account_disabled"));
        }
        verifyNoInteractions(dashboard, audit);
    }

    @Test
    void clientRoleShopAndActorHeadersDoNotGrantOrWidenAccess() throws Exception {
        mvc.perform(get("/api/v1/admin/users").header("Authorization", "Bearer owner")
                        .header("X-Role", "ADMIN").header("X-Shop-Id", "7").param("role", "ADMIN"))
                .andExpect(status().isForbidden());
        when(dashboard.ownAccessHistory(eq(42L), isNull(), isNull(), any(), any(), eq(0), eq(20)))
                .thenReturn(AdminPageResponse.of(List.of(), 0, 20, 0));
        mvc.perform(get("/api/v1/admin/access-logs").header("Authorization", "Bearer admin")
                        .header("X-Shop-Id", "999").param("actorUserId", "43"))
                .andExpect(status().isOk());
        verify(dashboard).ownAccessHistory(eq(42L), isNull(), isNull(), any(), any(), eq(0), eq(20));
        verify(audit).append(argThat(event -> event.getActorUserId() == 42 && event.getAction() == AuditAction.ADMIN_ACCESS_LOGS_VIEWED));
    }

    @Test
    void unknownProfileIsNotProvisionedOrPromoted() throws Exception {
        when(verifier.verify("unknown")).thenReturn(token("unknown"));
        when(identities.findWithUserByProviderSubject("unknown")).thenReturn(Optional.empty());
        mvc.perform(get("/api/v1/admin/overview").header("Authorization", "Bearer unknown"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("auth_profile_not_found"));
        verifyNoInteractions(dashboard, audit);
    }

    @Test
    void ownerListIsMaskedPagedAndAuditsOnlyQueryPresence() throws Exception {
        var item = new OwnerSummary(12L, "Owner", "***@***", "***567", UserStatus.ACTIVE, TIME, 3);
        when(dashboard.owners("private@example.test", UserStatus.ACTIVE, 0, 20))
                .thenReturn(AdminPageResponse.of(List.of(item), 0, 20, 1));
        var result = mvc.perform(get("/api/v1/admin/users").header("Authorization", "Bearer admin")
                        .param("query", " private@example.test ").param("status", "ACTIVE"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.items[0].maskedEmail").value("***@***"))
                .andExpect(jsonPath("$.items[0].createdAt").value("2026-10-01T21:30:00+07:00"))
                .andExpect(jsonPath("$.items[0].email").doesNotExist())
                .andExpect(jsonPath("$.page").value(0)).andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.totalElements").value(1)).andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain("private@example.test");
        verify(audit).append(argThat(event -> Boolean.TRUE.equals(event.getMetadata().get("queryPresent"))
                && Integer.valueOf(1).equals(event.getMetadata().get("resultCount"))
                && event.getEntityId() == null && event.getShopId() == null && event.getAction() == AuditAction.ADMIN_OWNERS_SEARCHED));
    }

    @Test
    void supportsOwnerDetailShopSearchArchivedDetailAndStatusOnlyHistory() throws Exception {
        when(dashboard.owner(12L)).thenReturn(Optional.of(new OwnerDetail(12L, "Owner", "owner@test", null,
                UserStatus.ACTIVE, TIME, TIME, 1)));
        var shop = new ShopDetail(7L, "Shop", "Retail", null, "Address", ShopStatus.ARCHIVED, null, "Closed",
                TIME, TIME, TIME, new OwnerContact(12L, "Owner", "owner@test", null, UserStatus.ACTIVE));
        when(dashboard.shop(7L)).thenReturn(Optional.of(shop));
        when(dashboard.shops("", ShopStatus.ARCHIVED, 12L, 0, 20)).thenReturn(AdminPageResponse.of(List.of(), 0, 20, 0));
        when(dashboard.statusHistory(7L, 0, 20)).thenReturn(AdminPageResponse.of(List.of(
                new ShopStatusEvent(1L, 42L, ShopStatus.ACTIVE, ShopStatus.INACTIVE, "Paused", "request", TIME)), 0, 20, 1));
        mvc.perform(get("/api/v1/admin/users/12").header("Authorization", "Bearer admin"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.email").value("owner@test"));
        mvc.perform(get("/api/v1/admin/shops").header("Authorization", "Bearer admin")
                        .param("ownerId", "12").param("status", "ARCHIVED"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
        var detail = mvc.perform(get("/api/v1/admin/shops/7").header("Authorization", "Bearer admin"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ARCHIVED"))
                .andExpect(jsonPath("$.owner.id").value(12)).andReturn().getResponse().getContentAsString();
        assertThat(detail).doesNotContain("metadata", "paidVnd", "outstandingVnd", "firebase", "token", "password");
        mvc.perform(get("/api/v1/admin/shops/7/status-history").header("Authorization", "Bearer admin"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].afterStatus").value("INACTIVE"))
                .andExpect(jsonPath("$.items[0].metadata").doesNotExist());
        verify(audit, times(4)).append(any());
    }

    @Test
    void overviewCountsAreNotMoneyAndUseInclusiveVietnamDates() throws Exception {
        when(dashboard.ownerCounts(any(), any())).thenReturn(new OwnerCounts(3, 2, 1, 1));
        when(dashboard.shopCounts(any(), any())).thenReturn(new ShopCounts(4, 2, 1, 1, 2));
        mvc.perform(get("/api/v1/admin/overview").header("Authorization", "Bearer admin")
                        .param("fromDate", "2026-10-01").param("toDate", "2026-10-01"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.timezone").value("Asia/Ho_Chi_Minh"))
                .andExpect(jsonPath("$.owners.total").value(3)).andExpect(jsonPath("$.shops.archived").value(1))
                .andExpect(jsonPath("$.collectedVnd").doesNotExist());
        verify(dashboard).ownerCounts(OffsetDateTime.parse("2026-10-01T00:00:00+07:00"),
                OffsetDateTime.parse("2026-10-02T00:00:00+07:00"));
    }

    @Test
    void invalidFiltersRangesAndPaginationNeverReadOrAudit() throws Exception {
        for (String[] param : new String[][] {{"page", "-1"}, {"size", "0"}, {"size", "101"},
                {"page", "2147483647"}, {"query", "x".repeat(151)}}) {
            mvc.perform(get("/api/v1/admin/users").header("Authorization", "Bearer admin").param(param[0], param[1]))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("invalid_admin_query"));
        }
        mvc.perform(get("/api/v1/admin/shops").header("Authorization", "Bearer admin").param("ownerId", "0"))
                .andExpect(status().isBadRequest());
        for (String[] range : new String[][] {{"2026-10-02", "2026-10-01"}, {"2025-01-01", "2026-10-01"}, {"2026-10-01", ""}}) {
            var request = get("/api/v1/admin/overview").header("Authorization", "Bearer admin").param("fromDate", range[0]);
            if (!range[1].isEmpty()) { request.param("toDate", range[1]); }
            mvc.perform(request).andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/v1/admin/access-logs").header("Authorization", "Bearer admin")
                        .param("from", "2026-10-01T00:00:00Z").param("to", "2026-10-01T00:00:00Z"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(dashboard, audit);
    }

    @Test
    void malformedParamsAndBusinessActionsCannotBecomeAdminAccessActions() throws Exception {
        for (String[] params : new String[][] {{"/users", "status", "INACTIVE"}, {"/shops", "status", "DISABLED"},
                {"/access-logs", "action", "SALE_VOIDED"}, {"/overview", "fromDate", "bad"}, {"/users", "page", "bad"}}) {
            mvc.perform(get("/api/v1/admin" + params[0]).header("Authorization", "Bearer admin").param(params[1], params[2]))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation_failed"));
        }
        verifyNoInteractions(dashboard, audit);
    }

    @Test
    void missingTargetsReturnSafe404WithoutSuccessAudit() throws Exception {
        when(dashboard.owner(99L)).thenReturn(Optional.empty()); when(dashboard.shop(99L)).thenReturn(Optional.empty());
        mvc.perform(get("/api/v1/admin/users/99").header("Authorization", "Bearer admin"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("owner_not_found"));
        mvc.perform(get("/api/v1/admin/shops/99").header("Authorization", "Bearer admin"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("shop_not_found"));
        mvc.perform(get("/api/v1/admin/shops/99/status-history").header("Authorization", "Bearer admin"))
                .andExpect(status().isNotFound());
        verifyNoInteractions(audit);
    }

    @Test
    void auditFailureReturns503AndNeverReturnsProtectedResponse() throws Exception {
        when(dashboard.owner(12L)).thenReturn(Optional.of(new OwnerDetail(12L, "Secret", "private@test", null,
                UserStatus.ACTIVE, TIME, TIME, 1)));
        doThrow(new DataAccessResourceFailureException("secret database error")).when(audit).append(any());
        var body = mvc.perform(get("/api/v1/admin/users/12").header("Authorization", "Bearer admin"))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("admin_audit_unavailable"))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("private@test", "Secret", "secret database");
    }

    @ParameterizedTest
    @ValueSource(strings = {"overview", "users", "users/12", "shops", "shops/7", "shops/7/status-history", "access-logs"})
    void adminReadEndpointsDoNotAcceptWrites(String route) throws Exception {
        for (var request : List.of(post("/api/v1/admin/" + route), patch("/api/v1/admin/" + route), delete("/api/v1/admin/" + route))) {
            mvc.perform(request.header("Authorization", "Bearer admin")).andExpect(status().isMethodNotAllowed());
        }
        verifyNoInteractions(dashboard, audit);
    }

    private void actor(String uid, long id, SystemRole role, UserStatus status) {
        var user = UserAccount.createOwner(uid, token(uid));
        ReflectionTestUtils.setField(user, "id", id); ReflectionTestUtils.setField(user, "systemRole", role);
        ReflectionTestUtils.setField(user, "status", status);
        when(verifier.verify(uid)).thenReturn(token(uid));
        when(identities.findWithUserByProviderSubject(uid)).thenReturn(Optional.of(AuthIdentity.forFirebase(user, uid)));
    }
    private VerifiedFirebaseToken token(String uid) { return new VerifiedFirebaseToken(uid, null, false, null, null, null); }
}
