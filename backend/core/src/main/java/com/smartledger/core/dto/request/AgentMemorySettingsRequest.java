package com.smartledger.core.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;

/** Snake_case on the wire to match the Agent contract (api-contracts.md section 5). */
public record AgentMemorySettingsRequest(@JsonProperty("memory_enabled") @NotNull Boolean memoryEnabled) {
}
