package com.smartledger.core.media;

/** Cloudinary delivery visibility. Provider details stay behind the media port. */
public enum MediaDeliveryType {
    PUBLIC("upload"),
    AUTHENTICATED("authenticated");

    private final String cloudinaryType;

    MediaDeliveryType(String cloudinaryType) {
        this.cloudinaryType = cloudinaryType;
    }

    public String cloudinaryType() {
        return cloudinaryType;
    }
}
