package com.smartledger.core.media;

import com.smartledger.core.config.CloudinaryProperties;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.MediaAssetType;
import com.smartledger.core.exception.BusinessException;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/** Creates opaque, deterministic Cloudinary IDs without exposing an idempotency key or file hash. */
@Component
public class MediaPublicIdFactory {

    private final CloudinaryProperties properties;

    public MediaPublicIdFactory(CloudinaryProperties properties) {
        this.properties = properties;
    }

    public String create(MediaAssetType assetType, Long shopId, Long resourceId, String idempotencyKey,
            String imageSha256) {
        if (!properties.isEnabled() || !StringUtils.hasText(properties.getApiSecret())) {
            throw new BusinessException(ErrorCode.MEDIA_UNAVAILABLE);
        }
        if (!StringUtils.hasText(idempotencyKey) || idempotencyKey.length() > 255) {
            throw new BusinessException(ErrorCode.INVALID_IDEMPOTENCY_KEY);
        }
        String suffix = hmac(assetType + ":" + shopId + ":" + resourceId + ":" + idempotencyKey.trim()
                + ":" + imageSha256);
        return prefix() + "/" + switch (assetType) {
            case PRODUCT_IMAGE -> "shops/" + shopId + "/products/" + resourceId + "/" + suffix;
            case SHOP_LOGO -> "shops/" + shopId + "/logo/" + suffix;
            case USER_AVATAR -> "users/" + resourceId + "/avatar/" + suffix;
        };
    }

    /** Avatar retries need a user-scoped idempotency table, which is introduced with the later migration. */
    public String createAvatar(Long userId, String imageSha256) {
        if (!properties.isEnabled() || !StringUtils.hasText(properties.getApiSecret())) {
            throw new BusinessException(ErrorCode.MEDIA_UNAVAILABLE);
        }
        return prefix() + "/users/" + userId + "/avatar/" + hmac("USER_AVATAR:" + userId + ":" + imageSha256 + ":"
                + UUID.randomUUID());
    }

    private String prefix() {
        if (!StringUtils.hasText(properties.getPublicIdPrefix())) {
            throw new BusinessException(ErrorCode.MEDIA_UNAVAILABLE);
        }
        return properties.getPublicIdPrefix().trim();
    }

    private String hmac(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(properties.getApiSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException | InvalidKeyException exception) {
            throw new IllegalStateException("Cannot generate a media public ID", exception);
        }
    }
}
