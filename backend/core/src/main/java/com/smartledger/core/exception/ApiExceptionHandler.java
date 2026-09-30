package com.smartledger.core.exception;

import com.smartledger.core.enums.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final String PRODUCT_BARCODE_CONSTRAINT = "uq_products_shop_barcode";

    @ExceptionHandler(BusinessException.class)
    ResponseEntity<ApiErrorResponse> handleBusinessException(
            BusinessException exception,
            HttpServletRequest request) {
        return error(
                exception.getErrorCode().getHttpStatus(),
                exception.getErrorCode().getCode(),
                exception.getMessage(),
                exception.getDetails(),
                request);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ApiErrorResponse> handleDataIntegrityViolation(
            DataIntegrityViolationException exception,
            HttpServletRequest request) {
        if (mentionsConstraint(exception, PRODUCT_BARCODE_CONSTRAINT)) {
            ErrorCode errorCode = ErrorCode.PRODUCT_BARCODE_CONFLICT;
            return error(errorCode.getHttpStatus(), errorCode.getCode(), errorCode.getMessage(), List.of(), request);
        }
        return error(
                HttpStatus.CONFLICT,
                "data_conflict",
                "The request conflicts with existing data.",
                List.of(),
                request);
    }

    /** Two concurrent writes can both pass an application-level uniqueness check; the database constraint
     * is the real guard, so its name (not the entity/service) tells us which business rule was violated. */
    private boolean mentionsConstraint(Throwable exception, String constraintName) {
        for (Throwable current = exception; current != null; current = current.getCause()) {
            if (current.getMessage() != null && current.getMessage().contains(constraintName)) {
                return true;
            }
        }
        return false;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiErrorResponse> handleInvalidRequest(
            MethodArgumentNotValidException exception,
            HttpServletRequest request) {
        List<ApiErrorDetail> details = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new ApiErrorDetail(error.getField(), error.getDefaultMessage()))
                .toList();
        return error(
                HttpStatus.BAD_REQUEST,
                "validation_failed",
                "The request contains invalid fields.",
                details,
                request);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiErrorResponse> handleUnreadableRequest(
            HttpMessageNotReadableException exception,
            HttpServletRequest request) {
        return error(
                HttpStatus.BAD_REQUEST,
                "invalid_request",
                "The request body must be valid JSON.",
                List.of(),
                request);
    }

    private ResponseEntity<ApiErrorResponse> error(
            HttpStatus status,
            String code,
            String message,
            List<ApiErrorDetail> details,
            HttpServletRequest request) {
        return ResponseEntity.status(status).body(new ApiErrorResponse(
                code,
                message,
                details,
                traceId(request)));
    }

    private String traceId(HttpServletRequest request) {
        String requestTraceId = request.getHeader("X-Trace-Id");
        return StringUtils.hasText(requestTraceId) ? requestTraceId : UUID.randomUUID().toString();
    }
}
