package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiOperationAuditRecord;
import com.fashion.supplychain.intelligence.mapper.AiOperationAuditRecordMapper;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class AiOperationAuditOrchestrator {

    private static final Set<String> HIGH_RISK_TOOLS = Set.of(
            "tool_production_scan",
            "tool_quality_inbound",
            "tool_warehouse_outbound",
            "tool_payroll_approve",
            "tool_invoice_create",
            "tool_financial_report"
    );

    @Autowired private AiOperationAuditRecordMapper auditMapper;

    @Async
    public void recordAudit(String sessionId, String toolName, String inputSummary, String outputSummary,
                            long executionTimeMs, boolean success, String errorMessage) {
        try {
            AiOperationAuditRecord record = new AiOperationAuditRecord();
            record.setTenantId(UserContext.tenantId());
            record.setSessionId(sessionId);
            record.setToolName(toolName);
            record.setRiskLevel(determineRiskLevel(toolName));
            record.setInputSummary(truncate(inputSummary, 2000));
            record.setOutputSummary(truncate(outputSummary, 2000));
            record.setApprovalStatus(HIGH_RISK_TOOLS.contains(toolName) ? "pending_review" : "auto_approved");
            record.setExecutionTimeMs((int) executionTimeMs);
            record.setSuccess(success);
            record.setErrorMessage(truncate(errorMessage, 512));
            record.setOperatorName(UserContext.username());
            auditMapper.insert(record);
        } catch (Exception e) {
            log.debug("[AI审计] 记录审计失败: {}", e.getMessage());
        }
    }

    public boolean approveAudit(Long auditId, String approvedBy) {
        try {
            AiOperationAuditRecord record = auditMapper.selectById(auditId);
            if (record == null) return false;
            record.setApprovalStatus("approved");
            record.setApprovedBy(approvedBy);
            record.setApprovedAt(LocalDateTime.now());
            auditMapper.updateById(record);
            return true;
        } catch (Exception e) {
            log.warn("[AI审计] 审批失败: {}", e.getMessage());
            return false;
        }
    }

    public boolean rejectAudit(Long auditId, String approvedBy) {
        try {
            AiOperationAuditRecord record = auditMapper.selectById(auditId);
            if (record == null) return false;
            record.setApprovalStatus("rejected");
            record.setApprovedBy(approvedBy);
            record.setApprovedAt(LocalDateTime.now());
            auditMapper.updateById(record);
            return true;
        } catch (Exception e) {
            log.warn("[AI审计] 拒绝失败: {}", e.getMessage());
            return false;
        }
    }

    public Map<String, Object> getAuditStats(int days) {
        Map<String, Object> stats = new LinkedHashMap<>();
        try {
            Long tenantId = UserContext.tenantId();
            LocalDateTime since = LocalDateTime.now().minusDays(days);
            LambdaQueryWrapper<AiOperationAuditRecord> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(AiOperationAuditRecord::getTenantId, tenantId);
            wrapper.ge(AiOperationAuditRecord::getCreatedAt, since);
            List<AiOperationAuditRecord> records = auditMapper.selectList(wrapper);

            long total = records.size();
            long highRisk = records.stream().filter(r -> "high".equals(r.getRiskLevel())).count();
            long pending = records.stream().filter(r -> "pending_review".equals(r.getApprovalStatus())).count();
            long approved = records.stream().filter(r -> "approved".equals(r.getApprovalStatus())).count();
            long rejected = records.stream().filter(r -> "rejected".equals(r.getApprovalStatus())).count();
            long autoApproved = records.stream().filter(r -> "auto_approved".equals(r.getApprovalStatus())).count();
            long failed = records.stream().filter(r -> !Boolean.TRUE.equals(r.getSuccess())).count();

            stats.put("period", days + "天");
            stats.put("totalOperations", total);
            stats.put("highRisk", highRisk);
            stats.put("pendingReview", pending);
            stats.put("approved", approved);
            stats.put("rejected", rejected);
            stats.put("autoApproved", autoApproved);
            stats.put("failed", failed);
            stats.put("successRate", total > 0 ? Math.round((double) (total - failed) / total * 1000.0) / 10.0 + "%" : "N/A");
        } catch (Exception e) {
            log.warn("[AI审计] 获取统计失败: {}", e.getMessage());
        }
        return stats;
    }

    private String determineRiskLevel(String toolName) {
        if (HIGH_RISK_TOOLS.contains(toolName)) return "high";
        if (toolName != null && (toolName.contains("create") || toolName.contains("delete") || toolName.contains("update"))) {
            return "medium";
        }
        return "low";
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return null;
        return text.length() > maxLen ? text.substring(0, maxLen) : text;
    }
}
