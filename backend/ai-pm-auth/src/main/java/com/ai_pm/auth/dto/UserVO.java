package com.ai_pm.auth.dto;

import com.ai_pm.auth.entity.User;

public record UserVO(
    String id,
    String email,
    String displayName,
    String avatarUrl,
    boolean emailVerified,
    String jobTitle,
    String skills,
    String gender,
    String aiLanguage,
    String uiLanguage,
    boolean onboardingCompleted,
    boolean invited
) {
    public static UserVO from(User user) {
        return new UserVO(
            user.getId(),
            user.getEmail(),
            user.getDisplayName(),
            user.getAvatarUrl(),
            Boolean.TRUE.equals(user.getEmailVerified()),
            user.getJobTitle(),
            user.getSkills(),
            user.getGender(),
            user.getAiLanguage(),
            user.getUiLanguage(),
            Boolean.TRUE.equals(user.getOnboardingCompleted()),
            Boolean.TRUE.equals(user.getInvited())
        );
    }
}
