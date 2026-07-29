package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.fashion.supplychain.intelligence.entity.AiTaskTracker;
import com.fashion.supplychain.intelligence.mapper.AiTaskTrackerMapper;
import com.fashion.supplychain.common.UserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * AI任务追踪器 — 把AI"说"变成"做+追踪"。
 * 每次工具执行写操作时自动记录任务，定时检查完成状态。
 *
 * <p>P1-3 升级（2026-07-28）：A2A 协议任务追踪 Redis 持久化。
 * <ul>
 *   <li>任务状态双写：DB（持久化）+ Redis（快速查询，TTL 7 天）</li>
 *   <li>查询优先走 Redis，miss 时回查 DB 并回填 Redis</li>
 *   <li>支持按 sessionId / agentName 列出待办任务（多 Agent 协作核心能力）</li>
 *   <li>Redis 不可用时降级为纯 DB 模式（不影响业务）</li>
 * </ul>
 *
 * <p>多租户安全（P0 铁律 4）：Redis key 必含 tenantId，防止跨租户数据泄漏。
 */
@Component
@Lazy
@RequiredArgsConstructor
@Slf4j
public class TaskTrackerOrchestrator {

    private final AiTaskTrackerMapper mapper;

    /** P1-3：Redis 快速查询通道，TTL 7 天 */
    @Autowired(required = false)
    @Lazy
    private StringRedisTemplate redisTemplate;

    private static final ObjectMapper JSON = new ObjectMapper();

    /** Redis key 前缀，必含 tenantId 隔离（P0 铁律 4） */
    private static final String TASK_KEY_PREFIX = "agent:task:";

    /** 按 session 聚合的任务索引（用于多 Agent 协作列出待办） */
    private static final String SESSION_TASKS_PREFIX = "agent:session-tasks:";

    /** 按 agent 聚合的任务索引 */
    private static final String AGENT_TASKS_PREFIX = "agent:agent-tasks:";

    /** 任务 Redis TTL：7 天 */
    private static final long TASK_TTL_DAYS = 7;

    /**
     * 工具执行后记录追踪任务。
     * @return 任务ID，后续用于标记完成
     */
    public Long recordTask(String toolName, String taskType, String targetType,
                           String targetId, String summary, String assignedTo) {
        AiTaskTracker t = new AiTaskTracker()
                .setTenantId(UserContext.tenantId())
                .setTaskSourceTool(toolName)
                .setTaskType(taskType)
                .setTargetType(targetType)
                .setTargetId(targetId)
                .setTaskSummary(summary)
                .setStatus("PENDING")
                .setAssignedTo(assignedTo)
                .setCreatedAt(LocalDateTime.now());
        mapper.insert(t);
        log.info("[TaskTracker] {} → {}: {}", toolName, targetId, summary);

        // P1-3：双写 Redis（失败不阻塞主流程）
        cacheTaskToRedis(t);
        return t.getId();
    }

    /**
     * 标记任务完成。
     */
    public void completeTask(Long taskId, String resultSummary) {
        mapper.update(null, new UpdateWrapper<AiTaskTracker>()
                .set("status", "COMPLETED")
                .set("completed_at", LocalDateTime.now())
                .set("result_summary", resultSummary)
                .eq("id", taskId));
        log.info("[TaskTracker] 任务 #{} 完成: {}", taskId, resultSummary);

        // P1-3：同步更新 Redis
        updateTaskStatusInRedis(taskId, "COMPLETED", resultSummary);
    }

    /**
     * 定时扫描超时未完成的任务（默认超过24小时标记为EXPIRED）。
     */
    public void expireStaleTasks() {
        LocalDateTime threshold = LocalDateTime.now().minusHours(24);
        long count = mapper.selectCount(new QueryWrapper<AiTaskTracker>()
                .eq("status", "PENDING")
                .lt("created_at", threshold));
        if (count > 0) {
            mapper.update(null, new UpdateWrapper<AiTaskTracker>()
                    .set("status", "EXPIRED")
                    .eq("status", "PENDING")
                    .lt("created_at", threshold));
            log.warn("[TaskTracker] 超时过期任务: {} 条", count);

            // P1-3：同步 Redis 中相关任务状态（批量更新较复杂，这里仅清理可能过期的 session 索引）
            // 实际过期清理依赖 Redis TTL 自然过期，避免批量 DB→Redis 同步开销
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // P1-3：A2A 协议任务追踪 Redis 持久化
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 查询任务状态（Redis 优先，DB 兜底）。
     *
     * @param tenantId 租户ID（必填，多租户隔离）
     * @param taskId 任务ID
     * @return 任务对象；null 表示不存在
     */
    public AiTaskTracker getTask(Long tenantId, Long taskId) {
        if (tenantId == null || taskId == null) return null;

        // 1. 优先查 Redis
        AiTaskTracker cached = getTaskFromRedis(tenantId, taskId);
        if (cached != null) {
            return cached;
        }

        // 2. miss 时回查 DB
        AiTaskTracker task = mapper.selectOne(new QueryWrapper<AiTaskTracker>()
                .eq("id", taskId)
                .eq("tenant_id", tenantId));
        if (task != null) {
            // 回填 Redis
            cacheTaskToRedis(task);
        }
        return task;
    }

    /**
     * 列出会话内的所有待办任务（多 Agent 协作核心接口）。
     *
     * <p>A2A 协议场景：一个会话内多个 Sub-Agent 协作时，
     * 每个 Agent 完成自己的子任务后，通过本接口查看会话内是否还有其他待办。
     *
     * <p>注意：DB 表无 session_id 字段，会话内任务索引仅存 Redis。
     * Redis 不可用时返回空列表（业务侧应通过 bindTaskToSession 提前绑定）。
     *
     * @param tenantId 租户ID
     * @param sessionId 会话ID（agent 会话 ID）
     * @return 待办任务列表（PENDING 状态）
     */
    public List<AiTaskTracker> listPendingTasksBySession(Long tenantId, String sessionId) {
        if (tenantId == null || sessionId == null) return List.of();
        if (redisTemplate == null) return List.of();

        try {
            String indexKey = SESSION_TASKS_PREFIX + tenantId + ":" + sessionId;
            List<String> taskIds = redisTemplate.opsForList().range(indexKey, 0, -1);
            if (taskIds == null || taskIds.isEmpty()) return List.of();

            List<AiTaskTracker> tasks = new java.util.ArrayList<>();
            for (String tid : taskIds) {
                try {
                    Long taskId = Long.parseLong(tid);
                    AiTaskTracker t = getTaskFromRedis(tenantId, taskId);
                    // Redis miss 时回查 DB
                    if (t == null) {
                        t = mapper.selectOne(new QueryWrapper<AiTaskTracker>()
                                .eq("id", taskId)
                                .eq("tenant_id", tenantId));
                    }
                    if (t != null && "PENDING".equals(t.getStatus())) {
                        tasks.add(t);
                    }
                } catch (NumberFormatException e) {
                    log.warn("[TaskTracker] 解析任务ID失败: {}", e.getMessage());
                }
            }
            return tasks;
        } catch (Exception e) {
            log.debug("[TaskTracker] Redis 查询会话任务失败: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * 列出某 Agent 的待办任务。
     *
     * @param tenantId 租户ID
     * @param agentName Agent 名称
     * @return 待办任务列表
     */
    public List<AiTaskTracker> listPendingTasksByAgent(Long tenantId, String agentName) {
        if (tenantId == null || agentName == null) return List.of();
        return mapper.selectList(new QueryWrapper<AiTaskTracker>()
                .eq("tenant_id", tenantId)
                .eq("assigned_to", agentName)
                .eq("status", "PENDING")
                .orderByAsc("created_at"));
    }

    /**
     * 绑定任务到会话（多 Agent 协作时，记录任务属于哪个会话）。
     *
     * @param tenantId 租户ID
     * @param taskId 任务ID
     * @param sessionId 会话ID
     */
    public void bindTaskToSession(Long tenantId, Long taskId, String sessionId) {
        if (tenantId == null || taskId == null || sessionId == null) return;
        if (redisTemplate == null) return;
        try {
            String indexKey = SESSION_TASKS_PREFIX + tenantId + ":" + sessionId;
            redisTemplate.opsForList().rightPush(indexKey, String.valueOf(taskId));
            redisTemplate.expire(indexKey, TASK_TTL_DAYS, TimeUnit.DAYS);
        } catch (Exception e) {
            log.debug("[TaskTracker] 绑定任务到会话失败(不影响主流程): {}", e.getMessage());
        }
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Redis 内部辅助方法
    // ────────────────────────────────────────────────────────────────────────────

    /** 将任务写入 Redis（JSON 序列化） */
    private void cacheTaskToRedis(AiTaskTracker task) {
        if (redisTemplate == null || task == null || task.getId() == null || task.getTenantId() == null) return;
        try {
            String key = taskRedisKey(task.getTenantId(), task.getId());
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", task.getId());
            data.put("tenantId", task.getTenantId());
            data.put("taskSourceTool", task.getTaskSourceTool());
            data.put("taskType", task.getTaskType());
            data.put("targetType", task.getTargetType());
            data.put("targetId", task.getTargetId());
            data.put("taskSummary", task.getTaskSummary());
            data.put("status", task.getStatus());
            data.put("assignedTo", task.getAssignedTo());
            data.put("createdAt", task.getCreatedAt() != null ? task.getCreatedAt().toString() : "");
            data.put("completedAt", task.getCompletedAt() != null ? task.getCompletedAt().toString() : "");
            data.put("resultSummary", task.getResultSummary());

            redisTemplate.opsForValue().set(key, JSON.writeValueAsString(data), TASK_TTL_DAYS, TimeUnit.DAYS);
        } catch (Exception e) {
            log.debug("[TaskTracker] 写入 Redis 失败(不影响主流程): {}", e.getMessage());
        }
    }

    /** 从 Redis 读取任务 */
    private AiTaskTracker getTaskFromRedis(Long tenantId, Long taskId) {
        if (redisTemplate == null) return null;
        try {
            String key = taskRedisKey(tenantId, taskId);
            String json = redisTemplate.opsForValue().get(key);
            if (json == null || json.isBlank()) return null;

            @SuppressWarnings("unchecked")
            Map<String, Object> data = JSON.readValue(json, Map.class);
            AiTaskTracker t = new AiTaskTracker();
            t.setId(taskId);
            t.setTenantId(tenantId);
            t.setTaskSourceTool((String) data.get("taskSourceTool"));
            t.setTaskType((String) data.get("taskType"));
            t.setTargetType((String) data.get("targetType"));
            t.setTargetId((String) data.get("targetId"));
            t.setTaskSummary((String) data.get("taskSummary"));
            t.setStatus((String) data.get("status"));
            t.setAssignedTo((String) data.get("assignedTo"));
            String createdAtStr = (String) data.get("createdAt");
            if (createdAtStr != null && !createdAtStr.isBlank()) {
                try { t.setCreatedAt(LocalDateTime.parse(createdAtStr)); } catch (Exception e) {
                    log.warn("[TaskTracker] 解析创建时间失败: {}", e.getMessage());
                }
            }
            String completedAtStr = (String) data.get("completedAt");
            if (completedAtStr != null && !completedAtStr.isBlank()) {
                try { t.setCompletedAt(LocalDateTime.parse(completedAtStr)); } catch (Exception e) {
                    log.warn("[TaskTracker] 解析完成时间失败: {}", e.getMessage());
                }
            }
            t.setResultSummary((String) data.get("resultSummary"));
            return t;
        } catch (Exception e) {
            log.debug("[TaskTracker] 读取 Redis 失败(降级DB): {}", e.getMessage());
            return null;
        }
    }

    /** 更新 Redis 中任务状态 */
    private void updateTaskStatusInRedis(Long taskId, String status, String resultSummary) {
        if (redisTemplate == null || taskId == null) return;
        try {
            Long tenantId = UserContext.tenantId();
            if (tenantId == null) return;
            String key = taskRedisKey(tenantId, taskId);
            String json = redisTemplate.opsForValue().get(key);
            if (json == null) {
                // Redis miss — 不主动回填，等下次 getTask 时回查 DB
                return;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> data = new HashMap<>(JSON.readValue(json, Map.class));
            data.put("status", status);
            data.put("resultSummary", resultSummary != null ? resultSummary : "");
            data.put("completedAt", LocalDateTime.now().toString());
            redisTemplate.opsForValue().set(key, JSON.writeValueAsString(data), TASK_TTL_DAYS, TimeUnit.DAYS);
        } catch (Exception e) {
            log.debug("[TaskTracker] 更新 Redis 状态失败(不影响主流程): {}", e.getMessage());
        }
    }

    /** 生成 Redis key（必含 tenantId，P0 铁律 4） */
    private static String taskRedisKey(Long tenantId, Long taskId) {
        return TASK_KEY_PREFIX + tenantId + ":" + taskId;
    }
}
