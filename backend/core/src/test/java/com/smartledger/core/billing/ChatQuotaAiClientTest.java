package com.smartledger.core.billing;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import com.smartledger.core.dto.request.AgentChatRequest;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class ChatQuotaAiClientTest {
    private static final String BASE = "http://ai.test/internal/v1/agent";
    private static final UUID ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private MockRestServiceServer chat;
    private MockRestServiceServer receipts;
    private ChatQuotaAiClient client;
    private ChatQuotaStore.Usage usage;

    @BeforeEach void setup() {
        var a = RestClient.builder().baseUrl("http://ai.test").defaultHeader("X-Internal-Token", "local-dummy");
        var b = RestClient.builder().baseUrl("http://ai.test").defaultHeader("X-Internal-Token", "local-dummy");
        chat = MockRestServiceServer.bindTo(a).build(); receipts = MockRestServiceServer.bindTo(b).build();
        client = new ChatQuotaAiClient(a.build(), b.build());
        var now = OffsetDateTime.parse("2027-01-31T00:00:00Z");
        usage = new ChatQuotaStore.Usage(ID, 3, 7, "hash", 5L, UUID.randomUUID(), "RESERVED", 2, UUID.randomUUID(), now, now.plusSeconds(90), null);
    }

    @Test void dispatchSendsOnlyTrustedExecutionAndScopeAndDoesNotTrustItsSuccessBody() {
        chat.expect(requestTo(BASE + "/chat")).andExpect(method(HttpMethod.POST)).andExpect(header("X-Internal-Token", "local-dummy"))
                .andExpect(content().json("""
                        {"turn_id":"11111111-1111-4111-8111-111111111111","execution_fence":2,
                         "user_id":3,"shop_id":7,"conversation_id":5,"message":"question"}
                        """))
                .andRespond(withSuccess("{\"answer\":\"not evidence\"}", MediaType.APPLICATION_JSON));
        assertThat(client.dispatch(usage, new AgentChatRequest(5L, " question "))).isEqualTo(200);
        chat.verify(); receipts.verify();
    }

    @Test void scopedReceiptAndCancelValidateIdentityAndNarrowTheSavedResult() {
        receipts.expect(requestTo(org.hamcrest.Matchers.startsWith(BASE + "/turns/" + ID + "?")))
                .andExpect(queryParam("user_id", "3")).andExpect(queryParam("shop_id", "7"))
                .andExpect(header("X-Internal-Token", "local-dummy"))
                .andRespond(withSuccess(success(ID), MediaType.APPLICATION_JSON));
        var receipt = client.read(usage);
        assertThat(receipt.state()).isEqualTo("SUCCEEDED"); assertThat(receipt.result().answer()).isEqualTo("saved");
        receipts.verify(); receipts.reset();
        receipts.expect(requestTo(BASE + "/turns/" + ID + "/cancel")).andExpect(method(HttpMethod.POST))
                .andExpect(content().json("{\"user_id\":3,\"shop_id\":7,\"execution_fence\":2}"))
                .andRespond(withSuccess(success(ID), MediaType.APPLICATION_JSON));
        assertThat(client.cancel(usage).result()).isEqualTo(receipt.result()); receipts.verify();
    }

    @Test void wrongTurnMalformedProofAndPrivateProviderFailuresFailClosed() {
        for (String response : new String[]{success(UUID.randomUUID()), success(ID).replace("\"resultAvailable\":true", "\"resultAvailable\":false"),
                success(ID).replace("\"request_id\":\"" + ID, "\"request_id\":\"wrong"), "{}"}) {
            receipts.expect(anything()).andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
            unavailable(() -> client.read(usage));
            receipts.verify(); receipts.reset();
        }
        receipts.expect(anything()).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE).body("private provider diagnostics"));
        unavailable(() -> client.read(usage)); receipts.verify();
    }

    @Test void receiptMissingIsDifferentFromDefinitiveCancellationAndNeverMeansFailureByItself() {
        receipts.expect(anything()).andRespond(withStatus(HttpStatus.NOT_FOUND));
        assertThat(client.read(usage).state()).isEqualTo("MISSING");
        receipts.verify(); receipts.reset();
        receipts.expect(anything()).andRespond(withStatus(HttpStatus.NOT_FOUND));
        unavailable(() -> client.cancel(usage)); receipts.verify();
    }

    @Test void pendingOrJsonResponsesNeverBecomeAnOpenedSseSuccess() {
        chat.expect(anything()).andRespond(withStatus(HttpStatus.ACCEPTED).contentType(MediaType.APPLICATION_JSON).body("{}"));
        var pending = client.stream(usage, new AgentChatRequest(5L, "q"));
        assertThat(pending.status()).isEqualTo(202); assertThat(pending.stream()).isNull();
        chat.verify(); chat.reset();
        chat.expect(anything()).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        assertThat(client.stream(usage, new AgentChatRequest(5L, "q")).stream()).isNull();
        chat.verify();
        chat.reset();
        chat.expect(anything()).andRespond(withStatus(HttpStatus.OK).header("Content-Type", "invalid"));
        unavailable(() -> client.stream(usage, new AgentChatRequest(5L, "q")));
        chat.verify();
    }

    private static String success(UUID id) {
        return """
                {"turn_id":"%s","execution_fence":1,"state":"SUCCEEDED","resultAvailable":true,"failure_code":null,
                 "result":{"conversation_id":5,"message_id":9,"request_id":"%s","answer":"saved","model":"private","model_version":"v"}}
                """.formatted(id, id);
    }
    private static void unavailable(Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class,
                exception -> assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.AI_QUOTA_UNAVAILABLE))
                .hasMessageNotContaining("private");
    }
}
