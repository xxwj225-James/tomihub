package com.ai_pm.common.exception;

import org.springframework.http.HttpStatus;

/**
 * Thrown when an issue is not visible to the current user (due to Issue Security Level).
 * Returns HTTP 404 to avoid exposing the existence of confidential issues.
 */
public class IssueNotFoundException extends BusinessException {

    public IssueNotFoundException(String issueId) {
        super(40400, "Issue not found: " + issueId, HttpStatus.NOT_FOUND);
    }
}
