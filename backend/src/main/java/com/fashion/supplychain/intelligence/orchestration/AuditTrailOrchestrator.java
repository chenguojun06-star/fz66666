package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.ExecutableCommand;
import com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog;
import com.fashion.supplychain.intelligence.mapper.IntelligenceAuditLogMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * 审计轨迹编排器
 *
 * 职责：
 *   1. 记录所有 AI 执行的命令
 *   2. 记录执行的结果（成功/失败）
 *   3. 保存完整的审计日志用于追踪和合规
 *
 * 作用：
 *   ├─ 问题追踪：出问题后可追溯谁/什么时候/做了什么
 *   ├─ 合规审计：满足数据治理要求
 *   ├─ 性能分析：分析 AI 建议的准确率、成功率
 *   └─ 学习反馈：用于改进 AI 模型
 *
 * 表结构：t_intelligence_audit_log
 *   ├─ id: 审计日志ID
 *   ├─ command_id: 命令ID
 *   ├─ action: 命令类型
 *   ├─ target_id: 目标对象ID
 *   ├─ executor_id: 执行者
 *   ├─ status: 成功/失败/取消
 *   ├─ result: 执行结果(JSON)
 *   ├─ error_message: 错误信息
 *   ├─ duration_ms: 执行耗时
 *   ├─ created_at: 创建时间
 *   └─ remark: 备注
 *
 * @author Audit Trail Engine v1.0
 * @date 2026-03-08
 */
@Slf4j
@Service
public class AuditTrailOrchestrator {

    @Autowired
    private IntelligenceAuditLogMapper auditLogMapper;

    /**
     * 记录命令开始执行
     */
    @Transactional(rollbackFor = Exception.class)
    public void logCommandStart(ExecutableCommand command, Long executorId) {
        IntelligenceAuditLog auditLog = IntelligenceAuditLog.builder()
            .commandId(command.getCommandId())
            .tenantId(command.getTenantId())
            .action(command.getAction())
            .targetId(command.getTargetId())
            .executorId(executorId.toString())
            .status("EXECUTING")
            .reason(command.getReason())
            .riskLevel(command.getRiskLevel())
            .createdAt(LocalDateTime.now())
            .build();

        auditLogMapper.insert(auditLog);
        log.debug("[AuditTrail] 日志记录: {} 开始执行", command.getCommandId());
    }

    /**
     * 记录命令执行成功
     */
    @Transactional(rollbackFor = Exception.class)
    public void logCommandSuccess(
        ExecutableCommand command,
        Object result,
        Long executorId,
        long durationMs
    ) {
        IntelligenceAuditLog auditLog = IntelligenceAuditLog.builder()
            .commandId(command.getCommandId())
            .tenantId(command.getTenantId())
            .action(command.getAction())
            .targetId(command.getTargetId())
            .executorId(executorId.toString())
            .status("SUCCESS")
            .reason(command.getReason())
            .riskLevel(command.getRiskLevel())
            .resultData(convertToJson(result))
            .durationMs(durationMs)
            .createdAt(LocalDateTime.now())
            .build();

        auditLogMapper.insert(auditLog);
        log.info("[AuditTrail] 日志记录: {} 执行成功 ({}ms)",
            command.getCommandId(), durationMs);
    }

    /**
     * 记录命令执行失败
     */
    @Transactional(rollbackFor = Exception.class)
    public void logCommandFailure(
        ExecutableCommand command,
        Exception exception,
        Long executorId,
        long durationMs
    ) {
        IntelligenceAuditLog auditLog = IntelligenceAuditLog.builder()
            .commandId(command.getCommandId())
            .tenantId(command.getTenantId())
            .action(command.getAction())
            .targetId(command.getTargetId())
            .executorId(executorId.toString())
            .status("FAILED")
            .reason(command.getReason())
            .riskLevel(command.getRiskLevel())
            .errorMessage(exception.getMessage())
            .durationMs(durationMs)
            .createdAt(LocalDateTime.now())
            .remark("异常: " + exception.getClass().getSimpleName())
            .build();

        auditLogMapper.insert(auditLog);
        log.warn("[AuditTrail] 日志记录: {} 执行失败: {}",
            command.getCommandId(), exception.getMessage());
    }

    /**
     * 记录命令被取消/拒绝
     */
    @Transactional(rollbackFor = Exception.class)
    public void logCommandCancelled(
        ExecutableCommand command,
        String cancelReason,
        Long cancelledBy
    ) {
        IntelligenceAuditLog auditLog = IntelligenceAuditLog.builder()
            .commandId(command.getCommandId())
            .tenantId(command.getTenantId())
            .action(command.getAction())
            .targetId(command.getTargetId())
            .executorId(cancelledBy.toString())
            .status("CANCELLED")
            .reason(command.getReason())
            .riskLevel(command.getRiskLevel())
            .errorMessage(cancelReason)
            .createdAt(LocalDateTime.now())
            .remark("由用户 " + cancelledBy + " 手动取消")
            .build();

        auditLogMapper.insert(auditLog);
        log.info("[AuditTrail] 日志记录: {} 被取消: {}",
            command.getCommandId(), cancelReason);
    }

    /**
     * 记录用户反馈（AI学习用）
     */
    @Transactional(rollbackFor = Exception.class)
    public void logUserFeedback(
        String commandId,
        String feedback,
        Integer satisfactionScore,  // 1-5
        Long userId
    ) {
        IntelligenceAuditLog auditLog = IntelligenceAuditLog.builder()
            .commandId(commandId)
            .status("FEEDBACK")
            .remark("用户反馈: " + feedback + " (满意度: " + satisfactionScore + "/5)")
            .createdAt(LocalDateTime.now())
            .build();

        auditLogMapper.insert(auditLog);
        log.info("[AuditTrail] 反馈记录: {} 满意度: {}/5", commandId, satisfactionScore);
    }

    /**
     * 获取审计日志（用于可视化）
     */
    public Page<IntelligenceAuditLog>
    queryAuditLogs(Long tenantId, int page, int pageSize, String status) {
        Page<IntelligenceAuditLog> pageReq = new Page<>(page, pageSize);
        QueryWrapper<IntelligenceAuditLog> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId);
        if (status != null && !status.isEmpty()) {
            qw.eq("status", status);
        }
        qw.orderByDesc("created_at");
        return auditLogMapper.selectPage(pageReq, qw);
    }

    /**
     * 获取 AI 执行统计（仪表板展示用）
     */
    public Map<String, Object> getExecutionStats(Long tenantId) {
        // 总执行数（排除 PENDING_APPROVAL / EXECUTING / FEEDBACK 等中间态）
        QueryWrapper<IntelligenceAuditLog> totalQw = new QueryWrapper<>();
        totalQw.eq(tenantId != null, "tenant_id", tenantId)
               .notIn("status", "PENDING_APPROVAL", "EXECUTING", "FEEDBACK");
        long totalExecuted = auditLogMapper.selectCount(totalQw);

        QueryWrapper<IntelligenceAuditLog> successQw = new QueryWrapper<>();
        successQw.eq(tenantId != null, "tenant_id", tenantId)
                 .eq("status", "SUCCESS");
        long successCount = auditLogMapper.selectCount(successQw);

        double successRate = totalExecuted > 0
                ? Math.round((double) successCount / totalExecuted * 1000) / 10.0 : 0.0;

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalExecuted", totalExecuted);
        stats.put("successRate", successRate);
        stats.put("avgDuration", 0L);
        stats.put("commandTypeDistribution", new HashMap<>());
        stats.put("userSatisfactionScore", 0.0);
        return stats;
    }

    /**
     * 辅助：对象转JSON字符串
     */
    private String convertToJson(Object obj) {
        if (obj == null) return "null";
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(obj);
        } catch (Exception e) {
            return obj.toString();
        }
    }
}
