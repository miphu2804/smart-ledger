package com.smartledger.core.ratelimit;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.config.UserRateLimitConfiguration;
import com.smartledger.core.entity.AuthIdentity;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.repository.AuthIdentityRepository;
import com.smartledger.core.security.*;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.*;

@WebMvcTest(controllers=UserRateLimitSecurityWebTest.Probe.class,
        properties={"smartledger.rate-limit.enabled=true","smartledger.cors.allowed-origins=https://owner.example.test"})
@Import({SecurityConfiguration.class,UserRateLimitConfiguration.class,BearerTokenAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class,UserRateLimitSecurityWebTest.Probe.class})
class UserRateLimitSecurityWebTest {
    @Autowired MockMvc mvc;
    @Autowired SecurityFilterChain chain;
    @Autowired FilterRegistrationBean<UserRateLimitFilter> registration;
    @MockitoBean FirebaseTokenVerifier verifier;
    @MockitoBean AuthIdentityRepository identities;
    @MockitoBean UserRateLimitService quota;
    @BeforeEach void setup() {
        var token=new VerifiedFirebaseToken("verified-uid",null,true,null,null,null);
        when(verifier.verify("good")).thenReturn(token);
        when(verifier.verify("bad")).thenThrow(new FirebaseTokenVerificationException("invalid",null));
        when(quota.enabled()).thenReturn(true);
        var user=UserAccount.createOwner("Owner",token);ReflectionTestUtils.setField(user,"id",7L);
        when(identities.findWithUserByProviderSubject("verified-uid")).thenReturn(Optional.of(AuthIdentity.forFirebase(user,"verified-uid")));
    }
    @RestController static class Probe {
        @PostMapping("/api/v1/shops") String create() { return "test-only"; }
        @GetMapping("/api/v1/shops/7") String read() { return "test-only"; }
    }
    @Test void quotaRunsAfterBearerAndExactlyOnceInsideSecurityChain() throws Exception {
        mvc.perform(post("/api/v1/shops").header("Authorization","Bearer good").header("X-User-Id","9999"))
                .andExpect(status().isOk());
        var order=inOrder(verifier,identities,quota);
        order.verify(verifier).verify("good");order.verify(identities).findWithUserByProviderSubject("verified-uid");
        order.verify(quota).touch(7L,RateLimitPolicy.SHOP_CREATE);
        assertThat(chain.getFilters().stream().filter(f->f instanceof UserRateLimitFilter).count()).isEqualTo(1);
        assertThat(registration.isEnabled()).isFalse();
    }
    @Test void invalidOrMissingTokenKeeps401WithoutQuotaLookup() throws Exception {
        mvc.perform(post("/api/v1/shops")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/shops").header("Authorization","Bearer bad")).andExpect(status().isUnauthorized());
        verifyNoInteractions(identities);verify(quota,never()).touch(anyLong(),any());
    }
    @Test void readsAndCorsPreflightDoNotAnchorQuotaAndRetryAfterIsExposed() throws Exception {
        mvc.perform(get("/api/v1/shops/7").header("Authorization","Bearer good")
                .header("Origin","https://owner.example.test"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Expose-Headers","Retry-After"));
        mvc.perform(options("/api/v1/shops").header("Origin","https://owner.example.test")
                .header("Access-Control-Request-Method","POST").header("Access-Control-Request-Headers","authorization"))
                .andExpect(status().isOk());
        verifyNoInteractions(identities);verify(quota,never()).touch(anyLong(),any());
    }
}
