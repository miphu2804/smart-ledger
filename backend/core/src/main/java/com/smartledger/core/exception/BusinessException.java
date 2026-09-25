package com.smartledger.core.exception;

import com.smartledger.core.enums.ErrorCode;
import java.util.List;
import lombok.Getter;

@Getter
public class BusinessException extends RuntimeException {

    private final ErrorCode errorCode;
    private final List<ApiErrorDetail> details;

    public BusinessException(ErrorCode errorCode) {
        this(errorCode, List.of());
    }

    public BusinessException(ErrorCode errorCode, List<ApiErrorDetail> details) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
        this.details = List.copyOf(details);
    }
}
