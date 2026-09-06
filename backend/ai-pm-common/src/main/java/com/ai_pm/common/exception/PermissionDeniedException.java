package com.ai_pm.common.exception;

import com.ai_pm.common.exception.BusinessException;
import org.springframework.http.HttpStatus;

/**
 * Thrown when a user lacks required permission.
 * Results in HTTP 403 (or 404 for Issue Security violations).
 */
public class PermissionDeniedException extends BusinessException {

    public PermissionDeniedException(String permission, String resourceId) {
        super(40300, "Permission denied: " + permission + " on " + resourceId,
              HttpStatus.FORBIDDEN);
    }

    public PermissionDeniedException(String message) {
        super(40300, message, HttpStatus.FORBIDDEN);
    }
}
