package com.ai_pm.core.config;

import com.ai_pm.common.context.TenantContextHolder;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.nio.charset.StandardCharsets;

/**
 * Per-IP usage quota for the shared live-demo workspace. In the demo tenant,
 * a visitor (identified by IP) may create at most {@code demo.issues-limit-per-ip}
 * issues total, so the shared demo data size stays bounded and one visitor
 * cannot flood it. Only active when the current tenant is the demo workspace —
 * every other tenant passes through untouched (zero overhead).
 *
 * <p>Config: {@code DEMO_ISSUES_LIMIT_PER_IP} env (default 50). The counter
 * lives in Redis ({@code demo:issues:{ip}}) and is cleared by the daily reset
 * script. The demo tenant id comes from {@code DEMO_TENANT_ID} env when set,
 * otherwise resolved once from the {@code demo-workspace} slug.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DemoQuotaInterceptor implements HandlerInterceptor {

    private final StringRedisTemplate redis;
    private final JdbcTemplate jdbc;
    private final Environment environment;

    @Value("${demo.issues-limit-per-ip:50}")
    private int issuesLimitPerIp;

    /** Cached demo tenant id; null-caching so non-demo installs never re-query. */
    private volatile boolean resolved = false;
    private volatile String demoTenantId;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) throws Exception {
        String method = request.getMethod().toUpperCase();
        if (!method.equals("POST")) return true;

        // Only the issue-creation endpoint: POST /api/v1/issues (create carries
        // projectId in the body; all other /api/v1/issues/* POSTs are actions).
        if (!"/api/v1/issues".equals(request.getRequestURI())) return true;

        String tenantId = TenantContextHolder.getTenantId();
        if (tenantId == null) return true;
        String demoId = resolveDemoTenantId();
        if (!tenantId.equals(demoId)) return true;

        // The demo operator (tenant owner/admin) manages the demo workspace and
        // is not a visitor — their email is not @tomihub.demo, so the ai-brain
        // quota already skips them; mirror that here so issue creation isn't
        // capped either when the operator tests the demo.
        String userId = TenantContextHolder.getUserId();
        if (userId != null) {
            try {
                String role = jdbc.queryForObject(
                    "SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?",
                    String.class, demoId, userId);
                if ("owner".equals(role) || "admin".equals(role)) return true;
            } catch (Exception ignored) { /* not a tenant member — treat as visitor */ }
        }

        String ip = clientIp(request);
        String key = "demo:issues:" + ip;
        Long count = redis.opsForValue().increment(key);
        if (count != null && count > issuesLimitPerIp) {
            log.info("Demo issue quota exceeded: ip={}, count={}, limit={}", ip, count, issuesLimitPerIp);
            response.setStatus(429);
            response.setContentType("application/json");
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(
                "{\"code\":\"quota_exhausted\",\"quota\":\"issues\",\"message\":\"Demo quota exhausted. Apply for a trial to deploy your own instance.\"}");
            return false;
        }
        return true;
    }

    private String resolveDemoTenantId() {
        if (resolved) return demoTenantId;
        synchronized (this) {
            if (resolved) return demoTenantId;
            String id = null;
            String env = environment.getProperty("DEMO_TENANT_ID");
            if (env != null && !env.isBlank()) {
                id = env.trim();
            } else {
                try {
                    id = jdbc.queryForObject(
                        "SELECT id FROM tenants WHERE slug = 'demo-workspace' LIMIT 1", String.class);
                } catch (Exception ignored) {
                    // demo tenant absent — not a demo install
                }
            }
            demoTenantId = id;
            resolved = true;
            return id;
        }
    }

    /** Client IP: X-Real-IP (set by nginx) → X-Forwarded-For first hop → remote addr. */
    private String clientIp(HttpServletRequest request) {
        String real = request.getHeader("X-Real-IP");
        if (real != null && !real.isBlank()) return real.trim();
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",")[0].trim();
        return request.getRemoteAddr();
    }
}
