package com.ai_pm.auth.config;

import com.ai_pm.auth.service.JwtTokenProvider;
import com.ai_pm.common.context.TenantContextHolder;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Extracts JWT from Authorization header and sets request attributes + TenantContext.
 * Applies to non-public endpoints (/auth/select-tenant, /auth/refresh, /auth/logout).
 */
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain chain)
            throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            if (jwtProvider.validateToken(token)) {
                String userId = jwtProvider.getUserId(token);
                String tenantId = jwtProvider.getTenantId(token);

                request.setAttribute("userId", userId);
                request.setAttribute("tenantId", tenantId);
                TenantContextHolder.set(tenantId, userId);
            }
        }

        try {
            chain.doFilter(request, response);
        } finally {
            TenantContextHolder.clear();
        }
    }
}
