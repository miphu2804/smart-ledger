package com.smartledger.core.billing;

import com.smartledger.core.dto.request.AgentChatRequest;
import com.smartledger.core.dto.response.AgentChatResponse;
import java.io.InputStream;
import java.util.UUID;

/** Authenticated AI protocol seam; every call is outside Core database transactions. */
public interface ChatQuotaTransport {
    record Receipt(UUID id, long fence, String state, boolean resultAvailable, AgentChatResponse result, String failure) {
        public boolean terminal() { return state.equals("SUCCEEDED") || state.equals("FAILED") || state.equals("CANCELLED"); }
    }
    interface Upstream extends AutoCloseable {
        InputStream body() throws java.io.IOException;
        void close();
    }
    record StreamReply(int status, Upstream stream) {}
    int dispatch(ChatQuotaStore.Usage usage, AgentChatRequest input);
    StreamReply stream(ChatQuotaStore.Usage usage, AgentChatRequest input);
    Receipt read(ChatQuotaStore.Usage usage);
    Receipt cancel(ChatQuotaStore.Usage usage);
}
