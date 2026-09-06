package com.ai_pm.core.service;

import com.ai_pm.common.context.TenantContextHolder;
import com.ai_pm.common.exception.PermissionDeniedException;
import com.ai_pm.common.security.RequirePermission;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Set;

/**
 * AOP aspect that enforces @RequirePermission annotations.
 *
 * Execution order:
 *   1. Extract userId/tenantId from ThreadLocal
 *   2. Resolve projectId from method args
 *   3. Check project-level permissions (2nd tier)
 *   4. Check issue security level (3rd tier, if requested)
 *   5. Audit log for dangerous operations
 */
@Aspect
@Component
@Order(1)
@Slf4j
@RequiredArgsConstructor
public class PermissionAspect {

    private final PermissionEvaluator permissionEvaluator;

    @Around("@annotation(requirePermission)")
    public Object enforce(ProceedingJoinPoint pjp,
                           RequirePermission requirePermission) throws Throwable {

        String userId = TenantContextHolder.getUserId();
        String tenantId = TenantContextHolder.getTenantId();

        if (userId == null || tenantId == null) {
            throw new PermissionDeniedException("No authentication context");
        }

        // Resolve project context from method args
        String projectId = ProjectContextResolver.resolveFromArgs(pjp.getArgs());

        // ─── 2nd Tier: Project Permission ───
        boolean granted = false;

        if (!requirePermission.value().isEmpty()) {
            granted = permissionEvaluator.hasPermission(
                userId, tenantId, projectId, requirePermission.value());
        }

        if (!granted && requirePermission.anyOf().length > 0) {
            granted = Arrays.stream(requirePermission.anyOf())
                .anyMatch(perm -> permissionEvaluator.hasPermission(
                    userId, tenantId, projectId, perm));
        }

        if (requirePermission.allOf().length > 0) {
            granted = Arrays.stream(requirePermission.allOf())
                .allMatch(perm -> permissionEvaluator.hasPermission(
                    userId, tenantId, projectId, perm));
        }

        if (!granted) {
            String required = requirePermission.value().isEmpty()
                ? Arrays.toString(requirePermission.anyOf())
                : requirePermission.value();

            log.warn("PERMISSION DENIED: user={} tenant={} project={} required={}",
                     userId, tenantId, projectId, required);
            throw new PermissionDeniedException(required, projectId);
        }

        // ─── 3rd Tier: Issue Security Level ───
        if (requirePermission.checkSecurityLevel()) {
            String issueId = ProjectContextResolver.resolveIssueId(pjp.getArgs());
            if (issueId != null) {
                permissionEvaluator.enforceIssueSecurity(userId, tenantId, issueId);
            }
        }

        return pjp.proceed();
    }
}
