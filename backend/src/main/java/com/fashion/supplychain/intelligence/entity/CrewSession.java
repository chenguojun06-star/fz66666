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
 * Agentic Crew Graph 会话记录实体 — 对应 t_crew_session 表。
 *
 * <p>记录每次 Crew 执行的完整上下文：目标、规划、执行状态、健康分、自学习结果。
 * 用于 CriticEvolutionTool 回溯学习 + Langfuse trace 关联。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("t_crew_session")
public class CrewSession {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 租户 ID */
    private Long tenantId;

    /** 触发用户 ID */
    private String userId;

    /** 自然语言目标（用户原始输入） */
    private String naturalGoal;

    /** Planner Agent 生成的执行计划（JSON 文本）*/
    private String planJson;

    /**
     * 图路由结果：AUTO_EXECUTED（健康度>70 自动执行）
     *            PENDING_REVIEW（需人审）
     *            CRITIC_REVISED（经 Critic 修正后执行）
     */
    private String routeDecision;

    /** CrewGraph 计算出的综合健康分（0-100）*/
    private Integer healthScore;

    /** 执行结果摘要（action.summary）*/
    private String resultSummary;

    /** 执行状态：RUNNING / COMPLETED / PENDING / FAILED */
    private String status;

    /** Langfuse trace ID（可跳转溯源）*/
    private String traceId;

    /** 端到端耗时（ms）*/
    private Long latencyMs;

    /** Critic 修正后的优化洞察（写入 t_agent_evolution_log 的 insight 原文）*/
    private String criticInsight;

    /** 是否已同步写入 Qdrant 向量记忆 */
    private Integer qdrantSynced;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
