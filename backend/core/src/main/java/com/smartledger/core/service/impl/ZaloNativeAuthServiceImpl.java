package com.smartledger.core.service.impl;

import com.smartledger.core.config.ZaloNativeProperties;
import com.smartledger.core.config.ZaloProperties;
import com.smartledger.core.dto.request.ZaloNativeHandoffRequest;
import com.smartledger.core.dto.response.ZaloExchangeResponse;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.ZaloNativeOAuthRepository;
import com.smartledger.core.repository.ZaloOAuthRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ZaloNativeAuthService;
import com.smartledger.core.zalo.FirebaseZaloGateway;
import com.smartledger.core.zalo.ZaloAuthorizationResult;
import com.smartledger.core.zalo.ZaloCrypto;
import com.smartledger.core.zalo.ZaloNativeCallbackResult;
import com.smartledger.core.zalo.ZaloNativeSession;
import com.smartledger.core.zalo.ZaloProviderGateway;
import com.smartledger.core.zalo.ZaloPurpose;
import com.smartledger.core.zalo.ZaloStatus;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;
import org.springframework.web.util.UriComponentsBuilder;

/** Independent Android handoff; identity mapping/account guards remain shared with WEB. */
@Service
public class ZaloNativeAuthServiceImpl implements ZaloNativeAuthService {
    private final ZaloProperties properties;
    private final ZaloNativeProperties nativeProperties;
    private final ZaloCrypto crypto;
    private final ZaloNativeOAuthRepository repository;
    private final ZaloOAuthRepository identities;
    private final ZaloProviderGateway provider;
    private final FirebaseZaloGateway firebase;
    private final Clock clock;

    @Autowired
    public ZaloNativeAuthServiceImpl(ZaloProperties properties, ZaloNativeProperties nativeProperties, ZaloCrypto crypto,
            ZaloNativeOAuthRepository repository, ZaloOAuthRepository identities, ZaloProviderGateway provider, FirebaseZaloGateway firebase) {
        this(properties, nativeProperties, crypto, repository, identities, provider, firebase, Clock.systemUTC());
    }

    public ZaloNativeAuthServiceImpl(ZaloProperties properties, ZaloNativeProperties nativeProperties, ZaloCrypto crypto,
            ZaloNativeOAuthRepository repository, ZaloOAuthRepository identities, ZaloProviderGateway provider,
            FirebaseZaloGateway firebase, Clock clock) {
        this.properties = properties;
        this.nativeProperties = nativeProperties;
        this.crypto = crypto;
        this.repository = repository;
        this.identities = identities;
        this.provider = provider;
        this.firebase = firebase;
        this.clock = clock;
    }

    @Override
    public boolean isNativeCallback(String state) {
        if (!properties.isEnabled()) return false;
        properties.requireEnabled();
        if (!token(state)) throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
        // Check persisted channel even when native is disabled: never fall back to a WEB proof.
        return database(() -> repository.isAndroid(ZaloCrypto.hash(state)));
    }

    @Override
    public ZaloAuthorizationResult authorize(String clientId, ZaloPurpose purpose, String requestId, String challenge) {
        requireEnabled(clientId);
        if (purpose == null || !requestId(requestId) || !token(challenge)) throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
        String state = ZaloCrypto.randomToken();
        String binding = ZaloCrypto.randomToken();
        String verifier = ZaloCrypto.randomToken();
        UUID id = UUID.randomUUID();
        OffsetDateTime now = now();
        var session = new ZaloNativeSession(id, ZaloCrypto.hash(state), ZaloCrypto.hash(binding), purpose, requestId, challenge,
                crypto.encryptVerifier(verifier, id), ZaloStatus.PENDING, null, null, now,
                now.plusSeconds(properties.getSessionTtlSeconds()), properties.getAppId(), clientId, nativeProperties.getReturnTargetId());
        database(() -> { repository.insert(session); return null; });
        String url = UriComponentsBuilder.fromUriString("https://oauth.zaloapp.com/v4/permission")
                .queryParam("app_id", properties.getAppId()).queryParam("redirect_uri", properties.getCallbackUrl())
                .queryParam("code_challenge", ZaloCrypto.hash(verifier)).queryParam("state", state).build().encode().toUriString();
        return new ZaloAuthorizationResult(url, ZaloAuthServiceImpl.cookieName(state), binding, properties.getSessionTtlSeconds());
    }

    @Override
    public ZaloNativeCallbackResult callback(String state, String code, String error, String codeChallenge, String binding) {
        requireEnabled(nativeProperties.getClientId());
        if (!token(state) || !token(binding) || (code == null) == (error == null)
                || (code != null && !code.matches("[A-Za-z0-9._~-]{1,4096}"))
                || (error != null && (error.isBlank() || error.length() > 128))
                || (codeChallenge != null && !token(codeChallenge))) throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
        var session = database(() -> repository.claimCallback(ZaloCrypto.hash(state), ZaloCrypto.hash(binding), properties.getAppId(),
                nativeProperties.getClientId(), nativeProperties.getReturnTargetId(), now()))
                .orElseThrow(() -> new BusinessException(ErrorCode.ZALO_SESSION_INVALID));
        try {
            if (error != null) throw new BusinessException(ErrorCode.ZALO_CONSENT_DENIED);
            String verifier = crypto.decryptVerifier(session.verifierCiphertext(), session.id());
            if (codeChallenge != null && !ZaloCrypto.hash(verifier).equals(codeChallenge)) throw new BusinessException(ErrorCode.ZALO_SESSION_INVALID);
            var profile = provider.exchangeCode(code, verifier);
            String reference = ZaloCrypto.randomToken();
            OffsetDateTime now = now();
            OffsetDateTime expiry = now.plusSeconds(nativeProperties.getHandoffTtlSeconds());
            if (expiry.isAfter(session.expiresAt())) expiry = session.expiresAt();
            OffsetDateTime finalExpiry = expiry;
            if (!database(() -> repository.markVerified(session.id(), profile.subject(), profile.displayName(),
                    ZaloCrypto.hash(reference), finalExpiry, now))) throw new BusinessException(ErrorCode.ZALO_SESSION_EXPIRED);
            return result(session, reference, null);
        } catch (BusinessException failure) {
            database(() -> { identities.fail(session.id(), now()); return null; });
            return result(session, null, failure.getErrorCode().getCode());
        }
    }

    @Override
    public ZaloExchangeResponse exchange(ZaloNativeHandoffRequest request) {
        var session = consume(request, ZaloPurpose.LOGIN);
        String uid = database(() -> identities.resolveLoginUid(session.providerAppId(), session.providerSubject(), "zalo_" + UUID.randomUUID(), now()));
        boolean exists = database(() -> identities.checkAccount(uid, false));
        String customToken = firebase.mintCustomToken(uid, !exists);
        database(() -> identities.checkAccount(uid, false));
        return new ZaloExchangeResponse(customToken, session.displayName());
    }

    @Override
    public void link(ZaloNativeHandoffRequest request, VerifiedFirebaseToken principal, String rawIdToken) {
        requireRequest(request);
        if (principal == null) throw new BusinessException(ErrorCode.ZALO_REAUTHENTICATION_REQUIRED);
        String uid = firebase.verifyRecentUid(rawIdToken);
        if (!principal.uid().equals(uid)) throw new BusinessException(ErrorCode.ZALO_REAUTHENTICATION_REQUIRED);
        var session = consume(request, ZaloPurpose.LINK);
        database(() -> { identities.linkIdentity(session.providerAppId(), session.providerSubject(), uid, now()); return null; });
    }

    private ZaloNativeSession consume(ZaloNativeHandoffRequest request, ZaloPurpose purpose) {
        requireRequest(request);
        return database(() -> repository.consume(ZaloCrypto.hash(request.handoffReference()), purpose, request.nativeClientId(),
                request.requestId(), ZaloCrypto.hash(request.clientVerifier()), properties.getAppId(), nativeProperties.getReturnTargetId(), now()))
                .orElseThrow(() -> new BusinessException(ErrorCode.ZALO_SESSION_INVALID));
    }

    private void requireRequest(ZaloNativeHandoffRequest request) {
        if (request == null) throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
        requireEnabled(request.nativeClientId());
        if (!requestId(request.requestId()) || !token(request.clientVerifier()) || !token(request.handoffReference())) {
            throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
        }
    }

    private void requireEnabled(String clientId) {
        properties.requireEnabled();
        nativeProperties.requireClient(clientId, properties.getCallbackUrl());
        database(() -> { repository.requireSchema(); return null; });
    }

    private ZaloNativeCallbackResult result(ZaloNativeSession session, String reference, String error) {
        return new ZaloNativeCallbackResult(nativeProperties.getReturnUrl(), session.nativeClientId(), session.requestId(), session.purpose(), reference, error);
    }
    private static boolean requestId(String value) { return value != null && value.matches("[A-Za-z0-9_-]{16,100}"); }
    private static boolean token(String value) { return value != null && value.matches("[A-Za-z0-9_-]{43}"); }
    private OffsetDateTime now() { return OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC); }
    private static <T> T database(Supplier<T> action) {
        try { return action.get(); }
        catch (DataAccessException | TransactionException failure) { throw new BusinessException(ErrorCode.ZALO_UNAVAILABLE); }
    }
}
