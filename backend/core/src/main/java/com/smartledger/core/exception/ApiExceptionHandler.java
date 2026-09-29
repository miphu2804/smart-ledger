package com.smartledger.core.exception;

import jakarta.servlet.http.HttpServletRequest;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

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

    @ExceptionHandler(MissingRequestHeaderException.class)
    ResponseEntity<ApiErrorResponse> handleMissingHeader(
            MissingRequestHeaderException exception, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "missing_required_header", "A required header is missing.",
                List.of(new ApiErrorDetail(exception.getHeaderName(), "is required")), request);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ApiErrorResponse> handleDataIntegrity(
            DataIntegrityViolationException exception, HttpServletRequest request) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof org.hibernate.exception.ConstraintViolationException violation
                    && "uq_products_shop_barcode".equalsIgnoreCase(violation.getConstraintName())) {
                return error(HttpStatus.CONFLICT, "product_barcode_conflict",
                        "Barcode already belongs to a product in this shop.", List.of(), request);
            }
            if (cause instanceof SQLException sqlException && "23505".equals(sqlException.getSQLState())
                    && sqlException.getMessage() != null
                    && sqlException.getMessage().contains("uq_products_shop_barcode")) {
                return error(HttpStatus.CONFLICT, "product_barcode_conflict",
                        "Barcode already belongs to a product in this shop.", List.of(), request);
            }
        }
        log.error("Unmapped database constraint violation", exception);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error", "Unexpected server error.",
                List.of(), request);
    }

    @ExceptionHandler(PessimisticLockingFailureException.class)
    ResponseEntity<ApiErrorResponse> handleLockFailure(
            PessimisticLockingFailureException exception, HttpServletRequest request) {
        log.warn("Database lock could not be acquired", exception);
        return error(HttpStatus.SERVICE_UNAVAILABLE, "resource_busy", "Please retry this request.",
                List.of(), request);
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
