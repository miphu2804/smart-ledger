package com.smartledger.core.media;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.util.Map;
import org.springframework.util.StringUtils;

/** Maps the Cloudinary SDK boundary to the Core media port. */
public class CloudinaryMediaStorage implements MediaStorage {

    private final CloudinaryGateway gateway;

    public CloudinaryMediaStorage(CloudinaryGateway gateway) {
        this.gateway = gateway;
    }

    @Override
    public StoredMedia upload(MediaUpload upload) {
        try {
            Map<String, Object> result = gateway.upload(
                    upload.bytes(), upload.contentType(), upload.publicId(), upload.deliveryType());
            String publicId = value(result, "public_id");
            String secureUrl = value(result, "secure_url");
            if (!StringUtils.hasText(publicId) || !StringUtils.hasText(secureUrl)) {
                throw new IllegalStateException("Cloudinary upload returned no durable media reference");
            }
            return new StoredMedia(publicId, secureUrl);
        } catch (RuntimeException exception) {
            throw new BusinessException(ErrorCode.MEDIA_UNAVAILABLE);
        }
    }

    @Override
    public void delete(String publicId, MediaDeliveryType deliveryType) {
        try {
            gateway.delete(publicId, deliveryType);
        } catch (RuntimeException exception) {
            throw new BusinessException(ErrorCode.MEDIA_UNAVAILABLE);
        }
    }

    @Override
    public String authenticatedUrl(String publicId) {
        try {
            String url = gateway.authenticatedUrl(publicId);
            if (!StringUtils.hasText(url)) {
                throw new IllegalStateException("Cloudinary generated no authenticated delivery URL");
            }
            return url;
        } catch (RuntimeException exception) {
            throw new BusinessException(ErrorCode.MEDIA_UNAVAILABLE);
        }
    }

    private static String value(Map<String, Object> result, String key) {
        Object value = result.get(key);
        return value instanceof String string ? string : null;
    }
}
