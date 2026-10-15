package com.smartledger.core.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.config.SecurityConfiguration;
import com.smartledger.core.dto.response.AgentChatResponse;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.ApiExceptionHandler;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.exception.RestAuthenticationEntryPoint;
import com.smartledger.core.security.BearerTokenAuthenticationFilter;
import com.smartledger.core.security.FirebaseTokenVerifier;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AgentService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@WebMvcTest(controllers = AgentController.class)
@Import({SecurityConfiguration.class, BearerTokenAuthenticationFilter.class,
        RestAuthenticationEntryPoint.class, ApiExceptionHandler.class})
class AgentControllerWebTest {
    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private FirebaseTokenVerifier tokenVerifier;

    @MockitoBean
    private AgentService agentService;

    @BeforeEach
    void validToken() {
        when(tokenVerifier.verify("valid-token"))
                .thenReturn(new VerifiedFirebaseToken("uid", null, false, null, null, null));
    }

    @Test
    void chatReadsSnakeCaseBodyAndAnswersInSnakeCase() throws Exception {
        when(agentService.chat(any(), eq("7"), any())).thenReturn(new AgentChatResponse(5, 9, "ok"));
        mvc.perform(post("/api/v1/agent/chat").header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"conversation_id\":5,\"message\":\"hi\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.conversation_id").value(5))
                .andExpect(jsonPath("$.message_id").value(9))
                .andExpect(jsonPath("$.answer").value("ok"));
    }

    @Test
    void blankMessageIsRejected() throws Exception {
        mvc.perform(post("/api/v1/agent/chat").header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"  \"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void chatRequiresAuthentication() throws Exception {
        mvc.perform(post("/api/v1/agent/chat").header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"hi\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aiUnavailableIs503() throws Exception {
        when(agentService.chat(any(), eq("7"), any())).thenThrow(new BusinessException(ErrorCode.AI_UNAVAILABLE));
        mvc.perform(post("/api/v1/agent/chat").header("Authorization", "Bearer valid-token").header("X-Shop-Id", "7")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"hi\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("ai_unavailable"));
    }

    @Test
    void chatStreamAnswersAsServerSentEvents() throws Exception {
        StreamingResponseBody body = out -> out.write("event: delta\ndata: {\"text\":\"ok\"}\n\n".getBytes());
        when(agentService.chatStream(any(), eq("7"), any())).thenReturn(body);
        MvcResult started = mvc.perform(post("/api/v1/agent/chat/stream").header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7").contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"hi\"}"))
                .andExpect(request().asyncStarted())
                .andReturn();
        mvc.perform(asyncDispatch(started))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM))
                .andExpect(content().string("event: delta\ndata: {\"text\":\"ok\"}\n\n"));
    }

    @Test
    void chatStreamFailureBeforeTheFirstEventIsJson() throws Exception {
        when(agentService.chatStream(any(), eq("7"), any()))
                .thenThrow(new BusinessException(ErrorCode.CONVERSATION_NOT_FOUND));
        mvc.perform(post("/api/v1/agent/chat/stream").header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"conversation_id\":5,\"message\":\"hi\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("conversation_not_found"));
    }

    @Test
    void chatStreamFailureIsJsonForTheAppsAcceptHeader() throws Exception {
        // The app asks for SSE and JSON; JSON alone cannot answer an SSE-only Accept.
        when(agentService.chatStream(any(), eq("7"), any()))
                .thenThrow(new BusinessException(ErrorCode.AGENT_INPUT_TOO_LONG));
        mvc.perform(post("/api/v1/agent/chat/stream").header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7").contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.TEXT_EVENT_STREAM, MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"hi\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("input_too_long"));
    }

    @Test
    void memorySettingsAreReadAndWrittenInSnakeCase() throws Exception {
        when(agentService.getMemorySettings(any(), eq("7"))).thenReturn(settings(true));
        when(agentService.setMemoryEnabled(any(), eq("7"), eq(false))).thenReturn(settings(false));

        mvc.perform(get("/api/v1/agent/memory/settings").header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.memory_enabled").value(true))
                .andExpect(jsonPath("$.available").value(true));
        mvc.perform(put("/api/v1/agent/memory/settings").header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"memory_enabled\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.memory_enabled").value(false));
    }

    @Test
    void memorySettingsRejectAMissingFlag() throws Exception {
        mvc.perform(put("/api/v1/agent/memory/settings").header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
    }

    private static com.fasterxml.jackson.databind.JsonNode settings(boolean enabled) {
        return new ObjectMapper().createObjectNode().put("memory_enabled", enabled).put("available", true);
    }

    @Test
    void deleteReturnsNoContent() throws Exception {
        mvc.perform(delete("/api/v1/agent/conversations/5").header("Authorization", "Bearer valid-token")
                        .header("X-Shop-Id", "7"))
                .andExpect(status().isNoContent());
    }
}
