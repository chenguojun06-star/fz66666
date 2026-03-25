package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog;
import com.fashion.supplychain.intelligence.mapper.IntelligenceAuditLogMapper;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class AiAgentTraceOrchestrator {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    private IntelligenceAuditLogMapper auditLogMapper;

    public String startRequest(String userMessage) {
        String commandId = UUID.randomUUID().toString().replace("-", "");
        IntelligenceAuditLog logEntry = baseLog(commandId, "ai-agent:request");
        logEntry.setStatus("EXECUTING");
        logEntry.setReason(truncate(userMessage, 500));
        logEntry.setRemark("小云请求开始");
        auditLogMapper.insert(logEntry);
        return commandId;
    }

    public void logToolCall(String commandId, String toolName, String args, String result, long durationMs, boolean success) {
        IntelligenceAuditLog logEntry = baseLog(commandId, "ai-agent:tool:" + toolName);
        logEntry.setStatus(success ? "SUCCESS" : "FAILED");
        logEntry.setReason(truncate(args, 500));
        logEntry.setResultData(truncate(result, 4000));
        logEntry.setErrorMessage(success ? null : truncate(result, 500));
        logEntry.setDurationMs(durationMs);
        logEntry.setRemark("工具调用");
        logEntry.setTargetId(resolveTargetId(args, result));
        auditLogMapper.insert(logEntry);
        updateRequestToolSummary(commandId, toolName, success, logEntry.getTargetId());
    }

    public void finishRequest(String commandId, String finalAnswer, String errorMessage, long durationMs) {
        QueryWrapper<IntelligenceAuditLog> query = new QueryWrapper<>();
        query.eq("command_id", commandId).eq("action", "ai-agent:request").last("LIMIT 1");
        IntelligenceAuditLog requestLog = auditLogMapper.selectOne(query);
        if (requestLog == null) {
            requestLog = baseLog(commandId, "ai-agent:request");
        }
        requestLog.setStatus(errorMessage == null ? "SUCCESS" : "FAILED");
        requestLog.setResultData(truncate(finalAnswer, 4000));
        requestLog.setErrorMessage(truncate(errorMessage, 500));
        requestLog.setDurationMs(durationMs);
        requestLog.setRemark(errorMessage == null ? "小云请求完成" : "小云请求失败");
        if (requestLog.getCreatedAt() == null) {
            requestLog.setCreatedAt(LocalDateTime.now());
            auditLogMapper.insert(requestLog);
            return;
        }
        auditLogMapper.updateById(requestLog);
    }

    public Map<String, Object> queryTrace(String commandId) {
        QueryWrapper<IntelligenceAuditLog> query = new QueryWrapper<>();
        query.eq("command_id", commandId).eq("tenant_id", UserContext.tenantId()).orderByAsc("created_at");
        List<IntelligenceAuditLog> logs = auditLogMapper.selectList(query);
        Map<String, Object> result = new HashMap<>();
        result.put("commandId", commandId);
        result.put("logs", logs);
        result.put("count", logs.size());
        return result;
    }

    public List<IntelligenceAuditLog> listRecentRequests(int limit) {
        return listRecentRequests(limit, null, null, null, null, null);
    }

    public List<IntelligenceAuditLog> listRecentRequests(int limit, String toolName, String status, String executorKeyword,
                                                         LocalDateTime startTime, LocalDateTime endTime) {
        QueryWrapper<IntelligenceAuditLog> query = new QueryWrapper<>();
        query.eq("tenant_id", UserContext.tenantId()).eq("action", "ai-agent:request");
        query.like(toolName != null && !toolName.isBlank(), "remark", toolName.trim());
        query.eq(status != null && !status.isBlank(), "status", status.trim());
        query.and(executorKeyword != null && !executorKeyword.isBlank(), wrapper -> wrapper
                .like("executor_id", executorKeyword.trim())
                .or()
                .like("target_id", executorKeyword.trim()));
        query.ge(startTime != null, "created_at", startTime);
        query.le(endTime != null, "created_at", endTime);
        query.orderByDesc("created_at").last("LIMIT " + Math.max(limit, 1));
        return auditLogMapper.selectList(query);
    }

    private void updateRequestToolSummary(String commandId, String toolName, boolean success, String targetId) {
        QueryWrapper<IntelligenceAuditLog> query = new QueryWrapper<>();
        query.eq("command_id", commandId).eq("action", "ai-agent:request").last("LIMIT 1");
        IntelligenceAuditLog requestLog = auditLogMapper.selectOne(query);
        if (requestLog == null) {
            return;
        }
        String existing = requestLog.getRemark() == null ? "" : requestLog.getRemark();
        String token = toolName + (success ? "" : "(failed)");
        if (!existing.contains(token)) {
            requestLog.setRemark(truncate((existing.isBlank() ? "" : existing + " | ") + token, 500));
        }
        if ((requestLog.getTargetId() == null || requestLog.getTargetId().isBlank()) && targetId != null && !targetId.isBlank()) {
            requestLog.setTargetId(targetId);
        }
        auditLogMapper.updateById(requestLog);
    }

    private IntelligenceAuditLog baseLog(String commandId, String action) {
        IntelligenceAuditLog logEntry = new IntelligenceAuditLog();
        logEntry.setId(UUID.randomUUID().toString().replace("-", ""));
        logEntry.setTenantId(UserContext.tenantId());
        logEntry.setCommandId(commandId);
        logEntry.setAction(action);
        logEntry.setTargetId(UserContext.username());
        logEntry.setExecutorId(UserContext.userId());
        logEntry.setCreatedAt(LocalDateTime.now());
        logEntry.setRequiresApproval(false);
        return logEntry;
    }

    private String truncate(String text, int maxLength) {
        if (text == null || text.length() <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength);
    }

    public String toJson(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (Exception e) {
            return String.valueOf(value);
        }
    }

    private String resolveTargetId(String args, String result) {
        String fromArgs = extractCandidateId(args);
        return fromArgs != null ? fromArgs : extractCandidateId(result);
    }

    private String extractCandidateId(String payload) {
        if (payload == null || payload.isBlank()) {
            return null;
        }
        try {
            JsonNode node = JSON.readTree(payload);
            for (String field : List.of("orderNo", "styleNo", "styleId", "purchaseId", "reconciliationId",
                    "reimbursementId", "settlementId", "sampleId", "warehousingNo", "id", "targetId")) {
                JsonNode value = node.get(field);
                if (value != null && !value.isNull() && !value.asText().isBlank()) {
                    return truncate(value.asText().trim(), 120);
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }
}
