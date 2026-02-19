package com.fashion.supplychain.common.exception;

/**
 * 业务异常类
 * <p>
 * 用于封装业务逻辑层面的异常，如：
 * - 参数校验失败
 * - 业务规则冲突
 * - 数据状态不正确
 * - 权限不足
 * </p>
 */
public class BusinessException extends RuntimeException {

    /**
     * 错误码
     */
    private final String errorCode;

    /**
     * 错误消息
     */
    private final String errorMessage;

    /**
     * 构造业务异常
     *
     * @param errorMessage 错误消息
     */
    public BusinessException(String errorMessage) {
        super(errorMessage);
        this.errorCode = "BUSINESS_ERROR";
        this.errorMessage = errorMessage;
    }

    /**
     * 构造业务异常
     *
     * @param errorCode    错误码
     * @param errorMessage 错误消息
     */
    public BusinessException(String errorCode, String errorMessage) {
        super(errorMessage);
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }

    /**
     * 构造业务异常
     *
     * @param errorCode    错误码
     * @param errorMessage 错误消息
     * @param cause        原始异常
     */
    public BusinessException(String errorCode, String errorMessage, Throwable cause) {
        super(errorMessage, cause);
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }

    /**
     * 获取错误码
     *
     * @return 错误码
     */
    public String getErrorCode() {
        return errorCode;
    }

    /**
     * 获取错误消息
     *
     * @return 错误消息
     */
    public String getErrorMessage() {
        return errorMessage;
    }

    /**
     * 参数错误
     *
     * @param message 错误消息
     * @return 业务异常
     */
    public static BusinessException paramError(String message) {
        return new BusinessException("PARAM_ERROR", message);
    }

    /**
     * 数据不存在
     *
     * @param message 错误消息
     * @return 业务异常
     */
    public static BusinessException notFound(String message) {
        return new BusinessException("NOT_FOUND", message);
    }

    /**
     * 数据已存在
     *
     * @param message 错误消息
     * @return 业务异常
     */
    public static BusinessException alreadyExists(String message) {
        return new BusinessException("ALREADY_EXISTS", message);
    }

    /**
     * 权限不足
     *
     * @param message 错误消息
     * @return 业务异常
     */
    public static BusinessException noPermission(String message) {
        return new BusinessException("NO_PERMISSION", message);
    }

    /**
     * 操作不允许
     *
     * @param message 错误消息
     * @return 业务异常
     */
    public static BusinessException operationNotAllowed(String message) {
        return new BusinessException("OPERATION_NOT_ALLOWED", message);
    }
}
