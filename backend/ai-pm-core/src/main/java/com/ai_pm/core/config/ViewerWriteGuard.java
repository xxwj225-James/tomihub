package com.ai_pm.core.config;

import com.ai_pm.common.context.TenantContextHolder;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Blocks write operations (POST/PUT/PATCH/DELETE) for users with viewer role.
 * Read-only guest/demo users can only browse — they cannot create, update, or delete.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ViewerWriteGuard implements HandlerInterceptor {

    private final JdbcTemplate jdbc;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) throws Exception {
        // Only intercept write methods
        String method = request.getMethod().toUpperCase();
        if (!method.equals("POST") && !method.equals("PUT") &&
            !method.equals("PATCH") && !method.equals("DELETE")) {
            return true;
        }

        // Get user ID and tenant ID from context (set by JWT filter)
        String userId = TenantContextHolder.getUserId();
        if (userId == null) return true; // No user context — allow (other guards handle it)

        // Get project ID from request path
        String path = request.getRequestURI();
        String projectId = extractProjectId(path);
        String tenantId = TenantContextHolder.getTenantId();

        // Check if user is a viewer in this project
        boolean isViewer = false;
        try {
            // First check project-level role
            if (projectId != null) {
                Integer count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM project_members WHERE project_id = ? AND user_id = ? AND role = 'viewer'",
                    Integer.class, projectId, userId);
                isViewer = count != null && count > 0;
            }
            // Also check tenant-level role
            if (!isViewer && tenantId != null) {
                Integer count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM tenant_members WHERE tenant_id = ? AND user_id = ? AND role = 'viewer'",
                    Integer.class, tenantId, userId);
                isViewer = count != null && count > 0;
            }
        } catch (Exception ignored) {
            // DB query failed — allow the request (fail open)
        }

        if (isViewer) {
            response.setStatus(403);
            response.setContentType("application/json");
            String message = isDemoUser(userId)
                ? "You are using the demo account. Demo users have read-only access — please register to create or modify data."
                : "Read-only access. Please register to create or modify data.";
            response.getWriter().write(
                "{\"code\":403,\"message\":\"" + message + "\"}");
            return false;
        }

        return true;
    }

    /** Detect the shared demo guest account (demo@tomihub.demo). */
    private boolean isDemoUser(String userId) {
        try {
            String email = jdbc.queryForObject(
                "SELECT email FROM users WHERE id = ?", String.class, userId);
            return email != null && email.endsWith("@tomihub.demo");
        } catch (Exception ignored) {
            return false;
        }
    }

    /** Extract project ID from URL paths like /api/v1/projects/{id}/... */
    private String extractProjectId(String path) {
        if (path == null) return null;
        // Patterns: /api/v1/projects/{projectId}/issues, /api/v1/projects/{id}/wiki, etc.
        if (path.contains("/projects/")) {
            String[] parts = path.split("/projects/");
            if (parts.length > 1) {
                String rest = parts[1];
                int slashIdx = rest.indexOf('/');
                return slashIdx > 0 ? rest.substring(0, slashIdx) : rest;
            }
        }
        return null;
    }
}
