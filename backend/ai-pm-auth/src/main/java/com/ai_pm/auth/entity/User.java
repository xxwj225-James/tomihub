package com.ai_pm.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("users")
public class User {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String email;
    private String passwordHash;
    private String displayName;
    private String avatarUrl;
    private String jobTitle;       // PM, Developer, QA, Designer, etc.
    private String skills;         // comma-separated: Java, React, Docker, etc.
    private String gender;         // Male | Female | PreferNot
    private String aiLanguage;     // AI output language: en | zh | ja
    private String uiLanguage;     // UI language: en | zh | ja (sidebar switcher persists to DB)
    private Boolean onboardingCompleted; // true after Setup Wizard
    private Boolean invited;           // true if registered via invite code
    private Boolean emailVerified;
    private String status;           // active | disabled | suspended
    private Integer failedLoginAttempts;
    private Instant lockedUntil;
    private Instant lastLoginAt;
    private String lastLoginIp;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;
}
