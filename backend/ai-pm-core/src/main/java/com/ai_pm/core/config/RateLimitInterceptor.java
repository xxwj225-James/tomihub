package com.ai_pm.core.config;

import com.ai_pm.common.web.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Simple in-memory rate limiter. Per-IP: max 120 requests per minute.
 * Production should use Redis-backed rate limiting.
 */
public class RateLimitInterceptor implements HandlerInterceptor {

    private static final int MAX_REQUESTS_PER_MINUTE = 120;
    private final Map<String, Window> store = new ConcurrentHashMap<>();
    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) throws Exception {
        String ip = getClientIp(request);
        String key = ip;

        long now = System.currentTimeMillis();
        Window window = store.computeIfAbsent(key, k -> new Window(now));
        synchronized (window) {
            if (now - window.start > 60_000) {
                window.start = now;
                window.count.set(1);
                return true;
            }
            if (window.count.incrementAndGet() > MAX_REQUESTS_PER_MINUTE) {
                response.setStatus(429);
                response.setContentType("application/json");
                response.getWriter().write(mapper.writeValueAsString(
                    ApiResponse.error(429, "Too many requests. Please try again later.")));
                return false;
            }
        }
        return true;
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isBlank()) ip = request.getHeader("X-Real-IP");
        if (ip == null || ip.isBlank()) ip = request.getRemoteAddr();
        return ip != null ? ip.split(",")[0].trim() : "unknown";
    }

    private static class Window {
        long start;
        AtomicInteger count = new AtomicInteger(0);
        Window(long start) { this.start = start; }
    }
}
