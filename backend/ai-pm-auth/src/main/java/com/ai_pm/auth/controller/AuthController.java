package com.ai_pm.auth.controller;

import com.ai_pm.auth.dto.*;
import com.ai_pm.auth.service.AuthService;
import com.ai_pm.auth.service.EmailService;
import com.ai_pm.auth.service.TokenService;
import com.ai_pm.auth.service.VerificationCodeService;
import com.ai_pm.common.web.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Validated
public class AuthController {

    private final AuthService authService;
    private final TokenService tokenService;
    private final VerificationCodeService codeService;
    private final EmailService emailService;

    @PostMapping("/send-code")
    public ApiResponse<Map<String, String>> sendCode(@Valid @RequestBody AuthRequest.SendCode req) {
        String code = codeService.generateCode();
        codeService.storeCode(req.email(), code, req.purpose());

        // Try to send real email; fail silently (dev fallback handles it)
        try { emailService.sendVerificationCode(req.email(), code, req.purpose()); } catch (Exception ignored) {}

        Map<String, String> data = new HashMap<>();
        data.put("dev_code", code);
        return ApiResponse.success("Code sent. Valid for 5 minutes", data);
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<AuthResponse> register(@Valid @RequestBody AuthRequest.Register req) {
        return ApiResponse.success("Registration successful", authService.register(req));
    }

    @PostMapping("/login")
    public ApiResponse<AuthResponse> login(@Valid @RequestBody AuthRequest.Login req,
                                            HttpServletRequest httpReq) {
        String ip = getClientIp(httpReq);
        String userAgent = httpReq.getHeader("User-Agent");
        return ApiResponse.success("Login successful", authService.login(req, ip, userAgent));
    }

    @PostMapping("/select-tenant")
    public ApiResponse<AuthResponse> selectTenant(
            @Valid @RequestBody AuthRequest.SelectTenant req,
            HttpServletRequest httpReq) {
        String userId = (String) httpReq.getAttribute("userId");
        if (userId == null) throw new IllegalStateException("Not authenticated");
        return ApiResponse.success("Workspace selected", authService.selectTenant(userId, req.tenantId()));
    }

    @PostMapping("/refresh")
    public ApiResponse<TokenPair> refresh(@Valid @RequestBody AuthRequest.RefreshToken req) {
        return ApiResponse.success(tokenService.refreshTokens(req.refreshToken()));
    }

    @PostMapping("/logout")
    public ApiResponse<Void> logout(HttpServletRequest httpReq,
                                     @RequestBody(required = false) AuthRequest.RefreshToken req) {
        String userId = (String) httpReq.getAttribute("userId");
        if (userId == null) throw new IllegalStateException("Not authenticated");
        authService.logout(userId, req != null ? req.refreshToken() : null);
        return ApiResponse.success("Logged out", null);
    }

    @PostMapping("/guest-login")
    public ApiResponse<AuthResponse> guestLogin() {
        return ApiResponse.success("Demo mode — read-only access", authService.guestLogin());
    }

    @PutMapping("/profile")
    public ApiResponse<UserVO> updateProfile(@RequestBody UpdateProfileRequest req,
                                             HttpServletRequest httpReq) {
        String userId = (String) httpReq.getAttribute("userId");
        if (userId == null) throw new IllegalStateException("Not authenticated");
        return ApiResponse.success(authService.updateProfile(userId, req));
    }

    private String getClientIp(HttpServletRequest req) {
        String xf = req.getHeader("X-Forwarded-For");
        String ip = (xf != null) ? xf.split(",")[0].trim() : req.getRemoteAddr();
        return ip.length() > 45 ? ip.substring(0, 45) : ip;
    }
}
