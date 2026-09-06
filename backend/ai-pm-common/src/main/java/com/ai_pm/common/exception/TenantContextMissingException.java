package com.ai_pm.common.exception;

/**
 * Thrown when a repository method is called without an active tenant context.
 * This is a critical programming error that must be fixed immediately.
 */
public class TenantContextMissingException extends RuntimeException {

    public TenantContextMissingException(String message) {
        super(message);
    }
}
