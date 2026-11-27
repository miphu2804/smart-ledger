package com.smartledger.core.billing;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HexFormat;
import org.springframework.stereotype.Component;

/** Local strict JSON reader; leaves the behavior of existing Core endpoints unchanged. */
@Component
public class BillingJson {
    private final ObjectMapper mapper;
    public BillingJson(ObjectMapper mapper) {
        this.mapper = mapper.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);
    }
    JsonNode read(byte[] body) throws IOException { return mapper.readTree(body); }
    String write(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (IOException exception) { throw new BusinessException(ErrorCode.BILLING_UNAVAILABLE); }
    }
    BillingPaymentResponse snapshot(String value) {
        try { return mapper.readValue(value, BillingPaymentResponse.class); }
        catch (IOException exception) { throw new BusinessException(ErrorCode.BILLING_UNAVAILABLE); }
    }
    String fingerprint(Object... values) { return sha256(write(Arrays.asList(values)).getBytes(StandardCharsets.UTF_8)); }
    static String sha256(byte[] value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
}
