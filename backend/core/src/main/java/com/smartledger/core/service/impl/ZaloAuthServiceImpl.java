package com.smartledger.core.service.impl;

import com.smartledger.core.config.ZaloProperties;
import com.smartledger.core.dto.request.ZaloProofRequest;
import com.smartledger.core.dto.response.ZaloExchangeResponse;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.ZaloOAuthRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ZaloAuthService;
import com.smartledger.core.zalo.FirebaseZaloGateway;
import com.smartledger.core.zalo.ZaloAuthorizationResult;
import com.smartledger.core.zalo.ZaloCallbackResult;
import com.smartledger.core.zalo.ZaloCrypto;
import com.smartledger.core.zalo.ZaloOAuthSession;
import com.smartledger.core.zalo.ZaloProfile;
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

/** Provider I/O stays outside the repository's short committed transactions. */
@Service
public class ZaloAuthServiceImpl implements ZaloAuthService {
    private final ZaloProperties properties;
    private final ZaloCrypto crypto;
    private final ZaloOAuthRepository repository;
    private final ZaloProviderGateway provider;
    private final FirebaseZaloGateway firebase;
    private final Clock clock;

    @Autowired
    public ZaloAuthServiceImpl(ZaloProperties properties, ZaloCrypto crypto, ZaloOAuthRepository repository,
            ZaloProviderGateway provider, FirebaseZaloGateway firebase) {
        this(properties, crypto, repository, provider, firebase, Clock.systemUTC());
    }

    public ZaloAuthServiceImpl(ZaloProperties properties, ZaloCrypto crypto, ZaloOAuthRepository repository,
            ZaloProviderGateway provider, FirebaseZaloGateway firebase, Clock clock) {
        this.properties = properties;
        this.crypto = crypto;
        this.repository = repository;
        this.provider = provider;
        this.firebase = firebase;
        this.clock = clock;
    }

    @Override
    public ZaloAuthorizationResult authorize(ZaloPurpose purpose, String origin, String requestId, String clientChallenge) {
        properties.requireEnabled();
        requireOrigin(origin);
        if (purpose == null || requestId == null || !requestId.matches("[A-Za-z0-9_-]{16,100}") || !token(clientChallenge)) {
            throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
        }
        String state = ZaloCrypto.randomToken();
        String binding = ZaloCrypto.randomToken();
        String verifier = ZaloCrypto.randomToken();
        UUID id = UUID.randomUUID();
        OffsetDateTime now = now();
        var session = new ZaloOAuthSession(id, ZaloCrypto.hash(state), ZaloCrypto.hash(binding), purpose, origin,
                requestId, clientChallenge, crypto.encryptVerifier(verifier, id), ZaloStatus.PENDING, null, null,
                null, now, now.plusSeconds(properties.getSessionTtlSeconds()), null, null, properties.getAppId());
        database(() -> { repository.insert(session); return null; });
        String url = UriComponentsBuilder.fromUriString("https://oauth.zaloapp.com/v4/permission")
                .queryParam("app_id", properties.getAppId()).queryParam("redirect_uri", properties.getCallbackUrl())
                .queryParam("code_challenge", ZaloCrypto.hash(verifier)).queryParam("state", state)
                .build().encode().toUriString();
        return new ZaloAuthorizationResult(url, cookieName(state), binding, properties.getSessionTtlSeconds());
    }

    @Override
    public ZaloCallbackResult callback(String state, String code, String error, String codeChallenge, String browserBinding) {
        properties.requireEnabled();
        if (!token(state) || !token(browserBinding) || (code == null) == (error == null)
                || (code != null && (!code.matches("[A-Za-z0-9._~-]{1,4096}")))
                || (error != null && (error.isBlank() || error.length() > 128))
                || (codeChallenge != null && !token(codeChallenge))) {
            throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
        }
        OffsetDateTime now = now();
        String stateHash = ZaloCrypto.hash(state);
        var session = database(() -> repository.findByStateHash(stateHash))
                .orElseThrow(() -> new BusinessException(ErrorCode.ZALO_SESSION_INVALID));
        if (session.clientOrigin() == null || !properties.getClientOrigins().contains(session.clientOrigin())
                || !session.providerAppId().equals(properties.getAppId())
                || !session.browserBindingHash().equals(ZaloCrypto.hash(browserBinding))
                || session.status() != ZaloStatus.PENDING) {
            throw new BusinessException(ErrorCode.ZALO_SESSION_INVALID);
        }
        if (!session.expiresAt().isAfter(now)) throw new BusinessException(ErrorCode.ZALO_SESSION_EXPIRED);
        // The committed claim prevents duplicate provider calls even after an HTTP retry.
        var claimed = database(() -> repository.claimCallback(stateHash, ZaloCrypto.hash(browserBinding), now))
                .orElseThrow(() -> new BusinessException(ErrorCode.ZALO_SESSION_INVALID));
        try {
            if (error != null) throw new BusinessException(ErrorCode.ZALO_CONSENT_DENIED);
            String verifier = crypto.decryptVerifier(claimed.verifierCiphertext(), claimed.id());
            if (codeChallenge != null && !ZaloCrypto.hash(verifier).equals(codeChallenge)) {
                throw new BusinessException(ErrorCode.ZALO_SESSION_INVALID);
            }
            ZaloProfile profile = provider.exchangeCode(code, verifier);
            String proof = ZaloCrypto.randomToken();
            OffsetDateTime completed = now();
            OffsetDateTime proofExpires = completed.plusSeconds(properties.getProofTtlSeconds());
            if (proofExpires.isAfter(claimed.expiresAt())) proofExpires = claimed.expiresAt();
            OffsetDateTime finalExpiry = proofExpires;
            boolean ready = database(() -> repository.markVerified(claimed.id(), profile.subject(), profile.displayName(),
                    ZaloCrypto.hash(proof), finalExpiry, completed));
            if (!ready) throw new BusinessException(ErrorCode.ZALO_SESSION_EXPIRED);
            return callbackResult(claimed, state, proof, null);
        } catch (BusinessException failure) {
            database(() -> { repository.fail(claimed.id(), now()); return null; });
            return callbackResult(claimed, state, null, failure.getErrorCode().getCode());
        }
    }

    @Override
    public ZaloExchangeResponse exchange(ZaloProofRequest request, String origin) {
        properties.requireEnabled();
        var session = consume(request, origin, ZaloPurpose.LOGIN);
        OffsetDateTime now = now();
        String uid = database(() -> repository.resolveLoginUid(session.providerAppId(), session.providerSubject(),
                "zalo_" + UUID.randomUUID(), now));
        boolean exists = database(() -> repository.checkAccount(uid, false));
        String customToken = firebase.mintCustomToken(uid, !exists);
        // Never return a minted token if a concurrent suspension committed during provider I/O.
        database(() -> repository.checkAccount(uid, false));
        return new ZaloExchangeResponse(customToken, session.displayName());
    }

    @Override
    public void link(ZaloProofRequest request, String origin, VerifiedFirebaseToken principal, String rawIdToken) {
        properties.requireEnabled();
        requireProof(request, origin);
        if (principal == null) throw new BusinessException(ErrorCode.ZALO_REAUTHENTICATION_REQUIRED);
        String targetUid = firebase.verifyRecentUid(rawIdToken);
        if (!targetUid.equals(principal.uid())) throw new BusinessException(ErrorCode.ZALO_REAUTHENTICATION_REQUIRED);
        var session = consume(request, origin, ZaloPurpose.LINK);
        database(() -> {
            repository.linkIdentity(session.providerAppId(), session.providerSubject(), targetUid, now());
            return null;
        });
    }

    @Override
    public void cleanupExpiredSessions() {
        if (!properties.isEnabled()) return;
        properties.requireEnabled();
        database(() -> repository.cleanup(now()));
    }

    public static String cookieName(String state) { return "__Host-sl_zalo_" + ZaloCrypto.hash(state).substring(0, 16); }

    private ZaloOAuthSession consume(ZaloProofRequest request, String origin, ZaloPurpose purpose) {
        requireProof(request, origin);
        var session = database(() -> repository.consumeProof(ZaloCrypto.hash(request.proof()), purpose, origin,
                ZaloCrypto.hash(request.clientVerifier()), now()))
                .orElseThrow(() -> new BusinessException(ErrorCode.ZALO_SESSION_INVALID));
        if (!properties.getAppId().equals(session.providerAppId())) throw new BusinessException(ErrorCode.ZALO_SESSION_INVALID);
        return session;
    }

    private void requireProof(ZaloProofRequest request, String origin) {
        requireOrigin(origin);
        if (request == null || !token(request.proof()) || !token(request.clientVerifier())) {
            throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
        }
    }

    private void requireOrigin(String origin) {
        if (origin == null || !properties.getClientOrigins().contains(origin)) throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
    }

    private static boolean token(String value) { return value != null && value.matches("[A-Za-z0-9_-]{43}"); }
    private OffsetDateTime now() { return OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC); }

    private static ZaloCallbackResult callbackResult(ZaloOAuthSession session, String state, String proof, String error) {
        return new ZaloCallbackResult(session.clientOrigin(), session.clientRequestId(), session.purpose(), proof, error, cookieName(state));
    }

    private static <T> T database(Supplier<T> action) {
        try { return action.get(); }
        catch (DataAccessException | TransactionException failure) { throw new BusinessException(ErrorCode.ZALO_UNAVAILABLE); }
    }
}
