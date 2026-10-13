package com.smartledger.core.media;

import static org.assertj.core.api.Assertions.assertThat;

import com.smartledger.core.config.CloudinaryProperties;
import com.smartledger.core.enums.MediaAssetType;
import org.junit.jupiter.api.Test;

class MediaPublicIdFactoryTest {

    @Test
    void createsAnOpaqueStableIdWithoutLeakingTheIdempotencyKeyOrFileHash() {
        CloudinaryProperties properties = new CloudinaryProperties();
        properties.setEnabled(true);
        properties.setApiSecret("test-secret");
        properties.setPublicIdPrefix("smartledger/test");
        MediaPublicIdFactory factory = new MediaPublicIdFactory(properties);

        String first = factory.create(MediaAssetType.PRODUCT_IMAGE, 7L, 9L, "request-key", "a".repeat(64));
        String retry = factory.create(MediaAssetType.PRODUCT_IMAGE, 7L, 9L, "request-key", "a".repeat(64));

        assertThat(first).isEqualTo(retry).startsWith("smartledger/test/shops/7/products/9/");
        assertThat(first).doesNotContain("request-key").doesNotContain("aaaa");
    }
}
