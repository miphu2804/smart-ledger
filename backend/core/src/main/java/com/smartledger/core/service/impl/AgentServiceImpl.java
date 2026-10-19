package com.smartledger.core.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.dto.request.AgentChatRequest;
import com.smartledger.core.dto.response.AgentChatResponse;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AgentService;
import com.smartledger.core.service.ShopService;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import org.springframework.web.util.UriBuilder;

@Service
public class AgentServiceImpl implements AgentService {
    private static final Logger log = LoggerFactory.getLogger(AgentServiceImpl.class);
    private static final String AGENT_PATH = "/internal/v1/agent";
    private static final String CONVERSATION_PATH = AGENT_PATH + "/conversations/{id}";
    private static final String MEMORY_SETTINGS_PATH = AGENT_PATH + "/memory/settings";
    private static final String MEMORY_ITEMS_PATH = AGENT_PATH + "/memory/items";
    private static final ObjectMapper JSON = new ObjectMapper();
    /** A turn the AI's guardrails stop answers 422 with one of these codes (api-contracts.md section 6). */
    private static final Map<String, ErrorCode> GUARDRAIL_CODES = Map.of(
            "input_too_long", ErrorCode.AGENT_INPUT_TOO_LONG,
            "answer_unavailable", ErrorCode.AGENT_ANSWER_UNAVAILABLE,
            "answer_timeout", ErrorCode.AGENT_ANSWER_TIMEOUT);

    private final ShopService shopService;
    private final RestClient aiClient;

    public AgentServiceImpl(ShopService shopService, RestClient aiRestClient) {
        this.shopService = shopService;
        this.aiClient = aiRestClient;
    }

    @Override
    public AgentChatResponse chat(VerifiedFirebaseToken token, String shopId, AgentChatRequest request) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        return callAi(() -> send(aiClient.post().uri(AGENT_PATH + "/chat").body(chatBody(shop, request)))
                .body(AgentChatResponse.class));
    }

    @Override
    public StreamingResponseBody chatStream(VerifiedFirebaseToken token, String shopId, AgentChatRequest request) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        ClientHttpResponse stream = callAi(() -> aiClient.post().uri(AGENT_PATH + "/chat/stream")
                .body(chatBody(shop, request))
                .exchange((req, res) -> openStream(res), false));
        return out -> relay(stream, out);
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
    public JsonNode getMemorySettings(VerifiedFirebaseToken token, String shopId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        return callAi(() -> send(aiClient.get()
                .uri(uri -> scoped(uri.path(MEMORY_SETTINGS_PATH), shop).build()))
                .body(JsonNode.class));
    }

    @Override
    public JsonNode setMemoryEnabled(VerifiedFirebaseToken token, String shopId, boolean enabled) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        Map<String, Object> body = scopedBody(shop);
        body.put("memory_enabled", enabled);
        return callAi(() -> send(aiClient.put().uri(MEMORY_SETTINGS_PATH).body(body)).body(JsonNode.class));
    }

    @Override
    public void deleteConversation(VerifiedFirebaseToken token, String shopId, long conversationId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        callAi(() -> send(aiClient.delete()
                .uri(uri -> scoped(uri.path(CONVERSATION_PATH), shop).build(conversationId)))
                .toBodilessEntity());
    }

    @Override
    public JsonNode listMemories(VerifiedFirebaseToken token, String shopId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        return callAi(() -> send(aiClient.get()
                .uri(uri -> scoped(uri.path(MEMORY_ITEMS_PATH), shop).build()))
                .body(JsonNode.class));
    }

    @Override
    public void deleteMemory(VerifiedFirebaseToken token, String shopId, long memoryId) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        callAi(() -> send(aiClient.delete()
                .uri(uri -> scoped(uri.path(MEMORY_ITEMS_PATH + "/{id}"), shop).build(memoryId)))
                .toBodilessEntity());
    }

    private Map<String, Object> chatBody(Shop shop, AgentChatRequest request) {
        Map<String, Object> body = scopedBody(shop);
        body.put("message", request.message());
        if (request.conversationId() != null) {
            body.put("conversation_id", request.conversationId());
        }
        return body;
    }

    /** Failures before the first event map like chat(); a 2xx response stays open for relay(). */
    private ClientHttpResponse openStream(ClientHttpResponse response) throws IOException {
        if (response.getStatusCode().is2xxSuccessful()) {
            return response;
        }
        try (response) {
            throw aiError(response.getStatusCode(), response.getBody());
        }
    }

    private static boolean isMappedAiError(HttpStatusCode status) {
        return status.isSameCodeAs(HttpStatus.NOT_FOUND) || status.isSameCodeAs(HttpStatus.UNPROCESSABLE_ENTITY);
    }

    /** AI 404 → conversation_not_found, a guardrail 422 keeps its code, anything else → ai_unavailable. */
    private static BusinessException aiError(HttpStatusCode status, InputStream body) {
        if (status.isSameCodeAs(HttpStatus.NOT_FOUND)) {
            return new BusinessException(ErrorCode.CONVERSATION_NOT_FOUND);
        }
        if (status.isSameCodeAs(HttpStatus.UNPROCESSABLE_ENTITY)) {
            try {
                ErrorCode code = GUARDRAIL_CODES.get(JSON.readTree(body).path("detail").asText());
                if (code != null) {
                    return new BusinessException(code);
                }
            } catch (IOException exception) {
                // An unreadable body is an unmapped AI error, like any other below.
            }
        }
        log.warn("AI service answered {}", status);
        return new BusinessException(ErrorCode.AI_UNAVAILABLE);
    }

    /**
     * Copies the AI's server-sent events to the app one event at a time. The done event is narrowed to the
     * app-facing AgentChatResponse fields, as in chat(). When the app disconnects the write fails, which closes the
     * AI stream so the AI service cancels the turn.
     */
    private void relay(ClientHttpResponse stream, OutputStream out) throws IOException {
        try (stream; BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream.getBody(), StandardCharsets.UTF_8))) {
            Writer writer = new OutputStreamWriter(out, StandardCharsets.UTF_8);
            String event = null;
            for (String line = reader.readLine(); line != null; line = reader.readLine()) {
                if (line.startsWith("event:")) {
                    event = line.substring("event:".length()).trim();
                } else if ("done".equals(event) && line.startsWith("data:")) {
                    AgentChatResponse done = JSON.readValue(line.substring("data:".length()), AgentChatResponse.class);
                    line = "data: " + JSON.writeValueAsString(done);
                }
                writer.write(line);
                writer.write('\n');
                if (line.isEmpty()) {
                    writer.flush();
                    event = null;
                }
            }
            writer.flush();
        }
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
        return request.retrieve().onStatus(AgentServiceImpl::isMappedAiError, (req, res) -> {
            throw aiError(res.getStatusCode(), res.getBody());
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
