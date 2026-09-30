package com.smartledger.core.service.impl;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.ApiErrorDetail;
import com.smartledger.core.exception.BusinessException;
import java.util.List;

final class BusinessIdParser {
    private BusinessIdParser() {
    }

    static Long parse(String value, String field, ErrorCode errorCode) {
        try {
            long id = Long.parseLong(value);
            if (id > 0) {
                return id;
            }
        } catch (NumberFormatException ignored) {
            // Return the same public validation error for all invalid identifiers.
        }
        throw new BusinessException(errorCode,
                List.of(new ApiErrorDetail(field, "must be a positive integer")));
    }
}
