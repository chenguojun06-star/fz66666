package com.fashion.supplychain.common;

import lombok.Data;
import org.slf4j.MDC;
import java.io.Serial;
import java.io.Serializable;

/**
 * 统一响应结果类
 */
@Data
public class Result<T> implements Serializable {
    @Serial
    private static final long serialVersionUID = 1L;

    /**
     * 状态码：成功=200，失败=500
     */
    private Integer code;

    /**
     * 提示信息
     */
    private String message;

    /**
     * 业务数据
     */
    private T data;

    /**
     * 请求追踪ID，用于前后端/日志关联定位问题。
     *
     * 该值会自动从 MDC(requestId) 注入（由后端过滤器生成或透传）。
     */
    private String requestId;

    /**
     * 成功响应
     */
    public static <T> Result<T> success() {
        return success(null);
    }

    /**
     * 成功响应带数据
     */
    public static <T> Result<T> success(T data) {
        Result<T> result = new Result<>();
        result.setCode(200);
        result.setMessage("操作成功");
        result.setData(data);
        result.setRequestId(currentRequestId());
        return result;
    }

    public static Result<Void> successMessage(String message) {
        return success(message, null);
    }

    public static <T> Result<T> success(String message, T data) {
        Result<T> result = new Result<>();
        result.setCode(200);
        result.setMessage(message == null || message.isBlank() ? "操作成功" : message);
        result.setData(data);
        result.setRequestId(currentRequestId());
        return result;
    }

    /**
     * 失败响应
     */
    public static <T> Result<T> fail(String message) {
        Result<T> result = new Result<>();
        result.setCode(500);
        result.setMessage(message);
        result.setData(null);
        result.setRequestId(currentRequestId());
        return result;
    }

    /**
     * 失败响应带状态码
     */
    public static <T> Result<T> fail(Integer code, String message) {
        Result<T> result = new Result<>();
        result.setCode(code);
        result.setMessage(message);
        result.setData(null);
        result.setRequestId(currentRequestId());
        return result;
    }

    /**
     * 失败响应（可携带额外错误信息数据，例如参数校验明细）。
     */
    public static <T> Result<T> fail(Integer code, String message, T data) {
        Result<T> result = new Result<>();
        result.setCode(code);
        result.setMessage(message);
        result.setData(data);
        result.setRequestId(currentRequestId());
        return result;
    }

    /**
     * 从 MDC 中获取当前请求的 requestId。
     */
    private static String currentRequestId() {
        try {
            String rid = MDC.get("requestId");
            return rid == null || rid.isBlank() ? null : rid.trim();
        } catch (Exception e) {
            return null;
        }
    }
}
