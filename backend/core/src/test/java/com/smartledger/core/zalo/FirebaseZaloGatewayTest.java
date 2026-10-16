package com.smartledger.core.zalo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import com.google.firebase.auth.UserRecord;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import org.junit.jupiter.api.Test;

class FirebaseZaloGatewayTest {
    private final FirebaseAuth auth = mock(FirebaseAuth.class);
    private final Instant now = Instant.parse("2026-10-16T10:00:00Z");
    private final FirebaseZaloGateway gateway = new FirebaseZaloGateway(auth, Clock.fixed(now, ZoneOffset.UTC));

    @Test
    void existingEnabledAccountGetsCustomTokenWithoutProfileOrClaimWrites() throws Exception {
        when(auth.getUser("uid")).thenReturn(mock(UserRecord.class));
        when(auth.createCustomToken("uid")).thenReturn("custom-token");
        assertThat(gateway.mintCustomToken("uid", false)).isEqualTo("custom-token");
        verify(auth).getUser("uid");
        verify(auth).createCustomToken("uid");
        verifyNoMoreInteractions(auth);
    }

    @Test
    void disabledAccountNeverGetsToken() throws Exception {
        UserRecord user = mock(UserRecord.class);
        when(user.isDisabled()).thenReturn(true);
        when(auth.getUser("uid")).thenReturn(user);
        assertThatThrownBy(() -> gateway.mintCustomToken("uid", true)).isInstanceOf(BusinessException.class);
        verify(auth, never()).createCustomToken(anyString());
    }

    @Test
    void missingAccountAllowedOnlyForNewUnprovisionedCoreUser() throws Exception {
        FirebaseAuthException absent = mock(FirebaseAuthException.class);
        when(absent.getAuthErrorCode()).thenReturn(AuthErrorCode.USER_NOT_FOUND);
        when(auth.getUser("uid")).thenThrow(absent);
        assertThatThrownBy(() -> gateway.mintCustomToken("uid", false)).isInstanceOf(BusinessException.class);
        when(auth.createCustomToken("uid")).thenReturn("new-custom-token");
        assertThat(gateway.mintCustomToken("uid", true)).isEqualTo("new-custom-token");
    }

    @Test
    void recentLinkTokenChecksRevocationAndAuthenticationTime() throws Exception {
        FirebaseToken token = mock(FirebaseToken.class);
        when(token.getUid()).thenReturn("uid");
        when(token.getClaims()).thenReturn(Map.of("auth_time", now.minusSeconds(300).getEpochSecond()));
        when(auth.verifyIdToken("id-token", true)).thenReturn(token);
        assertThat(gateway.verifyRecentUid("id-token")).isEqualTo("uid");
        verify(auth).verifyIdToken("id-token", true);
        for (long seconds : new long[] {now.minusSeconds(301).getEpochSecond(), now.plusSeconds(1).getEpochSecond()}) {
            when(token.getClaims()).thenReturn(Map.of("auth_time", seconds));
            assertThatThrownBy(() -> gateway.verifyRecentUid("id-token")).isInstanceOf(BusinessException.class);
        }
        when(token.getClaims()).thenReturn(Map.of("iat", now.getEpochSecond()));
        assertThatThrownBy(() -> gateway.verifyRecentUid("id-token")).isInstanceOf(BusinessException.class);
    }

    @Test
    void providerErrorsAreSanitizedAndDoNotMint() throws Exception {
        FirebaseAuthException unavailable = mock(FirebaseAuthException.class);
        when(auth.getUser("uid")).thenThrow(unavailable);
        assertThatThrownBy(() -> gateway.mintCustomToken("uid", true)).isInstanceOf(BusinessException.class)
                .hasNoCause();
        verify(auth, never()).createCustomToken(anyString());
    }

    @Test
    void revokedAndExpiredLinkTokensRequireReauthenticationWithoutMintingOrLeakingCause() throws Exception {
        for (AuthErrorCode code : new AuthErrorCode[] {AuthErrorCode.REVOKED_ID_TOKEN, AuthErrorCode.EXPIRED_ID_TOKEN}) {
            reset(auth);
            FirebaseAuthException failure = mock(FirebaseAuthException.class);
            when(failure.getAuthErrorCode()).thenReturn(code);
            when(failure.getMessage()).thenReturn("raw-sensitive-provider-token");
            when(auth.verifyIdToken("id-token", true)).thenThrow(failure);
            assertThatThrownBy(() -> gateway.verifyRecentUid("id-token"))
                    .isInstanceOfSatisfying(BusinessException.class, error ->
                            assertThat(error.getErrorCode()).isEqualTo(ErrorCode.ZALO_REAUTHENTICATION_REQUIRED))
                    .hasNoCause().hasMessageNotContaining("raw-sensitive-provider-token");
            verify(auth).verifyIdToken("id-token", true);
            verifyNoMoreInteractions(auth);
        }
    }

    @Test
    void malformedAuthenticationTimeAndEmptyUidCannotLink() throws Exception {
        FirebaseToken token = mock(FirebaseToken.class);
        when(token.getUid()).thenReturn("uid");
        when(auth.verifyIdToken("id-token", true)).thenReturn(token);
        for (Object value : new Object[] {now.getEpochSecond() - 0.5, Long.toString(now.getEpochSecond()),
                Boolean.TRUE, Double.NaN, Double.POSITIVE_INFINITY}) {
            when(token.getClaims()).thenReturn(Map.of("auth_time", value));
            assertThatThrownBy(() -> gateway.verifyRecentUid("id-token"))
                    .isInstanceOfSatisfying(BusinessException.class, error ->
                            assertThat(error.getErrorCode()).isEqualTo(ErrorCode.ZALO_REAUTHENTICATION_REQUIRED))
                    .hasNoCause();
        }
        when(token.getClaims()).thenReturn(Map.of("auth_time", now.getEpochSecond()));
        for (String uid : new String[] {null, "", "   "}) {
            when(token.getUid()).thenReturn(uid);
            assertThatThrownBy(() -> gateway.verifyRecentUid("id-token"))
                    .isInstanceOfSatisfying(BusinessException.class, error ->
                            assertThat(error.getErrorCode()).isEqualTo(ErrorCode.ZALO_REAUTHENTICATION_REQUIRED))
                    .hasNoCause();
        }
        verify(auth, never()).createCustomToken(anyString());
    }

    @Test
    void malformedRawLinkTokenIsRejectedBeforeCallingFirebase() {
        for (String raw : new String[] {null, "", "   ", "x".repeat(16001)}) {
            assertThatThrownBy(() -> gateway.verifyRecentUid(raw))
                    .isInstanceOfSatisfying(BusinessException.class, error ->
                            assertThat(error.getErrorCode()).isEqualTo(ErrorCode.ZALO_REAUTHENTICATION_REQUIRED))
                    .hasNoCause();
        }
        verifyNoInteractions(auth);
    }
}
