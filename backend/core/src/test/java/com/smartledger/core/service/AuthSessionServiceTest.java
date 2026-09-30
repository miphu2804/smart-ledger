package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smartledger.core.dto.response.AuthSessionResponse;
import com.smartledger.core.entity.AuthIdentity;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.AuthIdentityRepository;
import com.smartledger.core.repository.ShopRepository;
import com.smartledger.core.repository.UserAccountRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.AuthSessionServiceImpl;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

class AuthSessionServiceTest {

    private final AuthIdentityRepository authIdentityRepository = Mockito.mock(AuthIdentityRepository.class);
    private final UserAccountRepository userAccountRepository = Mockito.mock(UserAccountRepository.class);
    private final ShopRepository shopRepository = Mockito.mock(ShopRepository.class);
    private final AuthSessionService service = new AuthSessionServiceImpl(
            authIdentityRepository,
            userAccountRepository,
            shopRepository);

    @Test
    void createsOwnerAndFirebaseIdentityOnFirstSignIn() {
        VerifiedFirebaseToken firebaseToken = firebaseToken();
        when(authIdentityRepository.findWithUserByProviderSubject(firebaseToken.uid())).thenReturn(Optional.empty());
        when(userAccountRepository.save(any(UserAccount.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        AuthSessionResponse session = service.openSession(firebaseToken, "  Thao  ");

        ArgumentCaptor<UserAccount> userCaptor = ArgumentCaptor.forClass(UserAccount.class);
        verify(userAccountRepository).save(userCaptor.capture());
        verify(authIdentityRepository).save(any(AuthIdentity.class));
        assertThat(userCaptor.getValue().getDisplayName()).isEqualTo("Thao");
        assertThat(userCaptor.getValue().getEmail()).isEqualTo("owner@example.test");
        assertThat(session.role().name()).isEqualTo("OWNER");
        assertThat(session.needsOnboarding()).isTrue();
    }

    @Test
    void returnsExistingAccountWithoutCreatingDuplicates() {
        VerifiedFirebaseToken firebaseToken = firebaseToken();
        UserAccount user = UserAccount.createOwner("Existing owner", firebaseToken);
        AuthIdentity identity = AuthIdentity.forFirebase(user, firebaseToken.uid());
        when(authIdentityRepository.findWithUserByProviderSubject(firebaseToken.uid()))
                .thenReturn(Optional.of(identity));

        AuthSessionResponse session = service.openSession(firebaseToken, null);

        verify(userAccountRepository, never()).save(any());
        verify(authIdentityRepository, never()).save(any());
        assertThat(session.user().displayName()).isEqualTo("Existing owner");
        assertThat(session.needsOnboarding()).isTrue();
    }

    @Test
    void rejectsFirstSignInWithoutDisplayName() {
        VerifiedFirebaseToken firebaseToken = firebaseToken();
        when(authIdentityRepository.findWithUserByProviderSubject(firebaseToken.uid())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.openSession(firebaseToken, "   "))
                .isInstanceOfSatisfying(
                        BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.DISPLAY_NAME_REQUIRED));

        verify(userAccountRepository, never()).save(any());
        verify(authIdentityRepository, never()).save(any());
    }

    @Test
    void meRequiresAnExistingLocalProfile() {
        VerifiedFirebaseToken firebaseToken = firebaseToken();
        when(authIdentityRepository.findWithUserByProviderSubject(firebaseToken.uid())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getCurrentSession(firebaseToken))
                .isInstanceOfSatisfying(
                        BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.AUTH_PROFILE_NOT_FOUND));
    }

    private VerifiedFirebaseToken firebaseToken() {
        return new VerifiedFirebaseToken(
                "firebase-uid",
                "owner@example.test",
                true,
                "+84901234567",
                "Firebase display name",
                "https://example.test/avatar.png");
    }
}
