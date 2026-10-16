package com.smartledger.core.config;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.net.URI;
import java.util.Base64;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Feature-gated credentials: disabled deployments require neither new secrets nor the new schema. */
@ConfigurationProperties(prefix = "zalo")
public class ZaloProperties {
    private boolean enabled;
    private String appId;
    private String appSecret;
    private String callbackUrl;
    private List<String> clientOrigins = List.of();
    private String sessionEncryptionKey;
    private int sessionTtlSeconds = 300;
    private int proofTtlSeconds = 90;
    private int httpTimeoutSeconds = 10;

    public void requireEnabled() {
        if (!enabled || appId == null || !appId.matches("[0-9]{1,30}") || !safeSecret(appSecret)
                || !validHttps(callbackUrl, true) || clientOrigins == null || clientOrigins.isEmpty()
                || clientOrigins.size() > 20 || clientOrigins.stream().anyMatch(value -> !validHttps(value, false))
                || sessionTtlSeconds < 60 || sessionTtlSeconds > 600 || proofTtlSeconds < 15
                || proofTtlSeconds > 90 || proofTtlSeconds > sessionTtlSeconds
                || httpTimeoutSeconds < 1 || httpTimeoutSeconds > 30 || !validEncryptionKey()) {
            throw new BusinessException(ErrorCode.ZALO_UNAVAILABLE);
        }
    }

    private static boolean safeSecret(String value) {
        return value != null && !value.isBlank() && value.length() <= 1000
                && value.chars().allMatch(character -> character >= 33 && character <= 126);
    }

    private boolean validEncryptionKey() {
        try {
            return sessionEncryptionKey != null && sessionEncryptionKey.length() <= 64
                    && Base64.getDecoder().decode(sessionEncryptionKey).length == 32;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static boolean validHttps(String value, boolean callback) {
        if (value == null || value.length() > 2000 || value.contains("*")) {
            return false;
        }
        try {
            URI uri = URI.create(value);
            return "https".equals(uri.getScheme()) && uri.getHost() != null && uri.getUserInfo() == null
                    && uri.getRawQuery() == null && uri.getRawFragment() == null
                    && uri.getPort() >= -1 && uri.getPort() <= 65535
                    && (callback ? "/api/v1/auth/zalo/callback".equals(uri.getRawPath())
                            : uri.getRawPath() == null || uri.getRawPath().isEmpty());
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getAppId() { return appId; }
    public void setAppId(String appId) { this.appId = appId; }
    public String getAppSecret() { return appSecret; }
    public void setAppSecret(String appSecret) { this.appSecret = appSecret; }
    public String getCallbackUrl() { return callbackUrl; }
    public void setCallbackUrl(String callbackUrl) { this.callbackUrl = callbackUrl; }
    public List<String> getClientOrigins() { return clientOrigins; }
    public void setClientOrigins(List<String> clientOrigins) { this.clientOrigins = clientOrigins; }
    public String getSessionEncryptionKey() { return sessionEncryptionKey; }
    public void setSessionEncryptionKey(String sessionEncryptionKey) { this.sessionEncryptionKey = sessionEncryptionKey; }
    public int getSessionTtlSeconds() { return sessionTtlSeconds; }
    public void setSessionTtlSeconds(int sessionTtlSeconds) { this.sessionTtlSeconds = sessionTtlSeconds; }
    public int getProofTtlSeconds() { return proofTtlSeconds; }
    public void setProofTtlSeconds(int proofTtlSeconds) { this.proofTtlSeconds = proofTtlSeconds; }
    public int getHttpTimeoutSeconds() { return httpTimeoutSeconds; }
    public void setHttpTimeoutSeconds(int httpTimeoutSeconds) { this.httpTimeoutSeconds = httpTimeoutSeconds; }
}
