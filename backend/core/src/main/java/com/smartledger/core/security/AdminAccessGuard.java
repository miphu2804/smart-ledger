package com.smartledger.core.security;

import com.smartledger.core.entity.AuthIdentity;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.SystemRole;
import com.smartledger.core.enums.UserStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.AuthIdentityRepository;
import org.springframework.stereotype.Component;

/** Firebase proves identity; only the current database profile grants ADMIN access. */
@Component
public class AdminAccessGuard {
    private final AuthIdentityRepository identities;

    public AdminAccessGuard(AuthIdentityRepository identities) { this.identities = identities; }

    public UserAccount requireAdmin(VerifiedFirebaseToken token) {
        if (token == null) { throw new BusinessException(ErrorCode.ADMIN_ACCESS_REQUIRED); }
        UserAccount user = identities.findWithUserByProviderSubject(token.uid()).map(AuthIdentity::getUser)
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_PROFILE_NOT_FOUND));
        if (user.getStatus() != UserStatus.ACTIVE) { throw new BusinessException(ErrorCode.ACCOUNT_DISABLED); }
        if (user.getSystemRole() != SystemRole.ADMIN) { throw new BusinessException(ErrorCode.ADMIN_ACCESS_REQUIRED); }
        return user;
    }
}
