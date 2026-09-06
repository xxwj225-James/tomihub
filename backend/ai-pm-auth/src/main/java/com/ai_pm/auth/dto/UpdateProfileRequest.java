package com.ai_pm.auth.dto;

/**
 * Fields are all optional — only non-null values are updated.
 */
public record UpdateProfileRequest(
    String displayName,
    String jobTitle,
    String skills,
    String gender,
    String aiLanguage,
    String uiLanguage,
    Boolean onboardingCompleted
) {}
