package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.smartledger.core.config.ZaloProperties;
import com.smartledger.core.dto.request.ZaloProofRequest;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.ZaloOAuthRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.ZaloAuthServiceImpl;
import com.smartledger.core.zalo.*;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.util.UriComponentsBuilder;

class ZaloAuthServiceTest {
    private static final String ORIGIN = "https://owner.example.test";
    private static final String STATE = "s".repeat(43);
    private static final String BINDING = "b".repeat(43);
    private static final String VERIFIER = "v".repeat(43);
    private static final String PROOF = "p".repeat(43);
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-10-16T03:00:00Z");
    private final ZaloProperties props = properties();
    private final ZaloCrypto crypto = new ZaloCrypto(props);
    private final ZaloOAuthRepository repository = mock(ZaloOAuthRepository.class);
    private final ZaloProviderGateway provider = mock(ZaloProviderGateway.class);
    private final FirebaseZaloGateway firebase = mock(FirebaseZaloGateway.class);
    private final ZaloAuthService service = new ZaloAuthServiceImpl(props, crypto, repository, provider, firebase,
            Clock.fixed(NOW.toInstant(), ZoneOffset.UTC));

    @Test
    void disabledDoesNotTouchStorageProvidersOrRequireNewSecrets() {
        props.setEnabled(false);
        props.setSessionEncryptionKey(null);
        assertError(() -> authorize(), ErrorCode.ZALO_UNAVAILABLE);
        assertError(() -> service.exchange(request(), ORIGIN), ErrorCode.ZALO_UNAVAILABLE);
        assertError(() -> service.callback(STATE, "code", null, null, BINDING), ErrorCode.ZALO_UNAVAILABLE);
        assertError(() -> service.link(request(), ORIGIN, principal("owner"), "token"), ErrorCode.ZALO_UNAVAILABLE);
        service.cleanupExpiredSessions();
        verifyNoInteractions(repository, provider, firebase);
    }

    @Test
    void authorizeStoresOnlyHashedSecretsAndEncryptedProviderVerifier() {
        ZaloAuthorizationResult result = authorize();
        var stored = ArgumentCaptor.forClass(ZaloOAuthSession.class);
        verify(repository).insert(stored.capture());
        var session = stored.getValue();
        var query = UriComponentsBuilder.fromUriString(result.authorizationUrl()).build().getQueryParams();
        assertThat(result.authorizationUrl()).startsWith("https://oauth.zaloapp.com/v4/permission?");
        assertThat(query.getFirst("app_id")).isEqualTo("3632655625730637557");
        assertThat(session.stateHash()).isEqualTo(ZaloCrypto.hash(query.getFirst("state")));
        assertThat(session.browserBindingHash()).isEqualTo(ZaloCrypto.hash(result.cookieValue()));
        assertThat(query.getFirst("code_challenge"))
                .isEqualTo(ZaloCrypto.hash(crypto.decryptVerifier(session.verifierCiphertext(), session.id())));
        assertThat(session.clientChallenge()).isEqualTo(ZaloCrypto.hash(VERIFIER));
        assertThat(session.providerAppId()).isEqualTo(props.getAppId());
        assertThat(session.expiresAt()).isEqualTo(NOW.plusSeconds(300));
        assertThat(result.cookieName()).startsWith("__Host-sl_zalo_");
        assertThat(result.toString()).doesNotContain(result.cookieValue());
        verifyNoInteractions(provider, firebase);
    }

    @Test
    void authorizeRejectsUnknownOriginsMalformedChallengesAndRequestIdsBeforeStorage() {
        for (String origin : List.of("https://evil.example.test", ORIGIN + "/", "null")) {
            assertError(() -> service.authorize(ZaloPurpose.LOGIN, origin, "request-1234567890", ZaloCrypto.hash(VERIFIER)),
                    ErrorCode.INVALID_ZALO_REQUEST);
        }
        assertError(() -> service.authorize(ZaloPurpose.LOGIN, ORIGIN, "short", ZaloCrypto.hash(VERIFIER)), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.authorize(ZaloPurpose.LOGIN, ORIGIN, "request-1234567890", "invalid"), ErrorCode.INVALID_ZALO_REQUEST);
        verifyNoInteractions(repository, provider, firebase);
    }

    @Test
    void missingSchemaFailsClosedWithoutCallingProviderOrCreatingTables() {
        doThrow(new BadSqlGrammarException("redacted", "redacted", new java.sql.SQLException()))
                .when(repository).insert(any());
        assertError(this::authorize, ErrorCode.ZALO_UNAVAILABLE);
        verifyNoInteractions(provider, firebase);
    }

    @Test
    void transactionStartupFailureIsUnavailableWithoutLeakingInfrastructureDetails() {
        doThrow(new CannotCreateTransactionException("internal connection details"))
                .when(repository).insert(any());
        assertThatThrownBy(this::authorize).isInstanceOfSatisfying(BusinessException.class, failure -> {
            assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.ZALO_UNAVAILABLE);
            assertThat(failure).hasNoCause().hasMessageNotContaining("internal connection details");
        });
        verifyNoInteractions(provider, firebase);
    }

    @Test
    void callbackClaimsBeforeProviderAndReturnsOnlyOneTimeProof() {
        var pending = session(ZaloPurpose.LOGIN, ZaloStatus.PENDING, NOW.plusMinutes(5), props.getAppId());
        readyCallback(pending);
        when(provider.exchangeCode(eq("code"), anyString())).thenReturn(new ZaloProfile("external-subject", "Provider name"));
        when(repository.markVerified(any(), anyString(), anyString(), anyString(), any(), any())).thenReturn(true);
        var result = service.callback(STATE, "code", null, null, BINDING);
        assertThat(result.errorCode()).isNull();
        assertThat(result.proof()).matches("[A-Za-z0-9_-]{43}");
        assertThat(result.clientOrigin()).isEqualTo(ORIGIN);
        assertThat(result.toString()).doesNotContain(result.proof());
        var ordered = inOrder(repository, provider);
        ordered.verify(repository).findByStateHash(ZaloCrypto.hash(STATE));
        ordered.verify(repository).claimCallback(eq(ZaloCrypto.hash(STATE)), eq(ZaloCrypto.hash(BINDING)), eq(NOW));
        ordered.verify(provider).exchangeCode(eq("code"), anyString());
        ordered.verify(repository).markVerified(eq(pending.id()), eq("external-subject"), eq("Provider name"),
                eq(ZaloCrypto.hash(result.proof())), eq(NOW.plusSeconds(90)), eq(NOW));
        verifyNoInteractions(firebase);
    }

    @Test
    void callbackRejectsWrongCookieExpiryAndChangedApplicationBeforeProvider() {
        var pending = session(ZaloPurpose.LOGIN, ZaloStatus.PENDING, NOW.plusMinutes(5), props.getAppId());
        when(repository.findByStateHash(anyString())).thenReturn(Optional.of(pending));
        assertError(() -> service.callback(STATE, "code", null, null, "x".repeat(43)), ErrorCode.ZALO_SESSION_INVALID);
        when(repository.findByStateHash(anyString())).thenReturn(Optional.of(
                session(ZaloPurpose.LOGIN, ZaloStatus.PENDING, NOW, props.getAppId())));
        assertError(() -> service.callback(STATE, "code", null, null, BINDING), ErrorCode.ZALO_SESSION_EXPIRED);
        when(repository.findByStateHash(anyString())).thenReturn(Optional.of(
                session(ZaloPurpose.LOGIN, ZaloStatus.PENDING, NOW.plusMinutes(5), "different-app")));
        assertError(() -> service.callback(STATE, "code", null, null, BINDING), ErrorCode.ZALO_SESSION_INVALID);
        verify(repository, never()).claimCallback(anyString(), anyString(), any());
        verifyNoInteractions(provider, firebase);
    }

    @Test
    void callbackRaceLoserDoesNotCallProvider() {
        var pending = session(ZaloPurpose.LOGIN, ZaloStatus.PENDING, NOW.plusMinutes(5), props.getAppId());
        when(repository.findByStateHash(anyString())).thenReturn(Optional.of(pending));
        when(repository.claimCallback(anyString(), anyString(), any())).thenReturn(Optional.empty());
        assertError(() -> service.callback(STATE, "code", null, null, BINDING), ErrorCode.ZALO_SESSION_INVALID);
        verifyNoInteractions(provider, firebase);
    }

    @Test
    void rejectionAndProviderFailureConsumeCallbackWithoutLeakingProviderDescription() {
        var pending = session(ZaloPurpose.LOGIN, ZaloStatus.PENDING, NOW.plusMinutes(5), props.getAppId());
        readyCallback(pending);
        var cancelled = service.callback(STATE, null, "access_denied", null, BINDING);
        assertThat(cancelled.errorCode()).isEqualTo("zalo_consent_denied");
        verify(repository).fail(pending.id(), NOW);
        verifyNoInteractions(provider, firebase);
        when(provider.exchangeCode(eq("code"), anyString())).thenThrow(new BusinessException(ErrorCode.ZALO_PROVIDER_UNAVAILABLE));
        var failed = service.callback(STATE, "code", null, null, BINDING);
        assertThat(failed.errorCode()).isEqualTo("zalo_provider_unavailable");
        assertThat(failed.proof()).isNull();
        verify(repository, times(2)).fail(pending.id(), NOW);
    }

    @Test
    void exchangeConsumesPurposeOriginAndClientChallengeBeforeResolvingUidAndMinting() {
        var verified = session(ZaloPurpose.LOGIN, ZaloStatus.VERIFIED, NOW.plusMinutes(5), props.getAppId());
        when(repository.consumeProof(anyString(), any(), anyString(), anyString(), any())).thenReturn(Optional.of(verified));
        when(repository.resolveLoginUid(eq(props.getAppId()), eq("subject"), anyString(), eq(NOW))).thenReturn("canonical-uid");
        when(repository.checkAccount("canonical-uid", false)).thenReturn(false);
        when(firebase.mintCustomToken("canonical-uid", true)).thenReturn("sensitive-custom-token");
        var result = service.exchange(request(), ORIGIN);
        assertThat(result.firebaseCustomToken()).isEqualTo("sensitive-custom-token");
        assertThat(result.displayName()).isEqualTo("Name hint");
        assertThat(result.toString()).doesNotContain("sensitive-custom-token");
        var ordered = inOrder(repository, firebase);
        ordered.verify(repository).consumeProof(ZaloCrypto.hash(PROOF), ZaloPurpose.LOGIN, ORIGIN, ZaloCrypto.hash(VERIFIER), NOW);
        ordered.verify(repository).resolveLoginUid(eq(props.getAppId()), eq("subject"), anyString(), eq(NOW));
        ordered.verify(repository).checkAccount("canonical-uid", false);
        ordered.verify(firebase).mintCustomToken("canonical-uid", true);
        ordered.verify(repository).checkAccount("canonical-uid", false);
    }

    @Test
    void invalidOrReplayedProofNeverMintsToken() {
        when(repository.consumeProof(anyString(), any(), anyString(), anyString(), any())).thenReturn(Optional.empty());
        assertError(() -> service.exchange(request(), ORIGIN), ErrorCode.ZALO_SESSION_INVALID);
        verifyNoInteractions(firebase, provider);
        verify(repository, never()).resolveLoginUid(anyString(), anyString(), anyString(), any());
    }

    @Test
    void exchangeRejectsUnexpectedOriginMalformedProofAndForeignAppWithoutMinting() {
        assertError(() -> service.exchange(request(), "https://evil.example.test"), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.exchange(new ZaloProofRequest("short", VERIFIER), ORIGIN), ErrorCode.INVALID_ZALO_REQUEST);
        when(repository.consumeProof(anyString(), any(), anyString(), anyString(), any())).thenReturn(Optional.of(
                session(ZaloPurpose.LOGIN, ZaloStatus.VERIFIED, NOW.plusMinutes(5), "foreign-app")));
        assertError(() -> service.exchange(request(), ORIGIN), ErrorCode.ZALO_SESSION_INVALID);
        verifyNoInteractions(firebase, provider);
    }

    @Test
    void linkRequiresFreshVerifiedUidAndNeverMintsOrWritesFirebaseProfile() {
        when(firebase.verifyRecentUid("fresh-token")).thenReturn("existing-owner");
        when(repository.consumeProof(anyString(), any(), anyString(), anyString(), any())).thenReturn(Optional.of(
                session(ZaloPurpose.LINK, ZaloStatus.VERIFIED, NOW.plusMinutes(5), props.getAppId())));
        service.link(request(), ORIGIN, principal("existing-owner"), "fresh-token");
        var ordered = inOrder(firebase, repository);
        ordered.verify(firebase).verifyRecentUid("fresh-token");
        ordered.verify(repository).consumeProof(ZaloCrypto.hash(PROOF), ZaloPurpose.LINK, ORIGIN, ZaloCrypto.hash(VERIFIER), NOW);
        ordered.verify(repository).linkIdentity(props.getAppId(), "subject", "existing-owner", NOW);
        verify(firebase, never()).mintCustomToken(anyString(), anyBoolean());
        verifyNoInteractions(provider);
    }

    @Test
    void staleOrMismatchedFirebaseIdentityDoesNotConsumeProofOrLinkAccount() {
        when(firebase.verifyRecentUid("stale")).thenThrow(new BusinessException(ErrorCode.ZALO_REAUTHENTICATION_REQUIRED));
        assertError(() -> service.link(request(), ORIGIN, principal("owner"), "stale"), ErrorCode.ZALO_REAUTHENTICATION_REQUIRED);
        when(firebase.verifyRecentUid("other-token")).thenReturn("other-uid");
        assertError(() -> service.link(request(), ORIGIN, principal("owner"), "other-token"), ErrorCode.ZALO_REAUTHENTICATION_REQUIRED);
        verifyNoInteractions(repository, provider);
    }

    @Test
    void postMintStatusChangePreventsReturningTheToken() {
        when(repository.consumeProof(anyString(), any(), anyString(), anyString(), any())).thenReturn(Optional.of(
                session(ZaloPurpose.LOGIN, ZaloStatus.VERIFIED, NOW.plusMinutes(5), props.getAppId())));
        when(repository.resolveLoginUid(anyString(), anyString(), anyString(), any())).thenReturn("uid");
        when(repository.checkAccount("uid", false)).thenReturn(true).thenThrow(new BusinessException(ErrorCode.ACCOUNT_DISABLED));
        when(firebase.mintCustomToken("uid", false)).thenReturn("must-not-return");
        assertError(() -> service.exchange(request(), ORIGIN), ErrorCode.ACCOUNT_DISABLED);
    }

    private ZaloAuthorizationResult authorize() {
        return service.authorize(ZaloPurpose.LOGIN, ORIGIN, "request-1234567890", ZaloCrypto.hash(VERIFIER));
    }

    private void readyCallback(ZaloOAuthSession session) {
        when(repository.findByStateHash(ZaloCrypto.hash(STATE))).thenReturn(Optional.of(session));
        when(repository.claimCallback(ZaloCrypto.hash(STATE), ZaloCrypto.hash(BINDING), NOW)).thenReturn(Optional.of(session));
    }

    private ZaloOAuthSession session(ZaloPurpose purpose, ZaloStatus status, OffsetDateTime expiry, String appId) {
        UUID id = UUID.randomUUID();
        return new ZaloOAuthSession(id, ZaloCrypto.hash(STATE), ZaloCrypto.hash(BINDING), purpose, ORIGIN,
                "request-1234567890", ZaloCrypto.hash(VERIFIER), crypto.encryptVerifier(VERIFIER, id), status,
                "subject", "Name hint", ZaloCrypto.hash(PROOF), NOW, expiry, NOW.plusSeconds(90), null, appId);
    }

    private static ZaloProofRequest request() { return new ZaloProofRequest(PROOF, VERIFIER); }
    private static VerifiedFirebaseToken principal(String uid) { return new VerifiedFirebaseToken(uid, null, false, null, null, null); }
    private static void assertError(Runnable action, ErrorCode code) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.getErrorCode()).isEqualTo(code));
    }
    private static ZaloProperties properties() {
        var props = new ZaloProperties();
        props.setEnabled(true);
        props.setAppId("3632655625730637557");
        props.setAppSecret("synthetic-test-secret");
        props.setCallbackUrl("https://core.example.test/api/v1/auth/zalo/callback");
        props.setClientOrigins(List.of(ORIGIN));
        props.setSessionEncryptionKey(Base64.getEncoder().encodeToString(new byte[32]));
        return props;
    }
}
