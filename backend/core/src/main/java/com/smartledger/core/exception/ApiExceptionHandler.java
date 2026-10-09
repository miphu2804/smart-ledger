package com.smartledger.core.exception;

import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException;
import com.smartledger.core.dto.request.ProductPatchRequest;
import com.smartledger.core.enums.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.SQLException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);
    private static final Map<String, ErrorCode> UNIQUE_CONSTRAINTS = Map.of(
            "uq_products_shop_barcode", ErrorCode.PRODUCT_BARCODE_CONFLICT,
            "uq_auth_identities_provider_subject", ErrorCode.AUTH_SESSION_CONFLICT,
            "uq_auth_identities_user_id", ErrorCode.AUTH_SESSION_CONFLICT);

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
        if (exception.getMostSpecificCause() instanceof UnrecognizedPropertyException unknown
                && unknown.getReferringClass() == ProductPatchRequest.class
                && "stockQuantity".equals(unknown.getPropertyName())) {
            return error(HttpStatus.BAD_REQUEST, "invalid_request",
                    "stockQuantity cannot be patched; use the stock-in endpoint.",
                    List.of(new ApiErrorDetail("stockQuantity", "is not accepted in product PATCH")), request);
        }
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

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ApiErrorResponse> handleTypeMismatch(
            MethodArgumentTypeMismatchException exception, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "validation_failed", "The request contains invalid parameters.",
                List.of(new ApiErrorDetail(exception.getName(), "has an invalid value")), request);
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ApiErrorResponse> handleMaxUploadSizeExceeded(
            MaxUploadSizeExceededException exception, HttpServletRequest request) {
        ErrorCode errorCode = ErrorCode.IMAGE_TOO_LARGE;
        return error(errorCode.getHttpStatus(), errorCode.getCode(), errorCode.getMessage(), List.of(), request);
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    ResponseEntity<ApiErrorResponse> handleMissingMultipartPart(
            MissingServletRequestPartException exception, HttpServletRequest request) {
        if ("image".equals(exception.getRequestPartName())) {
            ErrorCode errorCode = ErrorCode.IMAGE_REQUIRED;
            return error(errorCode.getHttpStatus(), errorCode.getCode(), errorCode.getMessage(),
                    List.of(new ApiErrorDetail("image", "is required")), request);
        }
        return error(HttpStatus.BAD_REQUEST, "invalid_request", "The request is missing a required part.",
                List.of(new ApiErrorDetail(exception.getRequestPartName(), "is required")), request);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ApiErrorResponse> handleDataIntegrity(
            DataIntegrityViolationException exception, HttpServletRequest request) {
        ErrorCode errorCode = mappedConstraint(exception);
        if (errorCode != null) {
            return error(errorCode.getHttpStatus(), errorCode.getCode(), errorCode.getMessage(), List.of(), request);
        }
        log.error("Unmapped database constraint violation", exception);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error", "Unexpected server error.",
                List.of(), request);
    }

    /** Two concurrent writes can both pass an application-level check; the unique constraint is the real
     * guard, so its name tells which retryable business conflict happened. Anything else stays a 500. */
    private ErrorCode mappedConstraint(Throwable exception) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof org.hibernate.exception.ConstraintViolationException violation
                    && violation.getConstraintName() != null) {
                ErrorCode errorCode = UNIQUE_CONSTRAINTS.get(violation.getConstraintName().toLowerCase(Locale.ROOT));
                if (errorCode != null) {
                    return errorCode;
                }
            }
            if (cause instanceof SQLException sqlException && "23505".equals(sqlException.getSQLState())
                    && sqlException.getMessage() != null) {
                for (Map.Entry<String, ErrorCode> entry : UNIQUE_CONSTRAINTS.entrySet()) {
                    if (sqlException.getMessage().contains("\"" + entry.getKey() + "\"")) {
                        return entry.getValue();
                    }
                }
            }
        }
        return null;
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
