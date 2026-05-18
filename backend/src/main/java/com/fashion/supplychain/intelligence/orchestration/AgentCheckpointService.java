package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.entity.AgentCheckpoint;
import com.fashion.supplychain.intelligence.mapper.AgentCheckpointMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AgentCheckpointService {

    private final AgentCheckpointMapper checkpointMapper;
    private final ObjectMapper objectMapper;

    public void saveCheckpoint(Long tenantId, String threadId, String nodeId,
                                String nodeName, AgentState state, int stepIndex) {
        try {
            AgentCheckpoint checkpoint = new AgentCheckpoint();
            checkpoint.setTenantId(safeTenantId(tenantId));
            checkpoint.setThreadId(truncate(threadId, 128));
            checkpoint.setNodeId(truncate(nodeId, 128));
            checkpoint.setNodeName(truncate(nodeName, 256));
            String stateJsonStr = objectMapper.writeValueAsString(state);
            if (stateJsonStr.length() > 4_000_000) {
                log.warn("[Checkpoint] stateJson too large ({} chars), truncating for thread={}", stateJsonStr.length(), threadId);
                stateJsonStr = stateJsonStr.substring(0, 4_000_000);
            }
            checkpoint.setStateJson(stateJsonStr);
            checkpoint.setStepIndex(stepIndex);
            checkpoint.setStatus("ACTIVE");
            checkpoint.setCreatedAt(LocalDateTime.now());

            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("route", state.getRoute());
            meta.put("confidenceScore", state.getConfidenceScore());
            meta.put("nodeTraceSize", state.getNodeTrace().size());
            checkpoint.setMetadataJson(objectMapper.writeValueAsString(meta));

            checkpointMapper.insert(checkpoint);
            log.debug("[Checkpoint] Saved: thread={}, node={}, step={}", threadId, nodeId, stepIndex);
        } catch (Exception e) {
            log.error("[Checkpoint] Save failed: threadId={}, nodeId={}, stepIndex={}, error={}",
                      threadId, nodeId, stepIndex, e.getMessage(), e);
            tryInsertMinimal(tenantId, threadId, nodeId, stepIndex);
        }
    }

    private void tryInsertMinimal(Long tenantId, String threadId, String nodeId, int stepIndex) {
        try {
            AgentCheckpoint minimal = new AgentCheckpoint();
            minimal.setTenantId(safeTenantId(tenantId));
            minimal.setThreadId(truncate(threadId, 128));
            minimal.setNodeId(truncate(nodeId, 128));
            minimal.setStepIndex(stepIndex);
            minimal.setStatus("ACTIVE");
            minimal.setCreatedAt(LocalDateTime.now());
            checkpointMapper.insert(minimal);
            log.info("[Checkpoint] Minimal insert succeeded: thread={}, node={}, step={}", threadId, nodeId, stepIndex);
        } catch (Exception e2) {
            log.error("[Checkpoint] Minimal insert also failed: threadId={}, nodeId={}, error={}",
                      threadId, nodeId, e2.getMessage());
        }
    }

    private Long safeTenantId(Long tenantId) {
        return tenantId != null ? tenantId : 0L;
    }

    private String truncate(String value, int maxLen) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return "";
        }
        if (trimmed.length() <= maxLen) {
            return trimmed;
        }
        return trimmed.substring(0, maxLen);
    }

    @Async
    public void saveCheckpointAsync(Long tenantId, String threadId, String nodeId,
                                     String nodeName, AgentState state, int stepIndex) {
        saveCheckpoint(tenantId, threadId, nodeId, nodeName, state, stepIndex);
    }

    public AgentState restoreFromCheckpoint(Long tenantId, String threadId) {
        AgentCheckpoint latest = checkpointMapper.selectLatestActive(tenantId, threadId);
        if (latest == null) {
            log.info("[Checkpoint] No active checkpoint found: tenant={}, thread={}", tenantId, threadId);
            return null;
        }
        try {
            AgentState state = objectMapper.readValue(latest.getStateJson(), AgentState.class);
            log.info("[Checkpoint] Restored: thread={}, node={}, step={}", threadId, latest.getNodeId(), latest.getStepIndex());
            return state;
        } catch (Exception e) {
            log.warn("[Checkpoint] Restore failed: {}", e.getMessage());
            return null;
        }
    }

    public void markThreadCompleted(Long tenantId, String threadId) {
        checkpointMapper.update(null, new LambdaUpdateWrapper<AgentCheckpoint>()
                .eq(AgentCheckpoint::getTenantId, tenantId)
                .eq(AgentCheckpoint::getThreadId, threadId)
                .eq(AgentCheckpoint::getStatus, "ACTIVE")
                .set(AgentCheckpoint::getStatus, "COMPLETED"));
    }

    public void markThreadFailed(Long tenantId, String threadId) {
        checkpointMapper.update(null, new LambdaUpdateWrapper<AgentCheckpoint>()
                .eq(AgentCheckpoint::getTenantId, tenantId)
                .eq(AgentCheckpoint::getThreadId, threadId)
                .eq(AgentCheckpoint::getStatus, "ACTIVE")
                .set(AgentCheckpoint::getStatus, "FAILED"));
    }

    public List<AgentCheckpoint> getCheckpointHistory(Long tenantId, String threadId) {
        return checkpointMapper.selectList(
                new LambdaQueryWrapper<AgentCheckpoint>()
                        .eq(AgentCheckpoint::getTenantId, tenantId)
                        .eq(AgentCheckpoint::getThreadId, threadId)
                        .orderByAsc(AgentCheckpoint::getStepIndex));
    }

    public int getCheckpointCount(Long tenantId, String threadId) {
        return checkpointMapper.countByThread(tenantId, threadId);
    }
}
