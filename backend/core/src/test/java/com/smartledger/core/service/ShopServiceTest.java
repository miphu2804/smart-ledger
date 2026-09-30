package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smartledger.core.dto.request.ArchiveShopRequest;
import com.smartledger.core.dto.request.ShopCreateRequest;
import com.smartledger.core.dto.request.ShopStatusUpdateRequest;
import com.smartledger.core.dto.request.ShopUpdateRequest;
import com.smartledger.core.dto.response.ShopResponse;
import com.smartledger.core.entity.AuthIdentity;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.enums.SystemRole;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.AuthIdentityRepository;
import com.smartledger.core.repository.ShopRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.ShopServiceImpl;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

class ShopServiceTest {

    private final AuthIdentityRepository authIdentityRepository = Mockito.mock(AuthIdentityRepository.class);
    private final ShopRepository shopRepository = Mockito.mock(ShopRepository.class);
    private final ShopService service = new ShopServiceImpl(authIdentityRepository, shopRepository);

    @Test
    void createsAnActiveShopForTheCurrentOwner() {
        UserAccount owner = owner();
        authenticateAs(owner);
        when(shopRepository.save(any(Shop.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ShopResponse response = service.create(
                firebaseToken(),
                new ShopCreateRequest("  Tiệm Thảo  ", "  Grocery  ", " 0901234567 ", "  Quận 1  "));

        assertThat(response.name()).isEqualTo("Tiệm Thảo");
        assertThat(response.industry()).isEqualTo("Grocery");
        assertThat(response.status()).isEqualTo(ShopStatus.ACTIVE);
        verify(shopRepository).save(any(Shop.class));
    }

    @Test
    void returnsOnlyTheShopOwnedByTheCurrentOwner() {
        UserAccount owner = owner();
        authenticateAs(owner);
        Shop shop = Shop.create(owner.getId(), "Tiệm Thảo", "Grocery", null, null);
        when(shopRepository.findByIdAndOwnerId(eq(7L), any())).thenReturn(Optional.of(shop));

        ShopResponse response = service.getById(firebaseToken(), "7");

        assertThat(response.name()).isEqualTo("Tiệm Thảo");
    }

    @Test
    void rejectsAccessToAnotherOwnersShop() {
        UserAccount owner = owner();
        authenticateAs(owner);
        when(shopRepository.findByIdAndOwnerId(eq(7L), any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getById(firebaseToken(), "7"))
                .isInstanceOfSatisfying(
                        BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.SHOP_ACCESS_DENIED));
    }

    @Test
    void rejectsAnInvalidShopHeaderBeforeQueryingTheRepository() {
        UserAccount owner = owner();
        authenticateAs(owner);

        assertThatThrownBy(() -> service.getById(firebaseToken(), "not-a-number"))
                .isInstanceOfSatisfying(
                        BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_SHOP_ID));

        verify(shopRepository, never()).findByIdAndOwnerId(any(), any());
    }

    @Test
    void rejectsAdminFromManagingOwnerShops() {
        UserAccount admin = owner();
        ReflectionTestUtils.setField(admin, "systemRole", SystemRole.ADMIN);
        authenticateAs(admin);

        assertThatThrownBy(() -> service.create(
                firebaseToken(),
                new ShopCreateRequest("Admin shop", "Grocery", null, null)))
                .isInstanceOfSatisfying(
                        BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.SHOP_ACCESS_DENIED));

        verify(shopRepository, never()).save(any());
    }

    @Test
    void updatesTheCurrentOwnersActiveShop() {
        UserAccount owner = owner();
        authenticateAs(owner);
        Shop shop = Shop.create(owner.getId(), "Old name", "Old industry", "0901", "Old address");
        when(shopRepository.findByIdAndOwnerId(eq(7L), any())).thenReturn(Optional.of(shop));

        ShopResponse response = service.updateById(
                firebaseToken(),
                "7",
                new ShopUpdateRequest("New name", null, null, "New address"));

        assertThat(response.name()).isEqualTo("New name");
        assertThat(response.industry()).isEqualTo("Old industry");
        assertThat(response.status()).isEqualTo(ShopStatus.ACTIVE);
    }

    @Test
    void archivesTheCurrentOwnersShopAndHidesItFromFurtherReads() {
        UserAccount owner = owner();
        authenticateAs(owner);
        Shop shop = Shop.create(owner.getId(), "Tiệm Thảo", "Grocery", null, null);
        when(shopRepository.findByIdAndOwnerId(eq(7L), any())).thenReturn(Optional.of(shop));

        service.archiveById(firebaseToken(), "7", new ArchiveShopRequest("No longer operating"));

        assertThat(shop.getStatus()).isEqualTo(ShopStatus.ARCHIVED);
        assertThat(shop.getArchivedAt()).isNotNull();
        assertThat(shop.getArchivedReason()).isEqualTo("No longer operating");
        assertThatThrownBy(() -> service.getById(firebaseToken(), "7"))
                .isInstanceOfSatisfying(
                        BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.SHOP_NOT_FOUND));
    }

    @Test
    void rejectsOwnerUpdatesForAnInactiveShopAndReturnsItsReason() {
        UserAccount owner = owner();
        authenticateAs(owner);
        Shop shop = Shop.create(owner.getId(), "Tiệm Thảo", "Grocery", null, null);
        shop.deactivate("Subscription expired");
        when(shopRepository.findByIdAndOwnerId(eq(7L), any())).thenReturn(Optional.of(shop));

        assertThatThrownBy(() -> service.updateById(
                firebaseToken(),
                "7",
                new ShopUpdateRequest("New name", null, null, null)))
                .isInstanceOfSatisfying(
                        BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.SHOP_INACTIVE));

        ShopResponse response = service.getById(firebaseToken(), "7");
        assertThat(response.inactiveReason()).isEqualTo("Subscription expired");
    }

    @Test
    void rejectsAnInactiveShopForFutureBusinessOperations() {
        UserAccount owner = owner();
        authenticateAs(owner);
        Shop shop = Shop.create(owner.getId(), "Tiệm Thảo", "Grocery", null, null);
        shop.deactivate("Policy review");
        when(shopRepository.findByIdAndOwnerId(eq(7L), any())).thenReturn(Optional.of(shop));

        assertThatThrownBy(() -> service.requireOwnedActiveShop(firebaseToken(), "7"))
                .isInstanceOfSatisfying(
                        BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.SHOP_INACTIVE));
    }

    @Test
    void allowsAdminToInactivateAndReactivateAnActiveShop() {
        UserAccount admin = owner();
        ReflectionTestUtils.setField(admin, "systemRole", SystemRole.ADMIN);
        authenticateAs(admin);
        Shop shop = Shop.create(99L, "Tiệm Thảo", "Grocery", null, null);
        when(shopRepository.findById(7L)).thenReturn(Optional.of(shop));

        ShopResponse inactive = service.updateStatus(
                firebaseToken(),
                "7",
                new ShopStatusUpdateRequest(ShopStatus.INACTIVE, "Subscription expired"));

        assertThat(inactive.status()).isEqualTo(ShopStatus.INACTIVE);
        assertThat(inactive.inactiveReason()).isEqualTo("Subscription expired");

        ShopResponse active = service.updateStatus(
                firebaseToken(),
                "7",
                new ShopStatusUpdateRequest(ShopStatus.ACTIVE, null));

        assertThat(active.status()).isEqualTo(ShopStatus.ACTIVE);
        assertThat(active.inactiveReason()).isNull();
    }

    @Test
    void rejectsOwnerFromChangingShopStatusAsAdmin() {
        UserAccount owner = owner();
        authenticateAs(owner);

        assertThatThrownBy(() -> service.updateStatus(
                firebaseToken(),
                "7",
                new ShopStatusUpdateRequest(ShopStatus.INACTIVE, "Policy review")))
                .isInstanceOfSatisfying(
                        BusinessException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ADMIN_ACCESS_REQUIRED));

        verify(shopRepository, never()).findById(any());
    }

    private void authenticateAs(UserAccount user) {
        AuthIdentity identity = AuthIdentity.forFirebase(user, firebaseToken().uid());
        when(authIdentityRepository.findWithUserByProviderSubject(firebaseToken().uid()))
                .thenReturn(Optional.of(identity));
    }

    private UserAccount owner() {
        return UserAccount.createOwner("Thảo", firebaseToken());
    }

    private VerifiedFirebaseToken firebaseToken() {
        return new VerifiedFirebaseToken(
                "firebase-uid",
                "owner@example.test",
                true,
                "+84901234567",
                "Thảo",
                "https://example.test/avatar.png");
    }
}
