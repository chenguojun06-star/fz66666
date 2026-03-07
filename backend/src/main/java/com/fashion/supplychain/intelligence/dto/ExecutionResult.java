package com.fashion.supplychain.intelligence.dto;

import com.fashion.supplychain.common.Result;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 执行结果
 * 用途：ExecutionEngineOrchestrator 的输出
 *
 * 包含：执行成功/失败、结果数据、审计ID、执行时间等
 *
 * @author Execution Engine v1.0
 * @date 2026-03-08
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExecutionResult<T> implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 执行是否成功
     */
    @Builder.Default
    private boolean success = false;

    /**
     * 执行结果数据
     * 例：改状态成功后返回更新后的订单对象
     */
    private T data;

    /**
     * 错误消息（如果失败）
     */
    private String errorMessage;

    /**
     * 执行消息（展示给用户）
     * 例："订单已成功暂停，已通知生产部"
     */
    private String message;

    /**
     * 审计日志ID（用于追溯）
     */
    private String auditId;

    /**
     * 命令ID
     */
    private String commandId;

    /**
     * 执行者ID
     */
    private String executorId;

    /**
     * 执行时间
     */
    private LocalDateTime executedAt;

    /**
     * 执行耗时（毫秒）
     */
    private Long executionDurationMs;

    /**
     * 级联触发的后续任务数
     */
    private Integer cascadedTasksCount;

    /**
     * 通知的部门/人员
     * 例：["生产部", "采购部", "财务部"]
     */
    private String[] notifiedRecipients;

    /**
     * 转换为 Result<T> 用于 API 返回
     */
    public Result<T> toResult() {
        if (success) {
            return Result.success(message, data);
        } else {
            return Result.fail(errorMessage != null ? errorMessage : "执行失败");
        }
    }

    /**
     * 工厂方法：成功
     */
    public static <T> ExecutionResult<T> success(T data, String message) {
        return ExecutionResult.<T>builder()
            .success(true)
            .data(data)
            .message(message)
            .executedAt(LocalDateTime.now())
            .build();
    }

    /**
     * 工厂方法：失败
     */
    public static <T> ExecutionResult<T> failure(String errorMessage) {
        return ExecutionResult.<T>builder()
            .success(false)
            .errorMessage(errorMessage)
            .executedAt(LocalDateTime.now())
            .build();
    }
}
