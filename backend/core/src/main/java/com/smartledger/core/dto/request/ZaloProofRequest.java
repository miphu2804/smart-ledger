package com.smartledger.core.dto.request;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** One-time client proof; neither field may be put into redirects or application logs. */
@Schema(additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
public record ZaloProofRequest(
        @NotNull @Pattern(regexp = "[A-Za-z0-9_-]{43}")
        @Schema(description = "One-time proof received from the verified Core popup") String proof,
        @NotNull @Pattern(regexp = "[A-Za-z0-9_-]{43}")
        @Schema(description = "Client-generated secret corresponding to clientChallenge") String clientVerifier) {

    @JsonAnySetter
    public void rejectUnknownField(String name, Object value) {
        throw new IllegalArgumentException("Unexpected Zalo proof field.");
    }

    @Override
    public String toString() { return "ZaloProofRequest[redacted]"; }
}
