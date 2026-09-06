package com.ai_pm.core.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {

    private final RlsInterceptor rlsInterceptor;
    private final ViewerWriteGuard viewerWriteGuard;
    private final DemoQuotaInterceptor demoQuotaInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(viewerWriteGuard)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/v1/auth/**", "/ws/**", "/actuator/**");
        registry.addInterceptor(demoQuotaInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/v1/auth/**", "/ws/**", "/actuator/**");
        registry.addInterceptor(rlsInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/ws/**", "/actuator/**");
        registry.addInterceptor(new RateLimitInterceptor())
                .addPathPatterns("/api/**")
                .excludePathPatterns("/ws/**", "/actuator/**");  // skip WS + health
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
