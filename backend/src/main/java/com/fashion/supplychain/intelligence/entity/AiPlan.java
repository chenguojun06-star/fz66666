package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * AI Plan-and-Execute 计划主表
 * <p>用途：复杂任务先出 3-7 步执行计划，再分步执行；前端可显示进度条。
 * <br>租户隔离：tenantId；超管 (ROLE_SUPER_ADMIN) 可跨租户查看用于训练。</p>
 */
@Data
@TableName("t_ai_plan")
public class AiPlan {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 计划业务UID */
    private String planUid;

    private Long tenantId;
    private String userId;
    private String userName;
    private String sessionId;

    /** 用户目标原文 */
    private String goal;

    /** 计划步骤 JSON：[{step,action,tool,status,result}] */
    private String planJson;

    private Integer totalSteps;
    private Integer completedSteps;
    private Integer currentStep;

    /** PLANNING / EXECUTING / SUCCESS / FAILED / CANCELLED / REPLANNING */
    private String status;

    /** TENANT / PLATFORM */
    private String visibility;

    private String finalResult;
    private String errorMessage;

    private Integer totalTokens;
    private Long totalDurationMs;
    private Integer replanCount;
    private String traceId;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
