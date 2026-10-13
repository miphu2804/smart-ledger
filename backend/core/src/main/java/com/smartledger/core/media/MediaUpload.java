package com.smartledger.core.media;

/** A validated upload with a server-generated public ID and delivery visibility. */
public record MediaUpload(String publicId, String contentType, byte[] bytes, MediaDeliveryType deliveryType) {

    public MediaUpload {
        bytes = bytes.clone();
        if (deliveryType == null) {
            deliveryType = MediaDeliveryType.PUBLIC;
        }
    }

    public MediaUpload(String publicId, String contentType, byte[] bytes) {
        this(publicId, contentType, bytes, MediaDeliveryType.PUBLIC);
    }

    @Override
    public byte[] bytes() {
        return bytes.clone();
    }
}
