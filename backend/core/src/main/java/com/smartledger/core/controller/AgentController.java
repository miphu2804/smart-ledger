package com.smartledger.core.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.smartledger.core.billing.ChatQuotaService;
import com.smartledger.core.billing.ChatTurnPending;
import com.smartledger.core.dto.request.AgentChatRequest;
import com.smartledger.core.dto.request.AgentMemorySettingsRequest;
import com.smartledger.core.dto.request.AgentRenameRequest;
import com.smartledger.core.dto.response.AgentChatResponse;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AgentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/v1/agent")
@Tag(name = "Agent")
@SecurityRequirement(name = "bearerAuth")
public class AgentController {
    private final AgentService service;
    private final ObjectProvider<ChatQuotaService> quota;
    private final boolean quotaEnabled;

    public AgentController(AgentService service, ObjectProvider<ChatQuotaService> quota,
            @Value("${smartledger.ai-quota.enabled:false}") boolean quotaEnabled) {
        this.service = service;
        this.quota = quota; this.quotaEnabled = quotaEnabled;
    }

    @PostMapping("/chat")
    @Operation(summary = "Ask the shop assistant a question")
    @ApiResponse(responseCode = "200", description = "Saved answer; durable mode commits quota before delivery",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = AgentChatResponse.class)))
    @ApiResponse(responseCode = "202", description = "Durable turn pending; preserve key/input and retry after Retry-After",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = ChatTurnPending.Response.class)))
    @ApiResponse(responseCode = "429", description = "ai_quota_exhausted; Retry-After and details.nextAvailableAt",
            content = @Content(mediaType = "application/json"))
    public AgentChatResponse chat(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @Valid @RequestBody AgentChatRequest request,
            @io.swagger.v3.oas.annotations.Parameter(description = "Required when AI quota admission is enabled; preserve it for retries across JSON/SSE.")
            @RequestHeader(value = "Idempotency-Key", required = false) String key, HttpServletResponse response) {
        if (quotaEnabled || key != null) {
            response.setHeader("Cache-Control", "no-store");
            return quota().chat(token, shopId, request, key);
        }
        return service.chat(token, shopId, request);
    }

    /** No produces attribute: errors before the first event must still render as JSON. */
    @PostMapping("/chat/stream")
    @Operation(summary = "Ask the shop assistant and receive the answer as server-sent events")
    @ApiResponse(responseCode = "200", description = "SSE progress; durable done follows saved receipt and quota commit",
            content = @Content(mediaType = "text/event-stream"))
    @ApiResponse(responseCode = "202", description = "JSON before SSE headers; preserve key/input and retry after Retry-After",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = ChatTurnPending.Response.class)))
    @ApiResponse(responseCode = "429", description = "JSON before SSE headers; ai_quota_exhausted and Retry-After",
            content = @Content(mediaType = "application/json"))
    public ResponseEntity<StreamingResponseBody> chatStream(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @Valid @RequestBody AgentChatRequest request,
            @io.swagger.v3.oas.annotations.Parameter(description = "Required when AI quota admission is enabled; same logical key as JSON chat.")
            @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        if (quotaEnabled || key != null) {
            var stream = quota().stream(token, shopId, request, key);
            return ResponseEntity.ok().contentType(MediaType.TEXT_EVENT_STREAM).cacheControl(CacheControl.noStore())
                    .header("X-Accel-Buffering", "no").body(stream);
        }
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .cacheControl(CacheControl.noCache())
                .header("X-Accel-Buffering", "no")
                .body(service.chatStream(token, shopId, request));
    }

    private ChatQuotaService quota() {
        var service = quota.getIfAvailable();
        if (service == null) throw new BusinessException(ErrorCode.AI_QUOTA_UNAVAILABLE);
        return service;
    }

    @GetMapping("/conversations")
    @Operation(summary = "List the assistant conversations of the selected shop")
    public JsonNode list(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId) {
        return service.listConversations(token, shopId);
    }

    @GetMapping("/conversations/{conversationId}")
    @Operation(summary = "Get a conversation with its messages")
    public JsonNode getById(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable long conversationId) {
        return service.getConversation(token, shopId, conversationId);
    }

    @PatchMapping("/conversations/{conversationId}")
    @Operation(summary = "Rename a conversation")
    public JsonNode rename(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable long conversationId,
            @Valid @RequestBody AgentRenameRequest request) {
        return service.renameConversation(token, shopId, conversationId, request.title());
    }

    @GetMapping("/memory/settings")
    @Operation(summary = "Read whether the assistant's long-term memory is on for the owner")
    public JsonNode memorySettings(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId) {
        return service.getMemorySettings(token, shopId);
    }

    @PutMapping("/memory/settings")
    @Operation(summary = "Turn the assistant's long-term memory on or off for the owner")
    public JsonNode updateMemorySettings(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @Valid @RequestBody AgentMemorySettingsRequest request) {
        return service.setMemoryEnabled(token, shopId, request.memoryEnabled());
    }

    @GetMapping("/memory/items")
    @Operation(summary = "List the long-term memories the assistant keeps for the owner")
    public JsonNode memories(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId) {
        return service.listMemories(token, shopId);
    }

    @DeleteMapping("/memory/items/{memoryId}")
    @Operation(summary = "Forget one long-term memory and the older versions it replaced")
    public ResponseEntity<Void> deleteMemory(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable long memoryId) {
        service.deleteMemory(token, shopId, memoryId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/conversations/{conversationId}")
    @Operation(summary = "Delete a conversation and its history")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable long conversationId) {
        service.deleteConversation(token, shopId, conversationId);
        return ResponseEntity.noContent().build();
    }
}
