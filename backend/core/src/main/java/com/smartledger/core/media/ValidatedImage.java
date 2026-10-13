package com.smartledger.core.media;

/**
 * Image bytes inspected by Core before they can leave the process for a media provider.
 * The SHA-256 becomes part of a later idempotent upload request; it is never returned to clients.
 */
public record ValidatedImage(byte[] bytes, String contentType, int width, int height, String sha256) {

    public ValidatedImage {
        bytes = bytes.clone();
    }

    @Override
    public byte[] bytes() {
        return bytes.clone();
    }
}
