package com.smartledger.core.media;

import java.util.Map;

/** Narrow seam around the Cloudinary SDK so media behaviour can be unit-tested without a network call. */
public interface CloudinaryGateway {

    Map<String, Object> upload(byte[] bytes, String contentType, String publicId, MediaDeliveryType deliveryType);

    void delete(String publicId, MediaDeliveryType deliveryType);

    String authenticatedUrl(String publicId);
}
