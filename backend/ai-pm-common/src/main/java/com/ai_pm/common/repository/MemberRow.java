package com.ai_pm.common.repository;

/**
 * Projection row from tenant_members JOIN users query.
 */
public record MemberRow(String id, String display_name, String email, String role, String status) {}
