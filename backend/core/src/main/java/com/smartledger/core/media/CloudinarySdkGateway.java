package com.smartledger.core.media;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import java.io.IOException;
import java.util.Map;

/** The only class that knows the Cloudinary SDK. It is deliberately not a controller or JPA entity. */
public class CloudinarySdkGateway implements CloudinaryGateway {

    private final Cloudinary cloudinary;

    public CloudinarySdkGateway(Cloudinary cloudinary) {
        this.cloudinary = cloudinary;
    }

    @Override
    public Map<String, Object> upload(byte[] bytes, String contentType, String publicId, MediaDeliveryType deliveryType) {
        try {
            return cloudinary.uploader().upload(bytes, ObjectUtils.asMap(
                    "public_id", publicId,
                    "resource_type", "image",
                    "type", deliveryType.cloudinaryType(),
                    // The public ID contains the idempotency key and file hash. Reservation
                    // serializes concurrent callers; overwrite makes an ambiguous provider
                    // timeout safely resumable with the exact same immutable payload identity.
                    "overwrite", true,
                    "invalidate", true));
        } catch (IOException exception) {
            throw new IllegalStateException("Cloudinary upload failed", exception);
        }
    }

    @Override
    public void delete(String publicId, MediaDeliveryType deliveryType) {
        try {
            cloudinary.uploader().destroy(publicId, ObjectUtils.asMap(
                    "resource_type", "image",
                    "type", deliveryType.cloudinaryType(),
                    "invalidate", true));
        } catch (IOException exception) {
            throw new IllegalStateException("Cloudinary deletion failed", exception);
        }
    }

    @Override
    public String authenticatedUrl(String publicId) {
        return cloudinary.url().secure(true).signed(true).resourceType("image").type("authenticated")
                .generate(publicId);
    }
}
