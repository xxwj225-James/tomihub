package com.ai_pm.core.config;

import com.ai_pm.common.context.TenantContextHolder;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Sets PostgreSQL session variable app.current_tenant_id for RLS policies.
 * Runs before every API request so RLS policies can filter by tenant.
 */
@Component
@RequiredArgsConstructor
public class RlsInterceptor implements HandlerInterceptor {

    private final JdbcTemplate jdbc;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String tenantId = TenantContextHolder.getTenantId();
        if (tenantId != null && !tenantId.isBlank()) {
            try {
                jdbc.execute("SET app.current_tenant_id = '" + tenantId.replace("'", "''") + "'");
            } catch (Exception ignored) {
                // RLS is best-effort — don't break requests if setting fails
            }
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                 Object handler, Exception ex) {
        try {
            jdbc.execute("RESET app.current_tenant_id");
        } catch (Exception ignored) {}
    }
}
