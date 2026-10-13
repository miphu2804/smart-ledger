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
import com.smartledger.core.enums.SystemRole;
import com.smartledger.core.enums.UserStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.AuthIdentityRepository;
import com.smartledger.core.repository.ShopRepository;
import com.smartledger.core.repository.UserAccountRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.AuthSessionServiceImpl;
import com.smartledger.core.media.MediaStorage;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

class AuthSessionServiceTest {

    private final AuthIdentityRepository authIdentityRepository = Mockito.mock(AuthIdentityRepository.class);
    private final UserAccountRepository userAccountRepository = Mockito.mock(UserAccountRepository.class);
    private final ShopRepository shopRepository = Mockito.mock(ShopRepository.class);
    private final MediaStorage mediaStorage = Mockito.mock(MediaStorage.class);
    private final EntityManager entityManager = Mockito.mock(EntityManager.class);
    private final AuthSessionService service = new AuthSessionServiceImpl(
            authIdentityRepository,
            userAccountRepository,
            shopRepository,
            mediaStorage,
            entityManager);

    @Test
    void createsOwnerAndFirebaseIdentityOnFirstSignIn() {
        VerifiedFirebaseToken firebaseToken = firebaseToken();
        when(authIdentityRepository.findUserIdByProviderSubject(firebaseToken.uid())).thenReturn(Optional.empty());
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
        Mockito.verifyNoInteractions(entityManager);
    }

    @Test
    void returnsExistingAccountWithoutCreatingDuplicates() {
        VerifiedFirebaseToken firebaseToken = firebaseToken();
        UserAccount user = UserAccount.createOwner("Existing owner", firebaseToken);
        existingUser(firebaseToken, user);

        AuthSessionResponse session = service.openSession(firebaseToken, null);

        verify(userAccountRepository, never()).save(any());
        verify(authIdentityRepository, never()).save(any());
        assertThat(session.user().displayName()).isEqualTo("Existing owner");
        assertThat(session.needsOnboarding()).isTrue();
        var order = Mockito.inOrder(authIdentityRepository, userAccountRepository, entityManager);
        order.verify(authIdentityRepository).findUserIdByProviderSubject(firebaseToken.uid());
        order.verify(userAccountRepository).findLockedById(1L);
        order.verify(entityManager).refresh(user, LockModeType.PESSIMISTIC_WRITE);
        verify(authIdentityRepository, never()).findWithUserByProviderSubject(any());
    }

    @Test
    void rejectsFirstSignInWithoutDisplayName() {
        VerifiedFirebaseToken firebaseToken = firebaseToken();
        when(authIdentityRepository.findUserIdByProviderSubject(firebaseToken.uid())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.openSession(firebaseToken, "   "))
                .isInstanceOfSatisfying(
                        BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.DISPLAY_NAME_REQUIRED));

        verify(userAccountRepository, never()).save(any());
        verify(authIdentityRepository, never()).save(any());
    }

    @Test
    void rejectsADisabledAccountAfterRefreshingAndDoesNotSyncFirebaseClaims() {
        VerifiedFirebaseToken changed = new VerifiedFirebaseToken("firebase-uid", "changed@example.test", true,
                "+84909999999", null, "https://example.test/new.png");
        UserAccount user = UserAccount.createOwner("Existing owner", firebaseToken());
        existingUser(changed, user);
        Mockito.doAnswer(invocation -> {
            ReflectionTestUtils.setField(user, "status", UserStatus.DISABLED);
            return null;
        }).when(entityManager).refresh(user, LockModeType.PESSIMISTIC_WRITE);

        assertThatThrownBy(() -> service.openSession(changed, null))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ACCOUNT_DISABLED));

        assertThat(user.getEmail()).isEqualTo("owner@example.test");
        assertThat(user.getPhone()).isEqualTo("+84901234567");
        assertThat(user.getAvatarUrl()).isEqualTo("https://example.test/avatar.png");
        Mockito.verifyNoInteractions(shopRepository, mediaStorage);
    }

    @Test
    void returnsTheRoleAndAvatarRefreshedUnderLockWithoutOverwritingThem() {
        VerifiedFirebaseToken changed = new VerifiedFirebaseToken("firebase-uid", "changed@example.test", true,
                "+84909999999", null, "https://example.test/new.png");
        UserAccount user = UserAccount.createOwner("Existing owner", firebaseToken());
        existingUser(changed, user);
        Mockito.doAnswer(invocation -> {
            ReflectionTestUtils.setField(user, "systemRole", SystemRole.ADMIN);
            user.replaceCloudinaryAvatar("users/1/avatar/new");
            return null;
        }).when(entityManager).refresh(user, LockModeType.PESSIMISTIC_WRITE);
        when(mediaStorage.authenticatedUrl("users/1/avatar/new")).thenReturn("https://cdn.example/new.png");

        AuthSessionResponse session = service.openSession(changed, null);

        assertThat(session.role()).isEqualTo(SystemRole.ADMIN);
        assertThat(session.shops()).isEmpty();
        assertThat(session.needsOnboarding()).isFalse();
        assertThat(session.user().avatarUrl()).isEqualTo("https://cdn.example/new.png");
        assertThat(user.getAvatarPublicId()).isEqualTo("users/1/avatar/new");
        assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE);
        assertThat(user.getEmail()).isEqualTo("changed@example.test");
        assertThat(user.getPhone()).isEqualTo("+84909999999");
        assertThat(user.getAvatarUrl()).isEqualTo("https://example.test/new.png");
        Mockito.verifyNoInteractions(shopRepository);
    }

    @Test
    void missingUserForAnExistingIdentityDoesNotProvisionAnotherAccount() {
        when(authIdentityRepository.findUserIdByProviderSubject("firebase-uid")).thenReturn(Optional.of(1L));
        when(userAccountRepository.findLockedById(1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.openSession(firebaseToken(), "Owner"))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.AUTH_PROFILE_NOT_FOUND));

        verify(userAccountRepository, never()).save(any());
        verify(authIdentityRepository, never()).save(any());
        Mockito.verifyNoInteractions(entityManager);
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

    @Test
    void returnsASignedCloudinaryAvatarInsteadOfPersistingAProviderUrl() {
        VerifiedFirebaseToken firebaseToken = firebaseToken();
        UserAccount user = UserAccount.createOwner("Existing owner", firebaseToken);
        user.replaceCloudinaryAvatar("users/1/avatar/opaque");
        when(authIdentityRepository.findWithUserByProviderSubject(firebaseToken.uid()))
                .thenReturn(Optional.of(AuthIdentity.forFirebase(user, firebaseToken.uid())));
        when(mediaStorage.authenticatedUrl("users/1/avatar/opaque"))
                .thenReturn("https://cdn.example/image/authenticated/s--signature--/avatar.png");

        AuthSessionResponse session = service.getCurrentSession(firebaseToken);

        assertThat(session.user().avatarUrl()).contains("authenticated").contains("s--signature--");
        assertThat(user.getAvatarUrl()).isEqualTo("https://example.test/avatar.png");
        verify(mediaStorage).authenticatedUrl("users/1/avatar/opaque");
    }

    @Test
    void doesNotFailSessionWhenMediaIsDisabledForAnExistingCloudinaryAvatar() {
        VerifiedFirebaseToken firebaseToken = firebaseToken();
        UserAccount user = UserAccount.createOwner("Existing owner", firebaseToken);
        user.replaceCloudinaryAvatar("users/1/avatar/opaque");
        when(authIdentityRepository.findWithUserByProviderSubject(firebaseToken.uid()))
                .thenReturn(Optional.of(AuthIdentity.forFirebase(user, firebaseToken.uid())));
        when(mediaStorage.authenticatedUrl("users/1/avatar/opaque"))
                .thenThrow(new BusinessException(ErrorCode.MEDIA_UNAVAILABLE));

        AuthSessionResponse session = service.getCurrentSession(firebaseToken);

        assertThat(session.user().avatarUrl()).isNull();
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

    private void existingUser(VerifiedFirebaseToken token, UserAccount user) {
        ReflectionTestUtils.setField(user, "id", 1L);
        when(authIdentityRepository.findUserIdByProviderSubject(token.uid())).thenReturn(Optional.of(1L));
        when(userAccountRepository.findLockedById(1L)).thenReturn(Optional.of(user));
    }
}
