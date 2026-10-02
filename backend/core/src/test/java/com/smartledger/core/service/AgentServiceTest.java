package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withNoContent;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.smartledger.core.dto.request.AgentChatRequest;
import com.smartledger.core.dto.response.AgentChatResponse;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.AgentServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class AgentServiceTest {
    private static final String AI = "http://ai.test";
    private static final VerifiedFirebaseToken TOKEN = new VerifiedFirebaseToken("uid", null, false, null, null, null);

    private final ShopService shopService = mock(ShopService.class);
    private MockRestServiceServer ai;
    private AgentService service;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl(AI).defaultHeader("X-Internal-Token", "secret");
        ai = MockRestServiceServer.bindTo(builder).build();
        service = new AgentServiceImpl(shopService, builder.build());
        Shop shop = mock(Shop.class);
        when(shop.getId()).thenReturn(7L);
        when(shop.getOwnerId()).thenReturn(3L);
        when(shopService.requireOwnedActiveShop(any(), eq("7"))).thenReturn(shop);
        when(shopService.requireOwnedActiveShop(any(), eq("99")))
                .thenThrow(new BusinessException(ErrorCode.SHOP_ACCESS_DENIED));
    }

    @Test
    void chatTakesScopeFromVerifiedShopAndKeepsOnlyAppFacingFields() {
        ai.expect(requestTo(AI + "/internal/v1/agent/chat")).andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Token", "secret"))
                .andExpect(content().json("{\"user_id\":3,\"shop_id\":7,\"message\":\"hi\",\"conversation_id\":5}"))
                .andRespond(withSuccess("{\"conversation_id\":5,\"message_id\":9,\"answer\":\"ok\","
                        + "\"request_id\":\"r\",\"model\":\"m\",\"model_version\":\"v\"}", MediaType.APPLICATION_JSON));

        AgentChatResponse response = service.chat(TOKEN, "7", new AgentChatRequest(5L, "hi"));

        assertThat(response).isEqualTo(new AgentChatResponse(5, 9, "ok"));
        ai.verify();
    }

    @Test
    void shopTheOwnerDoesNotOwnNeverReachesAi() {
        assertThatThrownBy(() -> service.chat(TOKEN, "99", new AgentChatRequest(null, "hi")))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.SHOP_ACCESS_DENIED));
        ai.verify();
    }

    @Test
    void listAndGetSendScopeAsQuery() {
        ai.expect(requestTo(org.hamcrest.Matchers.startsWith(AI + "/internal/v1/agent/conversations?")))
                .andExpect(queryParam("user_id", "3")).andExpect(queryParam("shop_id", "7"))
                .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));
        ai.expect(requestTo(org.hamcrest.Matchers.startsWith(AI + "/internal/v1/agent/conversations/5?")))
                .andExpect(queryParam("user_id", "3")).andExpect(queryParam("shop_id", "7"))
                .andRespond(withSuccess("{\"conversation_id\":5}", MediaType.APPLICATION_JSON));

        assertThat(service.listConversations(TOKEN, "7").isArray()).isTrue();
        assertThat(service.getConversation(TOKEN, "7", 5L).get("conversation_id").asInt()).isEqualTo(5);
        ai.verify();
    }

    @Test
    void renameAndDeleteForwardToAi() {
        ai.expect(requestTo(AI + "/internal/v1/agent/conversations/5")).andExpect(method(HttpMethod.PATCH))
                .andExpect(content().json("{\"user_id\":3,\"shop_id\":7,\"title\":\"New\"}"))
                .andRespond(withSuccess("{\"conversation_id\":5,\"title\":\"New\"}", MediaType.APPLICATION_JSON));
        ai.expect(requestTo(org.hamcrest.Matchers.startsWith(AI + "/internal/v1/agent/conversations/5?")))
                .andExpect(method(HttpMethod.DELETE)).andRespond(withNoContent());

        assertThat(service.renameConversation(TOKEN, "7", 5L, "New").get("title").asText()).isEqualTo("New");
        service.deleteConversation(TOKEN, "7", 5L);
        ai.verify();
    }

    @Test
    void aiNotFoundBecomesConversationNotFound() {
        ai.expect(requestTo(org.hamcrest.Matchers.startsWith(AI + "/internal/v1/agent/conversations/5?")))
                .andRespond(withStatus(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"detail\":\"conversation_not_found\"}"));

        assertThatThrownBy(() -> service.getConversation(TOKEN, "7", 5L))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.CONVERSATION_NOT_FOUND));
    }

    @Test
    void aiFailureBecomesAiUnavailable() {
        ai.expect(requestTo(AI + "/internal/v1/agent/chat")).andRespond(withServerError());

        assertThatThrownBy(() -> service.chat(TOKEN, "7", new AgentChatRequest(null, "hi")))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.AI_UNAVAILABLE));
    }
}
