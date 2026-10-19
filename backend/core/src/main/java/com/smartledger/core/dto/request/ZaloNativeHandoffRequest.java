package com.smartledger.core.dto.request;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

@Schema(additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
public record ZaloNativeHandoffRequest(
        @NotNull @Pattern(regexp = "[A-Za-z0-9_-]{1,100}") String nativeClientId,
        @NotNull @Pattern(regexp = "[A-Za-z0-9_-]{16,100}") String requestId,
        @NotNull @Pattern(regexp = "[A-Za-z0-9_-]{43}") String handoffReference,
        @NotNull @Pattern(regexp = "[A-Za-z0-9_-]{43}") String clientVerifier) {
    @JsonAnySetter
    public void rejectUnknownField(String name, Object value) { throw new IllegalArgumentException("Unexpected Zalo handoff field."); }
    @Override
    public String toString() { return "ZaloNativeHandoffRequest[redacted]"; }
}
