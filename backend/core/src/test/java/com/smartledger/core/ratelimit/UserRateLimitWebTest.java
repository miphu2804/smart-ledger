package com.smartledger.core.ratelimit;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.entity.AuthIdentity;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.ApiExceptionHandler;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.AuthIdentityRepository;
import com.smartledger.core.security.*;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.springframework.web.bind.annotation.*;

class UserRateLimitWebTest {
    UserRateLimitService quota=mock(UserRateLimitService.class);
    AuthIdentityRepository identities=mock(AuthIdentityRepository.class);
    UserRateLimitFilter filter=new UserRateLimitFilter(quota,identities,new ObjectMapper());
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    @Test void allMediaPathsShareOneGroupAndReadDeleteOptionsBypass() {
        assertThat(RateLimitPolicy.match("POST","/api/v1/me/avatar")).isEqualTo(RateLimitPolicy.MEDIA_UPLOAD);
        assertThat(RateLimitPolicy.match("POST","/api/v1/products/2/image")).isEqualTo(RateLimitPolicy.MEDIA_UPLOAD);
        assertThat(RateLimitPolicy.match("POST","/api/v1/shops/9/logo")).isEqualTo(RateLimitPolicy.MEDIA_UPLOAD);
        for(String method:new String[]{"GET","DELETE","OPTIONS"}) assertThat(RateLimitPolicy.match(method,"/api/v1/me/avatar")).isNull();
        assertThat(RateLimitPolicy.match("POST","/api/v1/products/2/image/extra")).isNull();
    }
    @Test void verifiedCoreIdentityAnchorsWindowButDoesNotConsumeOrBlockReplay() throws Exception {
        var token=new VerifiedFirebaseToken("verified-uid",null,true,null,null,null);
        var user=UserAccount.createOwner("Owner",token); ReflectionTestUtils.setField(user,"id",7L);
        SecurityContextHolder.getContext().setAuthentication(new FirebaseAuthenticationToken(token));
        when(quota.enabled()).thenReturn(true);
        when(identities.findWithUserByProviderSubject("verified-uid")).thenReturn(Optional.of(AuthIdentity.forFirebase(user,"verified-uid")));
        var called=new java.util.concurrent.atomic.AtomicBoolean();
        filter.doFilter(new MockHttpServletRequest("POST","/api/v1/me/avatar"),new MockHttpServletResponse(),(r,s)->called.set(true));
        assertThat(called.get()).isTrue(); verify(quota).touch(7L,RateLimitPolicy.MEDIA_UPLOAD);
        verify(quota,never()).reserve(anyLong(),any(),any());
    }
    @Test void missingAuthenticationDoesNotQueryQuotaOrCreateProfile() throws Exception {
        when(quota.enabled()).thenReturn(true);
        filter.doFilter(new MockHttpServletRequest("POST","/api/v1/shops"),new MockHttpServletResponse(),(r,s)->{});
        verifyNoInteractions(identities); verify(quota,never()).touch(anyLong(),any());
    }
    @Test void unavailableQuotaStopsBeforeControllerWith503() throws Exception {
        var token=new VerifiedFirebaseToken("uid",null,true,null,null,null);
        var user=UserAccount.createOwner("Owner",token);ReflectionTestUtils.setField(user,"id",7L);
        SecurityContextHolder.getContext().setAuthentication(new FirebaseAuthenticationToken(token));
        when(quota.enabled()).thenReturn(true);
        when(identities.findWithUserByProviderSubject("uid")).thenReturn(Optional.of(AuthIdentity.forFirebase(user,"uid")));
        doThrow(new BusinessException(ErrorCode.RATE_LIMIT_UNAVAILABLE)).when(quota).touch(7L,RateLimitPolicy.SHOP_CREATE);
        var response=new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest("POST","/api/v1/shops"),response,(r,s)->{throw new AssertionError("must not write");});
        assertThat(response.getStatus()).isEqualTo(503);assertThat(response.getContentAsString()).contains("rate_limit_unavailable");
    }
    @RestController static class Probe {
        @PostMapping("/quota-test") void write() { throw new RateLimitExceededException(37); }
    }
    @Test void rateErrorUsesExistingEnvelopeAndRemainingRetryAfter() throws Exception {
        MockMvcBuilders.standaloneSetup(new Probe()).setControllerAdvice(new ApiExceptionHandler()).build()
                .perform(post("/quota-test")).andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After","37")).andExpect(header().string("Cache-Control","no-store"))
                .andExpect(jsonPath("$.code").value("rate_limited")).andExpect(jsonPath("$.traceId").isNotEmpty());
    }
}
