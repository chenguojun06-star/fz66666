package com.fashion.supplychain.intelligence.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.io.Serializable;
import java.util.Map;

/**
 * 可执行的命令定义
 * 用途：把 AI 的"建议"转换成"结构化的执行命令"
 *
 * 例如：
 *   命令类型：order:hold
 *   目标ID：PO202603001
 *   原因：AI自动检测订单逾期
 *   风险等级：3（需人工确认）
 *
 * @author AI Command Generator v1.0
 * @date 2026-03-08
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExecutableCommand implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 命令唯一ID（生成审计用）
     */
    private String commandId;

    /**
     * 命令类型
     * 例：order:hold / order:expedite / purchase:create / inventory:check
     */
    private String action;

    /**
     * 目标对象ID
     * 例：PO202603001（订单ID） / WH001（仓库ID）
     */
    private String targetId;

    /**
     * 命令参数（JSON格式）
     * 例：{ "duration": 24, "reason": "temporary shortage" }
     */
    private Map<String, Object> params;

    /**
     * 执行原因（会记录到审计日志）
     * 例："AI检测到订单已逾期2天"
     */
    private String reason;

    /**
     * 风险等级 (1-5)
     * 1: 低风险，可自动执行（如库存查询）
     * 2: 低中风险
     * 3: 中等风险，需要确认（改订单状态）
     * 4: 高风险，需要管理员批准（删除操作）
     * 5: 极高风险，需要多人确认
     */
    private Integer riskLevel;

    /**
     * 是否需要人工确认
     */
    @Builder.Default
    private Boolean requiresApproval = false;

    /**
     * 命令来源
     * 例：ai_notification / openclaw / web_ui / slack_bot
     */
    private String source;

    /**
     * 发起人 ID（如果是AI自动生成，则为 null）
     */
    private String initiatorId;

    /**
     * 租户ID（强制租户隔离）
     */
    private Long tenantId;

    /**
     * 生成时间戳
     */
    private Long createdAt;

    /**
     * 过期时间戳（超过此时间自动作废）
     */
    private Long expiresAt;

    /**
     * 生成命令ID（用于审计）
     */
    public void generateCommandId() {
        this.commandId = String.format("CMD-%s-%d",
            System.currentTimeMillis(),
            (int)(Math.random() * 10000));
    }

    /**
     * 检查是否已过期
     */
    public boolean isExpired() {
        return System.currentTimeMillis() > expiresAt;
    }
}
