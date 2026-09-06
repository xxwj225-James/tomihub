package com.ai_pm.common.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class BusinessException extends RuntimeException {

    private final int code;
    private final HttpStatus httpStatus;

    public BusinessException(int code, String message) {
        this(code, message, HttpStatus.BAD_REQUEST);
    }

    public BusinessException(int code, String message, HttpStatus httpStatus) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
    }
}
