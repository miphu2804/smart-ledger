package com.smartledger.core.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

/** Snake_case on the wire to match the Agent contract (api-contracts.md section 5). */
public record AgentChatRequest(
        @JsonProperty("conversation_id") @Positive Long conversationId,
        @NotBlank String message) {
}
