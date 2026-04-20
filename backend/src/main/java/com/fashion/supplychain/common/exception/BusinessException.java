package com.fashion.supplychain.common.exception;

/**
 * @deprecated 请使用 {@link com.fashion.supplychain.common.BusinessException} 统一版本。
 * 该类仅保留向后兼容，将在后续版本移除。
 */
@Deprecated(forRemoval = true)
public class BusinessException extends com.fashion.supplychain.common.BusinessException {

    public BusinessException(String errorMessage) {
        super(errorMessage);
    }

    public BusinessException(String errorCode, String errorMessage) {
        super(errorCode, errorMessage, null);
    }

    public BusinessException(String errorCode, String errorMessage, Throwable cause) {
        super(errorCode, errorMessage, cause);
    }

    public static BusinessException paramError(String message) {
        return new BusinessException("PARAM_ERROR", message);
    }

    public static BusinessException notFound(String message) {
        return new BusinessException("NOT_FOUND", message);
    }

    public static BusinessException alreadyExists(String message) {
        return new BusinessException("ALREADY_EXISTS", message);
    }

    public static BusinessException noPermission(String message) {
        return new BusinessException("NO_PERMISSION", message);
    }

    public static BusinessException operationNotAllowed(String message) {
        return new BusinessException("OPERATION_NOT_ALLOWED", message);
    }
}
