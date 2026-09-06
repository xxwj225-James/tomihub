package com.ai_pm.common.web;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Value;

/**
 * Uniform API response envelope.
 *
 * Deliberately a Lombok @Value class, NOT a Java record: ProGuard 7.4.2
 * strips the RecordComponents attribute when obfuscating, and Jackson
 * serializes records through that attribute — every response came out as
 * "{}" in hardened builds. Plain getters serialize fine under obfuscation.
 */
@Value
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {
    int code;
    String message;
    T data;

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(0, "ok", data);
    }

    public static <T> ApiResponse<T> success(String message, T data) {
        return new ApiResponse<>(0, message, data);
    }

    public static <T> ApiResponse<T> error(int code, String message) {
        return new ApiResponse<>(code, message, null);
    }

    public static <T> ApiResponse<T> of(int code, String message, T data) {
        return new ApiResponse<>(code, message, data);
    }
}
