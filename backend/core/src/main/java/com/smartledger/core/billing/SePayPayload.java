package com.smartledger.core.billing;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.math.BigInteger;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.Locale;
import java.util.regex.Pattern;

/** Minimal normalized facts; free-form bank descriptions/balances are never persisted. */
record SePayPayload(String providerId, String bank, String account, String subAccount, String direction,
        long amount, OffsetDateTime bankTime, String code, String codeReason, String fingerprint) {
    private static final Pattern CODE = Pattern.compile("(?<![A-Za-z0-9])SLP[A-Z0-9]{12}(?![A-Za-z0-9])", Pattern.CASE_INSENSITIVE);
    private static final DateTimeFormatter BANK_TIME = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss").withResolverStyle(ResolverStyle.STRICT);

    static SePayPayload parse(BillingJson json, byte[] bytes) {
        try {
            JsonNode body = json.read(bytes);
            if (body == null || !body.isObject()) throw new SePayFailure(400);
            JsonNode rawId = body.path("id");
            if (!rawId.isIntegralNumber() && !rawId.isTextual()) throw new SePayFailure(400);
            String id = rawId.asText();
            if (!id.matches("[0-9]{1,64}") || new BigInteger(id).signum() <= 0) throw new SePayFailure(400);
            id = new BigInteger(id).toString();
            String bank = text(body, "gateway", 32, false).strip().toUpperCase(Locale.ROOT);
            String account = text(body, "accountNumber", 64, false).strip();
            String sub = text(body, "subAccount", 64, true).strip();
            if (bank.codePoints().anyMatch(Character::isISOControl) || account.codePoints().anyMatch(Character::isISOControl)
                    || sub.codePoints().anyMatch(Character::isISOControl)) throw new SePayFailure(400);
            String type = text(body, "transferType", 3, false).toUpperCase(Locale.ROOT);
            if (!type.equals("IN") && !type.equals("OUT")) throw new SePayFailure(400);
            JsonNode amountNode = body.path("transferAmount");
            if (!amountNode.isNumber()) throw new SePayFailure(400);
            long amount = amountNode.decimalValue().longValueExact();
            if (amount <= 0) throw new SePayFailure(400);
            String field = text(body, "code", 255, true).strip().toUpperCase(Locale.ROOT);
            String content = text(body, "content", 16000, true);
            var candidates = new ArrayList<String>();
            var matcher = CODE.matcher(content);
            while (matcher.find()) candidates.add(matcher.group().toUpperCase(Locale.ROOT));
            candidates.sort(String::compareTo);
            boolean validField = field.matches("SLP[A-Z0-9]{12}");
            String reason;
            String code = null;
            if (candidates.size() > 1 || (!field.isEmpty() && !candidates.isEmpty()
                    && (!validField || !field.equals(candidates.getFirst())))) reason = "AMBIGUOUS_CODE";
            else if (validField) { code = field; reason = "MATCHED"; }
            else if (field.isEmpty() && candidates.size() == 1) { code = candidates.getFirst(); reason = "MATCHED"; }
            else reason = field.isEmpty() ? "MISSING_CODE" : "UNKNOWN_CODE";
            OffsetDateTime bankTime = bankTime(text(body, "transactionDate", 64, true));
            String fingerprint = json.fingerprint(bank, account, sub, type, amount,
                    bankTime == null ? null : bankTime.toInstant().toString(), validField ? field : null, candidates, reason);
            return new SePayPayload(id, bank, account, sub.isEmpty() ? null : sub, type, amount, bankTime, code, reason, fingerprint);
        } catch (IOException | ArithmeticException | DateTimeParseException exception) {
            throw new SePayFailure(400);
        }
    }

    private static String text(JsonNode body, String field, int maximum, boolean optional) {
        JsonNode value = body.path(field);
        if (optional && (value.isMissingNode() || value.isNull())) return "";
        if (!value.isTextual() || value.textValue().length() > maximum
                || (!optional && value.textValue().isBlank())) throw new SePayFailure(400);
        return value.textValue();
    }
    private static OffsetDateTime bankTime(String value) {
        if (value.isBlank()) return null;
        try { return LocalDateTime.parse(value, BANK_TIME).atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toOffsetDateTime(); }
        catch (DateTimeParseException exception) { return OffsetDateTime.parse(value); }
    }
    @Override public String toString() { return "SePayPayload[financial facts redacted]"; }
}
