package com.smartledger.core.zalo;

import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** Uses existing Firebase credentials; never writes profile fields, roles or custom claims. */
@Component
public class FirebaseZaloGateway {
    private final FirebaseAuth auth;
    private final Clock clock;

    @Autowired
    public FirebaseZaloGateway(FirebaseAuth auth) { this(auth, Clock.systemUTC()); }

    FirebaseZaloGateway(FirebaseAuth auth, Clock clock) {
        this.auth = auth;
        this.clock = clock;
    }

    public String mintCustomToken(String uid, boolean allowMissingUser) {
        try {
            try {
                if (auth.getUser(uid).isDisabled()) {
                    throw new BusinessException(ErrorCode.ACCOUNT_DISABLED);
                }
            } catch (FirebaseAuthException exception) {
                if (exception.getAuthErrorCode() != AuthErrorCode.USER_NOT_FOUND) {
                    throw new BusinessException(ErrorCode.ZALO_PROVIDER_UNAVAILABLE);
                }
                if (!allowMissingUser) {
                    throw new BusinessException(ErrorCode.ZALO_ACCOUNT_NOT_ALLOWED);
                }
            }
            return auth.createCustomToken(uid);
        } catch (FirebaseAuthException | IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.ZALO_PROVIDER_UNAVAILABLE);
        }
    }

    public String verifyRecentUid(String rawIdToken) {
        if (rawIdToken == null || rawIdToken.isBlank() || rawIdToken.length() > 16000) {
            throw new BusinessException(ErrorCode.ZALO_REAUTHENTICATION_REQUIRED);
        }
        try {
            FirebaseToken token = auth.verifyIdToken(rawIdToken, true);
            Object time = token.getClaims().get("auth_time");
            long now = clock.instant().getEpochSecond();
            if (!(time instanceof Number number) || number.doubleValue() != number.longValue()
                    || number.longValue() < now - 300 || number.longValue() > now
                    || token.getUid() == null || token.getUid().isBlank()) {
                throw new BusinessException(ErrorCode.ZALO_REAUTHENTICATION_REQUIRED);
            }
            return token.getUid();
        } catch (FirebaseAuthException | IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.ZALO_REAUTHENTICATION_REQUIRED);
        }
    }
}
