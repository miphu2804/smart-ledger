package com.smartledger.core.zalo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.config.ZaloProperties;
import com.smartledger.core.exception.BusinessException;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ZaloCryptoTest {
    @Test
    void tokensHavePkceEntropyAndHashUsesSha256Base64Url() {
        assertThat(ZaloCrypto.randomToken()).matches("[A-Za-z0-9_-]{43}")
                .isNotEqualTo(ZaloCrypto.randomToken());
        assertThat(ZaloCrypto.hash("abc")).isEqualTo("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
    }

    @Test
    void encryptionUsesRandomIvAndAuthenticatesFlowId() {
        ZaloCrypto crypto = crypto();
        UUID flow = UUID.randomUUID();
        String verifier = ZaloCrypto.randomToken();
        String ciphertext = crypto.encryptVerifier(verifier, flow);
        assertThat(ciphertext).doesNotContain(verifier).isNotEqualTo(crypto.encryptVerifier(verifier, flow));
        assertThat(crypto.decryptVerifier(ciphertext, flow)).isEqualTo(verifier);
        assertThatThrownBy(() -> crypto.decryptVerifier(ciphertext, UUID.randomUUID()))
                .isInstanceOf(BusinessException.class).hasMessageNotContaining(verifier);
        byte[] bytes = Base64.getUrlDecoder().decode(ciphertext);
        bytes[bytes.length - 1] ^= 1;
        assertThatThrownBy(() -> crypto.decryptVerifier(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes), flow))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void missingKeyDoesNotBreakDisabledConstructionButCannotEncrypt() {
        ZaloCrypto crypto = new ZaloCrypto(new ZaloProperties());
        assertThatThrownBy(() -> crypto.encryptVerifier("verifier", UUID.randomUUID()))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> crypto().decryptVerifier("invalid", UUID.randomUUID()))
                .isInstanceOf(BusinessException.class);
    }

    private static ZaloCrypto crypto() {
        ZaloProperties properties = new ZaloProperties();
        properties.setSessionEncryptionKey(Base64.getEncoder().encodeToString(new byte[32]));
        return new ZaloCrypto(properties);
    }
}
