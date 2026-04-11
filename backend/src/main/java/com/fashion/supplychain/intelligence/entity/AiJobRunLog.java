package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.experimental.Accessors;

import java.time.LocalDateTime;

/**
 * AI 定时任务执行日志实体
 * <p>
 * 对应 {@code t_ai_job_run_log} 表，记录每次 @Scheduled 任务的运行情况。
 * 由 {@link com.fashion.supplychain.intelligence.aspect.JobRunObservabilityAspect} 自动写入，
 * 业务代码无需手动调用。
 * </p>
 */
@Data
@Accessors(chain = true)
@TableName("t_ai_job_run_log")
public class AiJobRunLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** 任务类名，如 AiPatrolOrchestrator */
    private String jobName;

    /** 触发方法名，如 schedulePatrol */
    private String methodName;

    /** 任务开始时间 */
    private LocalDateTime startTime;

    /** 执行耗时（毫秒） */
    private Long durationMs;

    /** 执行状态：SUCCESS | FAILED | SKIPPED */
    private String status;

    /**
     * 本次处理的租户数量；
     * 对于迭代所有租户的任务（如 AiPatrolOrchestrator）填写，单次执行型任务留 null
     */
    private Integer tenantCount;

    /** 执行结果摘要，如"共处理3个租户, 生成5条信号" */
    private String resultSummary;

    /** 失败时的错误信息 */
    private String errorMessage;

    /** 记录创建时间（由数据库默认值写入） */
    private LocalDateTime createdAt;
}
