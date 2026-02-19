package com.fashion.supplychain.common;

import java.io.Serial;

/**
 * 业务异常类
 * 用于处理业务逻辑中的异常情况
 */
public class BusinessException extends RuntimeException {

    @Serial
    private static final long serialVersionUID = 1L;

    /**
     * 错误码
     */
    private int code;

    /**
     * 默认构造函数
     */
    public BusinessException() {
        super();
        this.code = 400;
    }

    /**
     * 构造函数
     * @param message 错误信息
     */
    public BusinessException(String message) {
        super(message);
        this.code = 400;
    }

    /**
     * 构造函数
     * @param message 错误信息
     * @param code 错误码
     */
    public BusinessException(String message, int code) {
        super(message);
        this.code = code;
    }

    /**
     * 构造函数
     * @param message 错误信息
     * @param cause 异常原因
     */
    public BusinessException(String message, Throwable cause) {
        super(message, cause);
        this.code = 400;
    }

    /**
     * 构造函数
     * @param message 错误信息
     * @param code 错误码
     * @param cause 异常原因
     */
    public BusinessException(String message, int code, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    /**
     * 获取错误码
     * @return 错误码
     */
    public int getCode() {
        return code;
    }

    /**
     * 设置错误码
     * @param code 错误码
     */
    public void setCode(int code) {
        this.code = code;
    }
}
