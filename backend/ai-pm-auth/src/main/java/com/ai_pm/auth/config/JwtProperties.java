package com.ai_pm.auth.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import java.time.Duration;

@Data
@Component
@ConfigurationProperties(prefix = "jwt")
public class JwtProperties {
    private String privateKey;
    private String publicKey;
    private Duration accessTokenTtl = Duration.ofMinutes(15);
    private Duration refreshTokenTtl = Duration.ofDays(1);
    private Duration rememberMeRefreshTtl = Duration.ofDays(7);
    private String issuer = "ai-pm";
}
