package com.ai_pm.auth.config;

import com.ai_pm.auth.service.JwtTokenProvider;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AuthServiceConfig {

    @Bean
    public FilterRegistrationBean<JwtAuthFilter> jwtAuthFilterRegistration(
            JwtTokenProvider jwtProvider) {
        FilterRegistrationBean<JwtAuthFilter> reg = new FilterRegistrationBean<>();
        reg.setFilter(new JwtAuthFilter(jwtProvider));
        reg.addUrlPatterns(
            "/api/v1/auth/select-tenant",
            "/api/v1/auth/refresh",
            "/api/v1/auth/logout",
            "/api/v1/auth/profile",
            "/api/v1/invites",
            "/api/v1/invites/batch"
        );
        reg.setOrder(1);
        return reg;
    }
}
