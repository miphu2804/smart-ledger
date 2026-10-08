package com.smartledger.core.media;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;

/** Safe default when Cloudinary is deliberately disabled or not configured for an environment. */
public class UnavailableMediaStorage implements MediaStorage {

    @Override
    public void ensureAvailable() {
        throw new BusinessException(ErrorCode.MEDIA_UNAVAILABLE);
    }

    @Override
    public StoredMedia upload(MediaUpload upload) {
        throw new BusinessException(ErrorCode.MEDIA_UNAVAILABLE);
    }

    @Override
    public void delete(String publicId, MediaDeliveryType deliveryType) {
        throw new BusinessException(ErrorCode.MEDIA_UNAVAILABLE);
    }

    @Override
    public String authenticatedUrl(String publicId) {
        throw new BusinessException(ErrorCode.MEDIA_UNAVAILABLE);
    }
}
