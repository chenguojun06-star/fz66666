package com.fashion.supplychain.intelligence.agent.checkpoint;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.entity.AgentCheckpoint;
import com.fashion.supplychain.intelligence.mapper.AgentCheckpointMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@Lazy
@RequiredArgsConstructor
public class AgentCheckpointManager {

    private final AgentCheckpointMapper checkpointMapper;
    private static final ObjectMapper objectMapper = new ObjectMapper();

    // checkpoint 异步写入线程池（响应慢根因TOP4优化：每轮同步DB insert → 异步）
    private final ExecutorService checkpointExecutor = new ThreadPoolExecutor(
            2, 4, 30L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(128),
            r -> {
                Thread t = new Thread(r, "ai-checkpoint-" + System.identityHashCode(r) % 100);
                t.setDaemon(true);
                return t;
            },
            new ThreadPoolExecutor.DiscardOldestPolicy());

    public void saveCheckpoint(String threadId, Long tenantId, int iteration,
                                String action, String toolName, String toolResult,
                                int toolCallCount, long totalTokens) {
        // 异步写入，不阻塞 AgentLoop 主流程
        CompletableFuture.runAsync(() -> {
            try {
                Map<String, Object> state = new HashMap<>();
                state.put("action", action);
                state.put("toolName", toolName);
                state.put("toolResult", toolResult);
                state.put("toolCallCount", toolCallCount);
                state.put("totalTokens", totalTokens);

                Map<String, Object> metadata = new HashMap<>();
                metadata.put("iteration", iteration);

                AgentCheckpoint cp = new AgentCheckpoint();
                cp.setTenantId(tenantId);
                cp.setThreadId(threadId);
                cp.setNodeName(action);
                cp.setStateJson(objectMapper.writeValueAsString(state));
                cp.setMetadataJson(objectMapper.writeValueAsString(metadata));
                cp.setStepIndex(iteration);
                cp.setStatus("ACTIVE");
                cp.setCreatedAt(LocalDateTime.now());
                checkpointMapper.insert(cp);
            } catch (Exception e) {
                log.warn("[Checkpoint] 保存失败: thread={} action={}", threadId, action, e);
            }
        }, checkpointExecutor);
    }

    public AgentCheckpoint loadLatestCheckpoint(String threadId) {
        try {
            QueryWrapper<AgentCheckpoint> qw = new QueryWrapper<>();
            qw.eq("thread_id", threadId)
                .eq("status", "ACTIVE")
                .orderByDesc("step_index")
                .last("LIMIT 1");
            AgentCheckpoint cp = checkpointMapper.selectOne(qw);
            if (cp == null) return null;

            if (cp.getStateJson() != null && !cp.getStateJson().isBlank()) {
                @SuppressWarnings("unchecked")
                Map<String, Object> state = objectMapper.readValue(cp.getStateJson(), Map.class);
                cp.setAction((String) state.get("action"));
                cp.setToolName((String) state.get("toolName"));
                cp.setToolResult((String) state.get("toolResult"));
                if (state.get("totalTokens") instanceof Number) {
                    cp.setTotalTokens(((Number) state.get("totalTokens")).longValue());
                }
                if (state.get("toolCallCount") instanceof Number) {
                    cp.setToolCount(((Number) state.get("toolCallCount")).intValue());
                }
            }
            if (cp.getMetadataJson() != null && !cp.getMetadataJson().isBlank()) {
                @SuppressWarnings("unchecked")
                Map<String, Object> meta = objectMapper.readValue(cp.getMetadataJson(), Map.class);
                if (meta.get("iteration") instanceof Number) {
                    cp.setIteration(((Number) meta.get("iteration")).intValue());
                }
                if (meta.get("resumeCount") instanceof Number) {
                    cp.setResumeCount(((Number) meta.get("resumeCount")).intValue());
                } else {
                    cp.setResumeCount(0); // 默认0次恢复
                }
            } else {
                cp.setResumeCount(0); // 默认0次恢复
            }
            return cp;
        } catch (Exception e) {
            log.debug("[Checkpoint] 加载检查点跳过: thread={} error={}", threadId, e.getMessage());
            return null;
        }
    }

    public void deleteThreadCheckpoints(String threadId) {
        UpdateWrapper<AgentCheckpoint> uw = new UpdateWrapper<>();
        uw.eq("thread_id", threadId).set("status", "CLEANED");
        checkpointMapper.update(null, uw);
    }

    public List<AgentCheckpoint> scanIncompleteCheckpoints(Long tenantId) {
        QueryWrapper<AgentCheckpoint> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
          .eq("status", "ACTIVE")
          .orderByAsc("created_at");
        return checkpointMapper.selectList(qw);
    }

    public int countCheckpointsByStatus(String status) {
        QueryWrapper<AgentCheckpoint> qw = new QueryWrapper<>();
        qw.eq("status", status);
        return checkpointMapper.selectCount(qw).intValue();
    }

    public int countIncompleteCheckpoints(Long tenantId) {
        QueryWrapper<AgentCheckpoint> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId).eq("status", "ACTIVE");
        return checkpointMapper.selectCount(qw).intValue();
    }

    public void markCheckpointResumed(Long id, int currentResumeCount) {
        try {
            AgentCheckpoint cp = checkpointMapper.selectById(id);
            if (cp == null) return;

            // 更新metadata中的resumeCount
            Map<String, Object> meta = new HashMap<>();
            if (cp.getMetadataJson() != null && !cp.getMetadataJson().isBlank()) {
                @SuppressWarnings("unchecked")
                Map<String, Object> existingMeta = objectMapper.readValue(cp.getMetadataJson(), Map.class);
                meta.putAll(existingMeta);
            }
            meta.put("resumeCount", currentResumeCount + 1); // 增加恢复次数
            if (cp.getStepIndex() != null) {
                meta.put("iteration", cp.getStepIndex());
            }
            String metadataJson = objectMapper.writeValueAsString(meta);

            UpdateWrapper<AgentCheckpoint> uw = new UpdateWrapper<>();
            uw.eq("id", id).set("metadata_json", metadataJson);
            checkpointMapper.update(null, uw);
        } catch (Exception e) {
            log.warn("[Checkpoint] 标记恢复失败: id={}", id, e);
        }
    }
}