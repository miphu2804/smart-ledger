package com.smartledger.core.exception;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record ApiErrorResponse(
        String code,
        String message,
        List<ApiErrorDetail> details,
        String traceId) {
}
