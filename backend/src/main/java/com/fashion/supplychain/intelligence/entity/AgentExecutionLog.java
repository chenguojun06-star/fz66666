package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

/**
 * 多代理图执行日志实体 — 对应 t_agent_execution_log 表。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("t_agent_execution_log")
public class AgentExecutionLog {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    private Long tenantId;
    private String scene;
    private String route;
    private String contextSummary;
    private String reflection;
    private String optimizationSuggestion;
    private Integer confidenceScore;

    /** 执行状态：SUCCESS / FAILED */
    private String status;

    /** 端到端耗时(ms) */
    private Long latencyMs;

    /** 各 Specialist 输出（JSON Map） */
    private String specialistResults;

    /** 节点执行轨迹（JSON List） */
    private String nodeTrace;

    /** 数字孪生快照（JSON） */
    private String digitalTwinSnapshot;

    /** 用户反馈评分：1-5（A/B 测试用） */
    private Integer userFeedback;

    /** 用户反馈备注 */
    private String feedbackNote;

    private LocalDateTime createTime;
}
