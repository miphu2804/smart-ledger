package com.smartledger.core.media;

public interface MediaStorage {

    default void ensureAvailable() { }

    StoredMedia upload(MediaUpload upload);

    void delete(String publicId, MediaDeliveryType deliveryType);

    String authenticatedUrl(String publicId);
}
