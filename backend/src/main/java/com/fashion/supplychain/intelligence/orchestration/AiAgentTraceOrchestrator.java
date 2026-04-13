package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog;
import com.fashion.supplychain.intelligence.mapper.IntelligenceAuditLogMapper;
import com.fashion.supplychain.intelligence.service.AsyncIntelligenceAuditService;
import java.time.LocalDateTime;
import java.util.ArrayList;
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
    @Autowired
    private AsyncIntelligenceAuditService asyncAuditService;

    public String startRequest(String userMessage) {
        return startRequest(userMessage, "ai-agent:request");
    }

    public String startRequest(String userMessage, String scene) {
        String commandId = UUID.randomUUID().toString().replace("-", "");
        IntelligenceAuditLog logEntry = baseLog(commandId, scene);
        logEntry.setStatus("EXECUTING");
        logEntry.setReason(truncate(userMessage, 500));
        logEntry.setRemark(sceneToRemark(scene) + "开始");
        asyncAuditService.asyncInsert(logEntry);
        return commandId;
    }

    public void recordStep(String commandId, String stepName, String input, String output, long durationMs, boolean success) {
        IntelligenceAuditLog logEntry = baseLog(commandId, "ai-agent:step:" + stepName);
        logEntry.setStatus(success ? "SUCCESS" : "FAILED");
        logEntry.setReason(truncate(input, 500));
        logEntry.setResultData(truncate(output, 4000));
        logEntry.setErrorMessage(success ? null : truncate(output, 500));
        logEntry.setDurationMs(durationMs);
        logEntry.setRemark("执行步骤: " + stepName);
        asyncAuditService.asyncInsert(logEntry);
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
        asyncAuditService.asyncInsert(logEntry);
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
            asyncAuditService.asyncInsert(requestLog);
            return;
        }
        asyncAuditService.asyncUpdate(requestLog);
    }

    public Map<String, Object> queryTrace(String commandId) {
        Map<String, Object> result = new HashMap<>();
        result.put("commandId", commandId);
        try {
            QueryWrapper<IntelligenceAuditLog> query = new QueryWrapper<>();
            query.eq("command_id", commandId).eq("tenant_id", UserContext.tenantId()).orderByAsc("created_at");
            List<IntelligenceAuditLog> logs = auditLogMapper.selectList(query);
            result.put("logs", logs);
            result.put("count", logs.size());
        } catch (Exception e) {
            log.warn("[AI_TRACE] 查询轨迹详情失败 commandId={}：{}", commandId, e.getMessage());
            result.put("logs", java.util.Collections.emptyList());
            result.put("count", 0);
        }
        return result;
    }

    public List<IntelligenceAuditLog> listRecentRequests(int limit) {
        return listRecentRequests(limit, null, null, null, null, null);
    }

    public List<IntelligenceAuditLog> listRecentRequests(int limit, String toolName, String status, String executorKeyword,
                                                         LocalDateTime startTime, LocalDateTime endTime) {
        try {
            String normalizedToolName = toolName == null ? "" : toolName.trim();
            String normalizedStatus = status == null ? "" : status.trim();
            String normalizedExecutorKeyword = executorKeyword == null ? "" : executorKeyword.trim();
            Long tenantId = UserContext.tenantId();
            QueryWrapper<IntelligenceAuditLog> query = new QueryWrapper<>();
            query.eq("action", "ai-agent:request");
            if (tenantId != null) {
                query.eq("tenant_id", tenantId);
            }
            query.like(!normalizedToolName.isBlank(), "remark", normalizedToolName);
            query.eq(!normalizedStatus.isBlank(), "status", normalizedStatus);
            query.and(!normalizedExecutorKeyword.isBlank(), wrapper -> wrapper
                    .like("executor_id", normalizedExecutorKeyword)
                    .or()
                    .like("target_id", normalizedExecutorKeyword));
            query.ge(startTime != null, "created_at", startTime);
            query.le(endTime != null, "created_at", endTime);
            query.orderByDesc("created_at").last("LIMIT " + Math.max(limit, 1));
            return auditLogMapper.selectList(query);
        } catch (Exception e) {
            log.warn("[AI_TRACE] 查询最近轨迹失败（表或字段可能未就绪）: {}", e.getMessage());
            return java.util.Collections.emptyList();
        }
    }

    public List<Map<String, Object>> listRecentRequestSummaries(int limit, String toolName, String status, String executorKeyword,
                                                                LocalDateTime startTime, LocalDateTime endTime) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (IntelligenceAuditLog logRow : listRecentRequests(limit, toolName, status, executorKeyword, startTime, endTime)) {
            Map<String, Object> row = new HashMap<>();
            row.put("id", logRow.getId());
            row.put("tenantId", logRow.getTenantId());
            row.put("commandId", logRow.getCommandId());
            row.put("action", logRow.getAction());
            row.put("targetId", logRow.getTargetId());
            row.put("executorId", logRow.getExecutorId());
            row.put("status", logRow.getStatus());
            row.put("durationMs", logRow.getDurationMs());
            row.put("remark", logRow.getRemark());
            row.put("errorMessage", logRow.getErrorMessage());
            row.put("createdAt", logRow.getCreatedAt());
            rows.add(row);
        }
        return rows;
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
        asyncAuditService.asyncUpdate(requestLog);
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

    private String sceneToRemark(String scene) {
        if (scene == null) return "AI请求";
        if (scene.contains("nl-query")) return "自然语言查询";
        if (scene.contains("hyper-advisor")) return "超级顾问";
        if (scene.contains("forecast")) return "预测引擎";
        if (scene.contains("visual")) return "视觉AI";
        if (scene.contains("voice")) return "语音指令";
        if (scene.contains("meeting")) return "Agent例会";
        if (scene.contains("whatif")) return "推演仿真";
        if (scene.contains("style-difficulty")) return "款式难度分析";
        if (scene.contains("signal")) return "信号采集";
        if (scene.contains("learning")) return "学习闭环";
        if (scene.contains("feedback")) return "反馈学习";
        if (scene.contains("smart-assignment")) return "智能派工";
        if (scene.contains("process-template")) return "工序模板";
        if (scene.contains("style-quote")) return "报价建议";
        if (scene.contains("supervisor")) return "监督代理";
        if (scene.contains("crew")) return "Agent团队";
        if (scene.contains("debate")) return "多Agent辩论";
        if (scene.contains("rca")) return "根因分析";
        if (scene.contains("goal")) return "目标拆解";
        if (scene.contains("pattern")) return "规律发现";
        if (scene.contains("reflection")) return "反思引擎";
        if (scene.contains("decision")) return "决策链";
        if (scene.contains("memory")) return "AI记忆";
        if (scene.contains("knowledge")) return "知识收割";
        if (scene.contains("benchmark")) return "基准洞察";
        if (scene.contains("brain")) return "统一大脑";
        if (scene.contains("work-plan")) return "工作计划";
        return "AI请求";
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
