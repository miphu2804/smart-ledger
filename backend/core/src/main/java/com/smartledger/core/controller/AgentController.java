package com.smartledger.core.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.smartledger.core.dto.request.AgentChatRequest;
import com.smartledger.core.dto.request.AgentMemorySettingsRequest;
import com.smartledger.core.dto.request.AgentRenameRequest;
import com.smartledger.core.dto.response.AgentChatResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AgentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
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

    public AgentController(AgentService service) {
        this.service = service;
    }

    @PostMapping("/chat")
    @Operation(summary = "Ask the shop assistant a question")
    public AgentChatResponse chat(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @Valid @RequestBody AgentChatRequest request) {
        return service.chat(token, shopId, request);
    }

    /** No produces attribute: errors before the first event must still render as JSON. */
    @PostMapping("/chat/stream")
    @Operation(summary = "Ask the shop assistant and receive the answer as server-sent events")
    public ResponseEntity<StreamingResponseBody> chatStream(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @Valid @RequestBody AgentChatRequest request) {
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .cacheControl(CacheControl.noCache())
                .header("X-Accel-Buffering", "no")
                .body(service.chatStream(token, shopId, request));
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
