package com.smartledger.core.billing;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Independent creation/receipt gates; blank private configuration is safe while disabled. */
@ConfigurationProperties("billing")
public record BillingProperties(boolean enabled, boolean webhookEnabled, String integrationKey,
        String webhookSecret, String recipientBankCode, String recipientAccountNumber, String recipientAccountName) {
    public boolean webhookReady() {
        return webhookEnabled && integrationKey != null && integrationKey.matches("[A-Za-z0-9_-]{1,64}")
                && webhookSecret != null && webhookSecret.length() >= 32 && webhookSecret.length() <= 512;
    }

    public void requireCreationReady() {
        if (!enabled || !webhookReady() || recipientBankCode == null || !recipientBankCode.matches("[A-Za-z0-9]{2,32}")
                || recipientAccountNumber == null || !recipientAccountNumber.matches("[A-Za-z0-9-]{1,64}")
                || recipientAccountName == null || recipientAccountName.isBlank() || recipientAccountName.length() > 255
                || recipientAccountName.codePoints().anyMatch(Character::isISOControl)) {
            throw new BusinessException(ErrorCode.BILLING_UNAVAILABLE);
        }
    }

    @Override public String toString() { return "BillingProperties[private configuration redacted]"; }
}
