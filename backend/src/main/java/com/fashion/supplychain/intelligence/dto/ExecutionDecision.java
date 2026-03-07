package com.fashion.supplychain.intelligence.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.io.Serializable;

/**
 * 执行决策
 * 用途：PermissionDecisionOrchestrator 的输出
 *
 * 决策结果：
 *   1. 可以自动执行（已授权 & 风险低）
 *   2. 需要人工确认（高风险或超级管理员权限）
 *   3. 被拒绝（无权限 / 租户未启用）
 *
 * @author Permission Decision Engine v1.0
 * @date 2026-03-08
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExecutionDecision implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 决策结果
     * - AUTO_EXECUTE: 可直接执行（无需人工确认）
     * - REQUIRES_APPROVAL: 需要人工确认后才能执行
     * - DENIED: 拒绝执行
     */
    @Builder.Default
    private ExecutionDecisionType decision = ExecutionDecisionType.REQUIRES_APPROVAL;

    /**
     * 决策原因（会展示给用户）
     * 例：
     *   "风险等级为2，低于自动化阈值（3），可自动执行"
     *   "用户权限不足，需要 PRODUCTION_MANAGER 确认"
     *   "租户未启用该功能"
     */
    private String reason;

    /**
     * 需要的批准人角色（如果是 REQUIRES_APPROVAL）
     * 例：["MANAGER", "PRODUCTION_DIRECTOR"]
     */
    private String[] requiredApprovalRoles;

    /**
     * 需要的批准人数（如果是 REQUIRES_APPROVAL）
     */
    private Integer requiredApprovalCount;

    /**
     * 预计执行前的等待时间（秒）
     */
    private Integer estimatedWaitTimeSeconds;

    /**
     * 批准URL（如果是 REQUIRES_APPROVAL，提供确认地址）
     */
    private String approvalUrl;

    /**
     * 风险等级评分（用于可视化）
     */
    private Integer riskScore;

    /**
     * 是否可以自动执行
     */
    public boolean canAutoExecute() {
        return ExecutionDecisionType.AUTO_EXECUTE == decision;
    }

    /**
     * 是否被拒绝
     */
    public boolean isDenied() {
        return ExecutionDecisionType.DENIED == decision;
    }

    /**
     * 是否需要确认
     */
    public boolean needsApproval() {
        return ExecutionDecisionType.REQUIRES_APPROVAL == decision;
    }

    /**
     * 执行决策类型枚举
     */
    public enum ExecutionDecisionType {
        AUTO_EXECUTE,      // 自动执行
        REQUIRES_APPROVAL, // 需要确认
        DENIED             // 被拒绝
    }
}
