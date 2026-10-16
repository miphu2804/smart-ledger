package com.smartledger.core.config;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.net.URI;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** One explicit Android client/return target per deployment. Public IDs are not credentials. */
@ConfigurationProperties(prefix = "zalo.native")
public class ZaloNativeProperties {
    public static final String RETURN_PATH = "/mobile/auth/zalo/complete";
    private boolean enabled;
    private String clientId;
    private String returnTargetId;
    private String returnUrl;
    private String packageName = "vn.teamhexa.songheloi";
    private List<String> certificateSha256 = List.of();
    private int handoffTtlSeconds = 90;

    public void requireClient(String requestedClient, String callbackUrl) {
        if (!enabled) throw new BusinessException(ErrorCode.ZALO_UNAVAILABLE);
        requireAssociation(callbackUrl);
        if (!clientId.equals(requestedClient)) throw new BusinessException(ErrorCode.INVALID_ZALO_REQUEST);
    }

    public void requireAssociation(String callbackUrl) {
        if (!identifier(clientId) || !identifier(returnTargetId) || !validTarget(callbackUrl)
                || packageName == null || !packageName.matches("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+")
                || packageName.length() > 255 || certificateSha256 == null || certificateSha256.isEmpty()
                || certificateSha256.size() > 10 || certificateSha256.stream().anyMatch(value ->
                    value == null || !value.matches("(?:[A-F0-9]{2}:){31}[A-F0-9]{2}"))
                || handoffTtlSeconds < 15 || handoffTtlSeconds > 90) {
            throw new BusinessException(ErrorCode.ZALO_UNAVAILABLE);
        }
    }

    private boolean validTarget(String callbackUrl) {
        try {
            if (returnUrl == null || returnUrl.length() > 2000 || callbackUrl == null) return false;
            URI target = URI.create(returnUrl);
            URI callback = URI.create(callbackUrl);
            return "https".equals(target.getScheme()) && "https".equals(callback.getScheme())
                    && target.getHost() != null && target.getHost().equals(callback.getHost())
                    && target.getPort() == callback.getPort() && target.getUserInfo() == null
                    && callback.getUserInfo() == null && RETURN_PATH.equals(target.getRawPath())
                    && "/api/v1/auth/zalo/callback".equals(callback.getRawPath())
                    && target.getRawQuery() == null && target.getRawFragment() == null
                    && callback.getRawQuery() == null && callback.getRawFragment() == null;
        } catch (IllegalArgumentException failure) {
            return false;
        }
    }

    public static boolean identifier(String value) { return value != null && value.matches("[A-Za-z0-9_-]{1,100}"); }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }
    public String getReturnTargetId() { return returnTargetId; }
    public void setReturnTargetId(String returnTargetId) { this.returnTargetId = returnTargetId; }
    public String getReturnUrl() { return returnUrl; }
    public void setReturnUrl(String returnUrl) { this.returnUrl = returnUrl; }
    public String getPackageName() { return packageName; }
    public void setPackageName(String packageName) { this.packageName = packageName; }
    public List<String> getCertificateSha256() { return certificateSha256; }
    public void setCertificateSha256(List<String> certificateSha256) { this.certificateSha256 = certificateSha256; }
    public int getHandoffTtlSeconds() { return handoffTtlSeconds; }
    public void setHandoffTtlSeconds(int handoffTtlSeconds) { this.handoffTtlSeconds = handoffTtlSeconds; }
}
