package com.ai_pm.common.exception;

import com.ai_pm.common.web.ApiResponse;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException e) {
        log.warn("Business exception: code={}, message={}", e.getCode(), e.getMessage());
        return ResponseEntity.status(e.getHttpStatus())
                .body(ApiResponse.error(e.getCode(), e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .reduce((a, b) -> a + "; " + b)
                .orElse("Validation failed");
        return ResponseEntity.badRequest()
                .body(ApiResponse.error(40000, msg));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleConstraint(ConstraintViolationException e) {
        return ResponseEntity.badRequest()
                .body(ApiResponse.error(40000, e.getMessage()));
    }

    @ExceptionHandler(TenantContextMissingException.class)
    public ResponseEntity<ApiResponse<Void>> handleTenantMissing(TenantContextMissingException e) {
        log.error("TENANT CONTEXT MISSING: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(50001, "Tenant context is required but missing"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnknown(Exception e) {
        log.error("Unhandled exception", e);
        String detail = e.getClass().getSimpleName() + ": " +
            (e.getMessage() != null ? e.getMessage() : "(no message)");
        // Include root cause if present
        Throwable cause = e.getCause();
        while (cause != null && cause != e) {
            detail += " | Caused by: " + cause.getClass().getSimpleName() + ": " +
                (cause.getMessage() != null ? cause.getMessage() : "(no message)");
            cause = cause.getCause();
        }
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error(50000, detail));
    }
}
