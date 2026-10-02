package com.smartledger.core.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.smartledger.core.dto.request.AgentChatRequest;
import com.smartledger.core.dto.response.AgentChatResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;

/** Forwards assistant calls to the AI service for the authenticated owner's shop. */
public interface AgentService {

    AgentChatResponse chat(VerifiedFirebaseToken token, String shopId, AgentChatRequest request);

    JsonNode listConversations(VerifiedFirebaseToken token, String shopId);

    JsonNode getConversation(VerifiedFirebaseToken token, String shopId, long conversationId);

    JsonNode renameConversation(VerifiedFirebaseToken token, String shopId, long conversationId, String title);

    void deleteConversation(VerifiedFirebaseToken token, String shopId, long conversationId);
}
