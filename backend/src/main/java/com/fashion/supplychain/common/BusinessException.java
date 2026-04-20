package com.fashion.supplychain.common;

import java.io.Serial;

/**
 * 业务异常类（统一版本）
 * 用于处理业务逻辑中的异常情况
 * <p>
 * 支持 int code 和 String errorCode 两种错误码格式，
 * GlobalExceptionHandler 统一处理此类。
 * </p>
 */
public class BusinessException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    private int code;

    private final String errorCode;

    public BusinessException() {
        super();
        this.code = 400;
        this.errorCode = "BUSINESS_ERROR";
    }

    public BusinessException(String message) {
        super(message);
        this.code = 400;
        this.errorCode = "BUSINESS_ERROR";
    }

    public BusinessException(String message, int code) {
        super(message);
        this.code = code;
        this.errorCode = "BUSINESS_ERROR";
    }

    public BusinessException(String message, Throwable cause) {
        super(message, cause);
        this.code = 400;
        this.errorCode = "BUSINESS_ERROR";
    }

    public BusinessException(String message, int code, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.errorCode = "BUSINESS_ERROR";
    }

    public BusinessException(String errorCode, String errorMessage, Throwable cause) {
        super(errorMessage, cause);
        this.code = 400;
        this.errorCode = errorCode;
    }

    public int getCode() {
        return code;
    }

    public void setCode(int code) {
        this.code = code;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public String getErrorMessage() {
        return getMessage();
    }

    public static BusinessException paramError(String message) {
        return new BusinessException("PARAM_ERROR", message, (Throwable) null);
    }

    public static BusinessException notFound(String message) {
        return new BusinessException("NOT_FOUND", message, (Throwable) null);
    }

    public static BusinessException alreadyExists(String message) {
        return new BusinessException("ALREADY_EXISTS", message, (Throwable) null);
    }

    public static BusinessException noPermission(String message) {
        return new BusinessException("NO_PERMISSION", message, (Throwable) null);
    }

    public static BusinessException operationNotAllowed(String message) {
        return new BusinessException("OPERATION_NOT_ALLOWED", message, (Throwable) null);
    }
}
