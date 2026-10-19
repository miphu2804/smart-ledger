package com.smartledger.core.zalo;

import com.smartledger.core.config.ZaloProperties;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

@Component
public class ZaloCrypto {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final ZaloProperties properties;

    public ZaloCrypto(ZaloProperties properties) { this.properties = properties; }

    public static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static String hash(String value) {
        if (value == null || value.chars().anyMatch(character -> character > 127)) {
            throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
        }
        try {
            return Base64.getUrlEncoder().withoutPadding().encodeToString(
                    MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.US_ASCII)));
        } catch (GeneralSecurityException exception) {
            throw new BusinessException(ErrorCode.ZALO_UNAVAILABLE);
        }
    }

    public String encryptVerifier(String verifier, UUID flowId) {
        if (verifier == null || !verifier.matches("[A-Za-z0-9_-]{43}") || flowId == null) {
            throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
        }
        try {
            byte[] iv = new byte[12];
            RANDOM.nextBytes(iv);
            Cipher cipher = cipher(Cipher.ENCRYPT_MODE, iv, flowId);
            byte[] encrypted = cipher.doFinal(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(
                    ByteBuffer.allocate(iv.length + encrypted.length).put(iv).put(encrypted).array());
        } catch (GeneralSecurityException exception) {
            throw new BusinessException(ErrorCode.ZALO_UNAVAILABLE);
        }
    }

    public String decryptVerifier(String ciphertext, UUID flowId) {
        try {
            if (ciphertext == null || ciphertext.length() > 1000 || flowId == null) {
                throw new IllegalArgumentException();
            }
            byte[] bytes = Base64.getUrlDecoder().decode(ciphertext);
            if (bytes.length < 29) {
                throw new IllegalArgumentException();
            }
            byte[] iv = new byte[12];
            ByteBuffer.wrap(bytes).get(iv);
            byte[] plain = cipher(Cipher.DECRYPT_MODE, iv, flowId).doFinal(bytes, iv.length, bytes.length - iv.length);
            return new String(plain, StandardCharsets.US_ASCII);
        } catch (GeneralSecurityException | IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.ZALO_SESSION_INVALID);
        }
    }

    private Cipher cipher(int mode, byte[] iv, UUID flowId) throws GeneralSecurityException {
        byte[] key;
        try {
            key = Base64.getDecoder().decode(properties.getSessionEncryptionKey());
            if (key.length != 32) {
                throw new IllegalArgumentException();
            }
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw new BusinessException(ErrorCode.ZALO_UNAVAILABLE);
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        cipher.updateAAD(flowId.toString().getBytes(StandardCharsets.US_ASCII));
        return cipher;
    }
}
