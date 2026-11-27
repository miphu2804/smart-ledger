package com.smartledger.core.billing;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.dto.request.AgentChatRequest;
import com.smartledger.core.dto.response.AgentChatResponse;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ShopService;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/** End-to-end quota orchestration. Only authenticated durable terminal receipts decide debit/release. */
@Service
public class ChatQuotaService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> PROGRESS = Set.of("delta", "reset", "memory", "tool_start", "tool_end");
    private final ShopService shops;
    private final ChatQuotaLedger ledger;
    private final ChatQuotaTransport ai;
    public ChatQuotaService(ShopService shops, ChatQuotaLedger ledger, ChatQuotaTransport ai) {
        this.shops = shops; this.ledger = ledger; this.ai = ai;
    }
    public AgentChatResponse chat(VerifiedFirebaseToken token, String shop, AgentChatRequest input, String key) {
        var admission = ledger.admit(token, shops.requireOwnedActiveShop(token, shop), input, key);
        var usage = admission.usage();
        terminalFailure(usage);
        boolean cancel = false;
        if (admission.fresh()) {
            try { cancel = ai.dispatch(usage, input) != 202; }
            catch (BusinessException exception) { cancel = true; }
        }
        return resolve(usage, cancel);
    }
    public StreamingResponseBody stream(VerifiedFirebaseToken token, String shop, AgentChatRequest input, String key) {
        var admission = ledger.admit(token, shops.requireOwnedActiveShop(token, shop), input, key);
        var usage = admission.usage();
        terminalFailure(usage);
        if (!admission.fresh()) {
            var result = resolve(usage, false);
            return out -> done(out, result);
        }
        ChatQuotaTransport.StreamReply reply;
        try { reply = ai.stream(usage, input); }
        catch (BusinessException exception) {
            var result = resolve(usage, true);
            return out -> done(out, result);
        }
        if (reply.stream() == null) {
            var result = resolve(usage, reply.status() != 202);
            return out -> done(out, result);
        }
        return out -> relay(usage, reply.stream(), out);
    }

    /** Recovery never dispatches/re-generates. A 404 or pending receipt requires a durable tombstone first. */
    void recover(ChatQuotaStore.Usage usage) {
        try { resolve(usage, true); }
        catch (BusinessException | ChatTurnPending exception) { /* terminal failure or retained pending work */ }
    }

    private AgentChatResponse resolve(ChatQuotaStore.Usage usage, boolean cancelPending) {
        terminalFailure(usage);
        ChatQuotaTransport.Receipt receipt;
        try { receipt = ai.read(usage); }
        catch (BusinessException exception) {
            if (!cancelPending || !usage.pending()) throw ChatQuotaLedger.unavailable();
            receipt = ai.cancel(usage);
        }
        if (!receipt.terminal() && cancelPending && usage.pending()) receipt = ai.cancel(usage);
        if (!receipt.terminal()) {
            if (usage.state().equals("SUCCEEDED")) throw ChatQuotaLedger.unavailable();
            throw new ChatTurnPending(usage.id());
        }
        ErrorCode failure = receipt.state().equals("SUCCEEDED") ? null : failure(receipt.failure());
        if (!ledger.finish(usage, receipt.state(), failure == null ? null : failure.getCode())) throw new ChatTurnPending(usage.id());
        if (failure != null) throw new BusinessException(failure);
        if (!receipt.resultAvailable()) throw new BusinessException(ErrorCode.AI_TURN_RESULT_REMOVED);
        return receipt.result();
    }
    private static void terminalFailure(ChatQuotaStore.Usage usage) {
        if (usage.state().equals("FAILED") || usage.state().equals("CANCELLED")) throw new BusinessException(failure(usage.failure()));
    }
    private static ErrorCode failure(String code) {
        if (code == null) return ErrorCode.AI_QUOTA_UNAVAILABLE;
        return switch (code) {
            case "input_too_long" -> ErrorCode.AGENT_INPUT_TOO_LONG;
            case "answer_unavailable" -> ErrorCode.AGENT_ANSWER_UNAVAILABLE;
            case "answer_timeout" -> ErrorCode.AGENT_ANSWER_TIMEOUT;
            case "conversation_not_found" -> ErrorCode.CONVERSATION_NOT_FOUND;
            case "ai_turn_cancelled" -> ErrorCode.AI_TURN_CANCELLED;
            default -> ErrorCode.AI_QUOTA_UNAVAILABLE;
        };
    }

    private void relay(ChatQuotaStore.Usage usage, ChatQuotaTransport.Upstream upstream, OutputStream out) throws IOException {
        try (upstream; var reader = new BufferedReader(new InputStreamReader(upstream.body(), StandardCharsets.UTF_8))) {
            int total = 0;
            for (String frame = frame(reader); frame != null; frame = frame(reader)) {
                total = Math.addExact(total, frame.length());
                if (total > 16 * 1024 * 1024) throw ChatQuotaLedger.unavailable();
                String event = null;
                for (String line : frame.split("\n")) if (line.startsWith("event:")) event = line.substring(6).strip();
                if ("done".equals(event)) { done(out, resolve(usage, true)); return; }
                if ("error".equals(event)) break;
                if (event != null && PROGRESS.contains(event)) { out.write(frame.getBytes(StandardCharsets.UTF_8)); out.flush(); }
            }
        } catch (IOException exception) {
            upstream.close();
            recover(usage);
            throw exception;
        } catch (BusinessException | ChatTurnPending exception) {
            upstream.close();
            try { done(out, resolve(usage, true)); }
            catch (BusinessException | ChatTurnPending failure) { error(out, failure); }
            return;
        }
        try { done(out, resolve(usage, true)); }
        catch (BusinessException | ChatTurnPending failure) { error(out, failure); }
    }
    private static String frame(BufferedReader reader) throws IOException {
        StringBuilder result = new StringBuilder();
        int previous = 0;
        for (int value = reader.read(); value >= 0; value = reader.read()) {
            if (value == '\r') continue;
            result.append((char) value);
            if (result.length() > 2 * 1024 * 1024) throw ChatQuotaLedger.unavailable();
            if (value == '\n' && previous == '\n') return result.toString();
            previous = value;
        }
        return result.isEmpty() ? null : result.toString();
    }
    private static void done(OutputStream out, AgentChatResponse result) throws IOException {
        out.write(("event: done\ndata: " + JSON.writeValueAsString(result) + "\n\n").getBytes(StandardCharsets.UTF_8)); out.flush();
    }
    private static void error(OutputStream out, RuntimeException exception) throws IOException {
        String code = exception instanceof BusinessException failure ? failure.getErrorCode().getCode() : "ai_quota_unavailable";
        out.write(("event: error\ndata: " + JSON.writeValueAsString(Map.of("detail", code)) + "\n\n").getBytes(StandardCharsets.UTF_8)); out.flush();
    }
}
