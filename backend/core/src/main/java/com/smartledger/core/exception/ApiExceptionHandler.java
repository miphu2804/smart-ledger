package com.smartledger.core.exception;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

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
