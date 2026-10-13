package com.smartledger.core.media;

/** Minimal idempotency fingerprint; raw image bytes never enter the idempotency table. */
public record MediaUploadRequest(String publicId, String imageSha256) {
}
