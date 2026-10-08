package com.smartledger.core.media;

public interface MediaStorage {

    StoredMedia upload(MediaUpload upload);

    void delete(String publicId, MediaDeliveryType deliveryType);

    String authenticatedUrl(String publicId);
}
