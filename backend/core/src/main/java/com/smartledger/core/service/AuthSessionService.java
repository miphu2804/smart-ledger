package com.smartledger.core.service;

import com.smartledger.core.dto.response.AuthSessionResponse;
import com.smartledger.core.dto.response.ShopResponse;
import com.smartledger.core.dto.response.UserResponse;
import com.smartledger.core.entity.AuthIdentity;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.entity.ShopStatus;
import com.smartledger.core.entity.SystemRole;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.entity.UserStatus;
import com.smartledger.core.exception.AccountDisabledException;
import com.smartledger.core.exception.AuthProfileNotFoundException;
import com.smartledger.core.exception.DisplayNameRequiredException;
import com.smartledger.core.repository.AuthIdentityRepository;
import com.smartledger.core.repository.ShopRepository;
import com.smartledger.core.repository.UserAccountRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class AuthSessionService {

    private final AuthIdentityRepository authIdentityRepository;
    private final UserAccountRepository userAccountRepository;
    private final ShopRepository shopRepository;

    public AuthSessionService(
            AuthIdentityRepository authIdentityRepository,
            UserAccountRepository userAccountRepository,
            ShopRepository shopRepository) {
        this.authIdentityRepository = authIdentityRepository;
        this.userAccountRepository = userAccountRepository;
        this.shopRepository = shopRepository;
    }

    @Transactional
    public AuthSessionResponse openSession(VerifiedFirebaseToken firebaseToken, String requestedDisplayName) {
        UserAccount user = authIdentityRepository.findWithUserByProviderSubject(firebaseToken.uid())
                .map(AuthIdentity::getUser)
                .orElseGet(() -> createUser(firebaseToken, requestedDisplayName));

        ensureActive(user);
        user.syncFirebaseProfile(firebaseToken);
        return toSessionResponse(user);
    }

    @Transactional(readOnly = true)
    public AuthSessionResponse getCurrentSession(VerifiedFirebaseToken firebaseToken) {
        UserAccount user = authIdentityRepository.findWithUserByProviderSubject(firebaseToken.uid())
                .map(AuthIdentity::getUser)
                .orElseThrow(AuthProfileNotFoundException::new);

        ensureActive(user);
        return toSessionResponse(user);
    }

    private UserAccount createUser(VerifiedFirebaseToken firebaseToken, String requestedDisplayName) {
        String displayName = normalizeDisplayName(requestedDisplayName);
        if (!StringUtils.hasText(displayName)) {
            throw new DisplayNameRequiredException();
        }

        UserAccount user = userAccountRepository.save(UserAccount.createOwner(displayName, firebaseToken));
        authIdentityRepository.save(AuthIdentity.forFirebase(user, firebaseToken.uid()));
        return user;
    }

    private AuthSessionResponse toSessionResponse(UserAccount user) {
        List<ShopResponse> shops = user.getSystemRole() == SystemRole.ADMIN
                ? List.of()
                : shopRepository.findAllByOwnerIdAndStatusOrderByIdAsc(user.getId(), ShopStatus.ACTIVE)
                        .stream()
                        .map(this::toShopResponse)
                        .toList();
        boolean needsOnboarding = user.getSystemRole() == SystemRole.OWNER && shops.isEmpty();
        return new AuthSessionResponse(
                new UserResponse(
                        user.getId(),
                        user.getDisplayName(),
                        user.getEmail(),
                        user.getPhone(),
                        user.getAvatarUrl()),
                user.getSystemRole(),
                shops,
                needsOnboarding);
    }

    private void ensureActive(UserAccount user) {
        if (user.getStatus() == UserStatus.DISABLED) {
            throw new AccountDisabledException();
        }
    }

    private String normalizeDisplayName(String displayName) {
        return StringUtils.hasText(displayName) ? displayName.trim() : null;
    }

    private ShopResponse toShopResponse(Shop shop) {
        return new ShopResponse(
                shop.getId(),
                shop.getName(),
                shop.getIndustry(),
                shop.getPhone(),
                shop.getAddress(),
                shop.getStatus());
    }
}
