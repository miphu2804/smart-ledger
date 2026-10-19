package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.smartledger.core.config.ZaloNativeProperties;
import com.smartledger.core.config.ZaloProperties;
import com.smartledger.core.dto.request.ZaloNativeHandoffRequest;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.ZaloNativeOAuthRepository;
import com.smartledger.core.repository.ZaloOAuthRepository;
import com.smartledger.core.service.impl.ZaloNativeAuthServiceImpl;
import com.smartledger.core.zalo.*;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import org.mockito.ArgumentCaptor;
import org.springframework.web.util.UriComponentsBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataAccessResourceFailureException;

class ZaloNativeAuthServiceTest {
    private static final String TOKEN = "v".repeat(43), REQUEST = "request-1234567890";
    private final ZaloNativeOAuthRepository repository = mock(ZaloNativeOAuthRepository.class);
    private final ZaloOAuthRepository identities = mock(ZaloOAuthRepository.class);
    private final ZaloProviderGateway provider = mock(ZaloProviderGateway.class);
    private final FirebaseZaloGateway firebase = mock(FirebaseZaloGateway.class);
    private ZaloProperties properties;
    private ZaloNativeProperties nativeProperties;
    private ZaloNativeAuthService service;

    @BeforeEach
    void configure() {
        properties = new ZaloProperties(); properties.setEnabled(true); properties.setAppId("123"); properties.setAppSecret("synthetic-secret");
        properties.setCallbackUrl("https://core.example.test/api/v1/auth/zalo/callback"); properties.setClientOrigins(List.of("https://owner.example.test"));
        properties.setSessionEncryptionKey(Base64.getEncoder().encodeToString(new byte[32]));
        nativeProperties = new ZaloNativeProperties(); nativeProperties.setEnabled(true); nativeProperties.setClientId("android-staging");
        nativeProperties.setReturnTargetId("core-staging"); nativeProperties.setReturnUrl("https://core.example.test/mobile/auth/zalo/complete");
        nativeProperties.setCertificateSha256(List.of("FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C"));
        service = new ZaloNativeAuthServiceImpl(properties, nativeProperties, new ZaloCrypto(properties), repository, identities, provider, firebase);
    }

    @Test
    void offDoesNotTouchNativeSchemaOrProviderAndGlobalOffDoesNotDispatch() {
        nativeProperties.setEnabled(false);
        assertError(() -> service.authorize("android-staging", ZaloPurpose.LOGIN, REQUEST, TOKEN), ErrorCode.ZALO_UNAVAILABLE);
        assertError(() -> service.exchange(body(TOKEN, TOKEN, REQUEST)), ErrorCode.ZALO_UNAVAILABLE);
        assertError(() -> service.link(body(TOKEN, TOKEN, REQUEST), null, null), ErrorCode.ZALO_UNAVAILABLE);
        properties.setEnabled(false);
        assertThat(service.isNativeCallback(TOKEN)).isFalse();
        verifyNoInteractions(repository, identities, provider, firebase);
    }

    @Test
    void schemaAndChannelLookupFailuresHaveFixedUnavailableErrorWithoutPrivateSql() {
        doThrow(new DataAccessResourceFailureException("private-schema-detail")).when(repository).requireSchema();
        assertError(() -> service.authorize("android-staging", ZaloPurpose.LOGIN, REQUEST, TOKEN), ErrorCode.ZALO_UNAVAILABLE);
        when(repository.isAndroid(anyString())).thenThrow(new DataAccessResourceFailureException("private-schema-detail"));
        assertError(() -> service.isNativeCallback(TOKEN), ErrorCode.ZALO_UNAVAILABLE);
        verifyNoInteractions(identities, provider, firebase);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"short", "v v", "../bad"})
    void invalidTokenFormatsCannotReachProviderOrConsumption(String value) {
        assertError(() -> service.authorize("android-staging", ZaloPurpose.LOGIN, REQUEST, value), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.exchange(body(value, TOKEN, REQUEST)), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.exchange(body(TOKEN, value, REQUEST)), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.callback(value, "code", null, null, TOKEN), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.callback(TOKEN, "code", null, null, value), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.isNativeCallback(value), ErrorCode.INVALID_ZALO_REQUEST);
        verify(repository, never()).consume(anyString(), any(), anyString(), anyString(), anyString(), anyString(), anyString(), any());
        verifyNoInteractions(identities, provider, firebase);
    }

    @Test
    void unknownClientAndMissingPurposeOrRequestCannotCreateSession() {
        assertError(() -> service.authorize("foreign", ZaloPurpose.LOGIN, REQUEST, TOKEN), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.authorize("android-staging", null, REQUEST, TOKEN), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.authorize("android-staging", ZaloPurpose.LOGIN, null, TOKEN), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.authorize("android-staging", ZaloPurpose.LOGIN, "short", TOKEN), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.exchange(null), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.exchange(body(TOKEN, TOKEN, "short")), ErrorCode.INVALID_ZALO_REQUEST);
        verify(repository, never()).insert(any()); verifyNoInteractions(identities, provider, firebase);
    }

    @Test
    void malformedCallbackCannotClaimSessionOrReflectRawError() {
        assertError(() -> service.callback(TOKEN, null, null, null, TOKEN), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.callback(TOKEN, "code", "error", null, TOKEN), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.callback(TOKEN, "<script>", null, null, TOKEN), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.callback(TOKEN, null, " ", null, TOKEN), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.callback(TOKEN, null, "e".repeat(129), null, TOKEN), ErrorCode.INVALID_ZALO_REQUEST);
        assertError(() -> service.callback(TOKEN, "code", null, "bad", TOKEN), ErrorCode.INVALID_ZALO_REQUEST);
        verify(repository, never()).claimCallback(anyString(), anyString(), anyString(), anyString(), anyString(), any());
        verifyNoInteractions(identities, provider, firebase);
    }

    @Test
    void nonexistentCallbackAndReferenceCannotReachProviderOrFirebase() {
        when(repository.claimCallback(anyString(), anyString(), anyString(), anyString(), anyString(), any())).thenReturn(Optional.empty());
        when(repository.consume(anyString(), any(), anyString(), anyString(), anyString(), anyString(), anyString(), any())).thenReturn(Optional.empty());
        assertError(() -> service.callback(TOKEN, "code", null, null, TOKEN), ErrorCode.ZALO_SESSION_INVALID);
        assertError(() -> service.exchange(body(TOKEN, TOKEN, REQUEST)), ErrorCode.ZALO_SESSION_INVALID);
        verifyNoInteractions(identities, provider, firebase);
    }

    @Test
    void authorizeKeepsClientAndProviderPkceSeparateAndSessionStringRedacted() {
        var result = service.authorize("android-staging", ZaloPurpose.LOGIN, REQUEST, ZaloCrypto.hash(TOKEN));
        var captured = ArgumentCaptor.forClass(ZaloNativeSession.class);
        verify(repository).insert(captured.capture());
        var session = captured.getValue();
        var params = UriComponentsBuilder.fromUriString(result.authorizationUrl()).build().getQueryParams();
        assertThat(session.stateHash()).isEqualTo(ZaloCrypto.hash(params.getFirst("state")));
        assertThat(session.browserBindingHash()).isEqualTo(ZaloCrypto.hash(result.cookieValue()));
        assertThat(session.clientChallenge()).isEqualTo(ZaloCrypto.hash(TOKEN));
        String providerVerifier = new ZaloCrypto(properties).decryptVerifier(session.verifierCiphertext(), session.id());
        assertThat(params.getFirst("code_challenge")).isEqualTo(ZaloCrypto.hash(providerVerifier)).isNotEqualTo(session.clientChallenge());
        assertThat(session.toString()).isEqualTo("ZaloNativeSession[redacted]");
        assertThat(result.toString()).doesNotContain(providerVerifier, TOKEN, result.cookieValue());
        verifyNoInteractions(identities, provider, firebase);
    }

    private static ZaloNativeHandoffRequest body(String reference, String verifier, String request) { return new ZaloNativeHandoffRequest("android-staging", request, reference, verifier); }
    private static void assertError(Runnable action, ErrorCode code) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class, error -> {
            assertThat(error.getErrorCode()).isEqualTo(code); assertThat(error.getMessage()).doesNotContain("private-schema-detail");
        });
    }
}
