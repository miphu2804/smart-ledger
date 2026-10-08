package com.smartledger.core.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.smartledger.core.dto.request.AgentChatRequest;
import com.smartledger.core.dto.response.AgentChatResponse;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AgentService;
import com.smartledger.core.service.ShopService;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriBuilder;

@Service
public class AgentServiceImpl implements AgentService {
    private static final Logger log = LoggerFactory.getLogger(AgentServiceImpl.class);
    private static final String AGENT_PATH = "/internal/v1/agent";
    private static final String CONVERSATION_PATH = AGENT_PATH + "/conversations/{id}";

    private final ShopService shopService;
    private final RestClient aiClient;

    public AgentServiceImpl(ShopService shopService, RestClient aiRestClient) {
        this.shopService = shopService;
        this.aiClient = aiRestClient;
    }

    @Override
    public AgentChatResponse chat(VerifiedFirebaseToken token, String shopId, AgentChatRequest request) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        Map<String, Object> body = scopedBody(shop);
        body.put("message", request.message());
        if (request.conversationId() != null) {
            body.put("conversation_id", request.conversationId());
        }
        return callAi(() -> send(aiClient.post().uri(AGENT_PATH + "/chat").body(body))
                .body(AgentChatResponse.class));
    }

    @Override
    public JsonNode listConversations(VerifiedFirebaseToken token, String shopId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        return callAi(() -> send(aiClient.get()
                .uri(uri -> scoped(uri.path(AGENT_PATH + "/conversations"), shop).build()))
                .body(JsonNode.class));
    }

    @Override
    public JsonNode getConversation(VerifiedFirebaseToken token, String shopId, long conversationId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        return callAi(() -> send(aiClient.get()
                .uri(uri -> scoped(uri.path(CONVERSATION_PATH), shop).build(conversationId)))
                .body(JsonNode.class));
    }

    @Override
    public JsonNode renameConversation(VerifiedFirebaseToken token, String shopId, long conversationId,
            String title) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        Map<String, Object> body = scopedBody(shop);
        body.put("title", title);
        return callAi(() -> send(aiClient.patch().uri(CONVERSATION_PATH, conversationId).body(body))
                .body(JsonNode.class));
    }

    @Override
    public void deleteConversation(VerifiedFirebaseToken token, String shopId, long conversationId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        callAi(() -> send(aiClient.delete()
                .uri(uri -> scoped(uri.path(CONVERSATION_PATH), shop).build(conversationId)))
                .toBodilessEntity());
    }

    /** user_id and shop_id come from the verified shop, never from the app, so a client cannot name another shop. */
    private Map<String, Object> scopedBody(Shop shop) {
        Map<String, Object> body = new HashMap<>();
        body.put("user_id", shop.getOwnerId());
        body.put("shop_id", shop.getId());
        return body;
    }

    private UriBuilder scoped(UriBuilder uri, Shop shop) {
        return uri.queryParam("user_id", shop.getOwnerId()).queryParam("shop_id", shop.getId());
    }

    private RestClient.ResponseSpec send(RestClient.RequestHeadersSpec<?> request) {
        return request.retrieve().onStatus(HttpStatus.NOT_FOUND::equals, (req, res) -> {
            throw new BusinessException(ErrorCode.CONVERSATION_NOT_FOUND);
        });
    }

    /** Timeouts, connection failures and any unmapped AI error all surface as the contract's ai_unavailable. */
    private <T> T callAi(Supplier<T> call) {
        try {
            return call.get();
        } catch (RestClientException exception) {
            log.warn("AI service call failed", exception);
            throw new BusinessException(ErrorCode.AI_UNAVAILABLE);
        }
    }
}
