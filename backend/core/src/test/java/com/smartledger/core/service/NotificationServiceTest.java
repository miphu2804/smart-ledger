package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.smartledger.core.entity.AuthIdentity;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.AuthIdentityRepository;
import com.smartledger.core.repository.NotificationRecipientRepository;
import com.smartledger.core.repository.ShopRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.NotificationServiceImpl;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.support.PageableUtils;
import org.springframework.test.util.ReflectionTestUtils;

class NotificationServiceTest {
    private final NotificationRecipientRepository recipients = mock(NotificationRecipientRepository.class);
    private final AuthIdentityRepository identities = mock(AuthIdentityRepository.class);
    private final ShopRepository shops = mock(ShopRepository.class);
    private final NotificationService service = new NotificationServiceImpl(recipients, identities, shops);
    private final VerifiedFirebaseToken token = new VerifiedFirebaseToken("owner", null, false, null, null, null);

    @BeforeEach
    void authenticateOwner() {
        UserAccount owner = UserAccount.createOwner("Owner", token);
        ReflectionTestUtils.setField(owner, "id", 42L);
        when(identities.findWithUserByProviderSubject(token.uid()))
                .thenReturn(Optional.of(AuthIdentity.forFirebase(owner, token.uid())));
    }

    @ParameterizedTest
    @CsvSource({"-1,20", "0,0", "0,-1", "0,101", "2147483647,20", "107374183,20", "2147483647,100"})
    void invalidPaginationIsRejectedBeforeAnyNotificationQuery(int page, int size) {
        assertThatThrownBy(() -> service.list(token, null, null, false, page, size))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_NOTIFICATION_QUERY));
        verifyNoInteractions(recipients, shops);
    }

    @ParameterizedTest
    @CsvSource({"0,20,0", "107374182,20,2147483640", "2147483647,1,2147483647", "21474836,100,2147483600"})
    void offsetWithinJpaLimitIsAcceptedIncludingExactMaximum(int page, int size, long expectedOffset) {
        when(recipients.search(eq(42L), isNull(), isNull(), eq(false), any(Pageable.class))).thenReturn(Page.empty());

        var result = service.list(token, null, null, false, page, size);

        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(recipients).search(eq(42L), isNull(), isNull(), eq(false), pageable.capture());
        assertThat(pageable.getValue().getOffset()).isEqualTo(expectedOffset);
        assertThat(PageableUtils.getOffsetAsInteger(pageable.getValue())).isEqualTo((int) expectedOffset);
        assertThat(result.page()).isEqualTo(page);
        assertThat(result.items()).isEmpty();
    }
}
