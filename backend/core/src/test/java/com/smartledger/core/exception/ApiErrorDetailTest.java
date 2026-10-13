package com.smartledger.core.exception;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.enums.CatalogStatus;
import org.junit.jupiter.api.Test;

class ApiErrorDetailTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void ordinaryErrorsKeepExactlyTheExistingTwoFields() throws Exception {
        var json = mapper.readTree(mapper.writeValueAsString(new ApiErrorDetail("barcode", "is required")));
        assertThat(json.size()).isEqualTo(2);
        assertThat(json.path("field").asText()).isEqualTo("barcode");
        assertThat(json.path("issue").asText()).isEqualTo("is required");
        assertThat(json.has("productId")).isFalse();
        assertThat(json.has("status")).isFalse();
    }

    @Test
    void barcodeConflictAddsStructuredIdAndStatusAndRoundTrips() throws Exception {
        var detail = new ApiErrorDetail("barcode", "already_in_use", 123L, CatalogStatus.ACTIVE);
        String serialized = mapper.writeValueAsString(detail);
        var json = mapper.readTree(serialized);
        assertThat(json.size()).isEqualTo(4);
        assertThat(json.path("productId").asLong()).isEqualTo(123L);
        assertThat(json.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(mapper.readValue(serialized, ApiErrorDetail.class)).isEqualTo(detail);
    }
}
