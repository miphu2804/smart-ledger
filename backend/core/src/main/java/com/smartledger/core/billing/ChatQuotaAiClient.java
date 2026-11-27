package com.smartledger.core.billing;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.dto.request.AgentChatRequest;
import com.smartledger.core.dto.response.AgentChatResponse;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** Bounded receipt replies and independent short receipt timeout; no provider diagnostics in exceptions/logs. */
@Component
public class ChatQuotaAiClient implements ChatQuotaTransport {
    private static final String PATH = "/internal/v1/agent";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_REPLY = 8 * 1024 * 1024;
    private final RestClient chat;
    private final RestClient receipts;
    public ChatQuotaAiClient(@Qualifier("aiRestClient") RestClient chat, @Qualifier("aiReceiptRestClient") RestClient receipts) {
        this.chat = chat; this.receipts = receipts;
    }
    @Override public int dispatch(ChatQuotaStore.Usage usage, AgentChatRequest input) {
        try { return chat.post().uri(PATH + "/chat").body(body(usage, input)).exchange((req, res) -> res.getStatusCode().value()); }
        catch (RestClientException exception) { throw ChatQuotaLedger.unavailable(); }
    }
    @Override public StreamReply stream(ChatQuotaStore.Usage usage, AgentChatRequest input) {
        try {
            return chat.post().uri(PATH + "/chat/stream").body(body(usage, input)).exchange((req, res) -> {
                int status = res.getStatusCode().value();
                MediaType type;
                try { type = res.getHeaders().getContentType(); }
                catch (IllegalArgumentException exception) { res.close(); throw ChatQuotaLedger.unavailable(); }
                if (status == 200 && type != null && type.isCompatibleWith(MediaType.TEXT_EVENT_STREAM))
                    return new StreamReply(status, new ResponseStream(res));
                res.close();
                return new StreamReply(status, null);
            }, false);
        } catch (RestClientException exception) { throw ChatQuotaLedger.unavailable(); }
    }
    @Override public Receipt read(ChatQuotaStore.Usage usage) {
        try {
            return receipts.get().uri(uri -> uri.path(PATH + "/turns/{id}")
                    .queryParam("user_id", usage.owner()).queryParam("shop_id", usage.shop()).build(usage.id()))
                    .exchange((req, res) -> receipt(res, usage.id(), true));
        } catch (RestClientException exception) { throw ChatQuotaLedger.unavailable(); }
    }
    @Override public Receipt cancel(ChatQuotaStore.Usage usage) {
        try {
            return receipts.post().uri(PATH + "/turns/{id}/cancel", usage.id()).body(Map.of(
                    "user_id", usage.owner(), "shop_id", usage.shop(), "execution_fence", usage.fence()))
                    .exchange((req, res) -> receipt(res, usage.id(), false));
        } catch (RestClientException exception) { throw ChatQuotaLedger.unavailable(); }
    }
    private static Map<String, Object> body(ChatQuotaStore.Usage usage, AgentChatRequest input) {
        Map<String, Object> body = new HashMap<>();
        body.put("turn_id", usage.id()); body.put("execution_fence", usage.fence());
        body.put("user_id", usage.owner()); body.put("shop_id", usage.shop()); body.put("message", input.message().strip());
        if (usage.conversation() != null) body.put("conversation_id", usage.conversation());
        return body;
    }
    private static Receipt receipt(ClientHttpResponse response, UUID id, boolean allowMissing) throws IOException {
        if (allowMissing && response.getStatusCode().value() == 404) return new Receipt(id, 0, "MISSING", false, null, null);
        if (response.getStatusCode().value() != 200) throw ChatQuotaLedger.unavailable();
        byte[] raw = response.getBody().readNBytes(MAX_REPLY + 1);
        if (raw.length > MAX_REPLY) throw ChatQuotaLedger.unavailable();
        try {
            JsonNode root = JSON.readTree(raw);
            if (root == null || !root.isObject() || !id.equals(UUID.fromString(root.path("turn_id").asText()))
                    || !root.path("execution_fence").isIntegralNumber() || !root.path("execution_fence").canConvertToLong()
                    || root.path("execution_fence").longValue() <= 0 || !root.path("resultAvailable").isBoolean())
                throw ChatQuotaLedger.unavailable();
            String state = root.path("state").asText();
            if (!Set.of("IN_PROGRESS", "SUCCEEDED", "FAILED", "CANCELLED").contains(state)) throw ChatQuotaLedger.unavailable();
            boolean available = root.path("resultAvailable").booleanValue();
            AgentChatResponse result = null;
            String failure = null;
            if (state.equals("SUCCEEDED")) {
                if (!root.path("failure_code").isNull()) throw ChatQuotaLedger.unavailable();
                if (available) {
                    JsonNode body = root.path("result");
                    if (!id.toString().equals(body.path("request_id").asText()) || !positive(body.path("conversation_id"))
                            || !positive(body.path("message_id")) || !body.path("answer").isTextual()) throw ChatQuotaLedger.unavailable();
                    result = JSON.treeToValue(body, AgentChatResponse.class);
                } else if (!root.path("result").isNull()) throw ChatQuotaLedger.unavailable();
            } else {
                if (available || !root.path("result").isNull()) throw ChatQuotaLedger.unavailable();
                if (!state.equals("IN_PROGRESS")) {
                    failure = root.path("failure_code").asText();
                    if (failure.isBlank() || failure.length() > 64) throw ChatQuotaLedger.unavailable();
                } else if (!root.path("failure_code").isNull()) throw ChatQuotaLedger.unavailable();
            }
            return new Receipt(id, root.path("execution_fence").longValue(), state, available, result, failure);
        } catch (IOException | IllegalArgumentException exception) { throw ChatQuotaLedger.unavailable(); }
    }
    private static boolean positive(JsonNode value) { return value.isIntegralNumber() && value.canConvertToLong() && value.longValue() > 0; }
    private record ResponseStream(ClientHttpResponse response) implements Upstream {
        @Override public java.io.InputStream body() throws IOException { return response.getBody(); }
        @Override public void close() { response.close(); }
    }
}
