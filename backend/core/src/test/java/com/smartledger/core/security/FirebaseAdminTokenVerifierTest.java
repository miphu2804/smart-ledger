package com.smartledger.core.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import java.util.Map;
import org.junit.jupiter.api.Test;

class FirebaseAdminTokenVerifierTest {

    private final FirebaseAuth firebaseAuth = mock(FirebaseAuth.class);
    private final FirebaseAdminTokenVerifier verifier = new FirebaseAdminTokenVerifier(firebaseAuth);

    @Test
    void returnsOnlyServerVerifiedFirebaseIdentity() throws Exception {
        FirebaseToken firebaseToken = mock(FirebaseToken.class);
        when(firebaseToken.getUid()).thenReturn("firebase-uid");
        when(firebaseToken.getEmail()).thenReturn("owner@example.test");
        when(firebaseToken.isEmailVerified()).thenReturn(true);
        when(firebaseToken.getClaims()).thenReturn(Map.of("phone_number", "+84901234567"));
        when(firebaseToken.getName()).thenReturn("Thao");
        when(firebaseToken.getPicture()).thenReturn("https://example.test/avatar.png");
        when(firebaseAuth.verifyIdToken("valid-token")).thenReturn(firebaseToken);

        VerifiedFirebaseToken verifiedToken = verifier.verify("valid-token");

        assertThat(verifiedToken.uid()).isEqualTo("firebase-uid");
        assertThat(verifiedToken.email()).isEqualTo("owner@example.test");
        assertThat(verifiedToken.emailVerified()).isTrue();
        assertThat(verifiedToken.phoneNumber()).isEqualTo("+84901234567");
        assertThat(verifiedToken.displayName()).isEqualTo("Thao");
        assertThat(verifiedToken.avatarUrl()).isEqualTo("https://example.test/avatar.png");
    }

    @Test
    void wrapsFirebaseVerificationFailure() throws Exception {
        FirebaseAuthException failure = mock(FirebaseAuthException.class);
        when(firebaseAuth.verifyIdToken("invalid-token")).thenThrow(failure);

        assertThatThrownBy(() -> verifier.verify("invalid-token"))
                .isInstanceOf(FirebaseTokenVerificationException.class)
                .hasCause(failure);
    }
}
