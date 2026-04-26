package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.experimental.Accessors;

import java.time.LocalDateTime;

/**
 * 高风险 AI 工具调用审计实体
 * <p>
 * 对应 {@code t_intelligence_high_risk_audit} 表。每次高风险工具被 AI 调用时
 * 由 {@link com.fashion.supplychain.intelligence.agent.hook.HighRiskAuditHook}
 * 经 {@link com.fashion.supplychain.intelligence.service.HighRiskAuditService}
 * 异步写入：申请 → 批准 → 执行 全过程留痕。
 * </p>
 */
@Data
@Accessors(chain = true)
@TableName("t_intelligence_high_risk_audit")
public class HighRiskAuditLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String userId;
    private String userName;
    private String toolName;

    /** SHA-256 全量哈希 (64 hex chars) — 取代旧版仅取前 32 字符的脆弱键 */
    private String argsHash;
    private String argsPreview;

    /** PENDING / APPROVED / REJECTED / EXECUTED / EXPIRED */
    private String status;

    private LocalDateTime createdAt;
    private LocalDateTime decidedAt;
    private LocalDateTime executedAt;
    private Long elapsedMs;
    private Boolean success;
    private String resultPreview;
    private String errorMessage;
}
