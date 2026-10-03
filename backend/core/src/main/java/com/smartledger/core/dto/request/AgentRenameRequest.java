package com.smartledger.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AgentRenameRequest(@NotBlank @Size(max = 255) String title) {
}
