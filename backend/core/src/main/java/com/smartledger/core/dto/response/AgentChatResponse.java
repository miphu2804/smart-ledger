package com.smartledger.core.dto.response;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** The part of the AI chat reply the app may see; model and request metadata stay server-side. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record AgentChatResponse(
        @JsonProperty("conversation_id") long conversationId,
        @JsonProperty("message_id") long messageId,
        String answer) {
}
