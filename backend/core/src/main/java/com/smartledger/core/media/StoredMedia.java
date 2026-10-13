package com.smartledger.core.media;

/** Provider-neutral reference that a future persistence transaction will save after a successful upload. */
public record StoredMedia(String publicId, String secureUrl) {
}
