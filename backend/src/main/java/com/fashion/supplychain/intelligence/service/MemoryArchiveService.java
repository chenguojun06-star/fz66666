package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.intelligence.entity.AiConversationMemory;
import com.fashion.supplychain.intelligence.mapper.AiConversationMemoryMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * L5 归档记忆服务（五层记忆模型第五章）。
 *
 * <p>核心能力：
 * <ul>
 *   <li>{@link #archiveOldMemories} — 每天 03:30 归档 6 个月+ 的 t_ai_conversation_memory 到 Qdrant</li>
 *   <li>{@link #searchArchival} — 向量搜索召回冷数据（用户问"之前/历史/上次"时触发）</li>
 * </ul>
 *
 * <p>设计原则：
 * <ul>
 *   <li>多租户隔离（P0 铁律 4）：所有查询带 tenant_id WHERE，Qdrant payload 必含 tenant_id</li>
 *   <li>降级安全（P0 铁律）：QdrantService 不可用时降级到只软删除 PostgreSQL，不写 Qdrant</li>
 *   <li>分批处理：每批 200 条，单条失败不影响其他条（方法内 try-catch 逐条保护）</li>
 *   <li>软删除优先：PostgreSQL 原记录 delete_flag=1，保留 7 天兜底（由 purgeJob 硬删除）</li>
 * </ul>
 *
 * <p>事务边界说明（P0 铁律 #2 合规）：
 * 归档任务是定时任务，无 Orchestrator 层。batchArchive 方法内逐条 try-catch 保护，
 * 单条失败不影响其他条，无需声明式事务（@Transactional 仅允许在 Orchestrator 层）。
 *
 * <p>V1 实现说明：
 * 当前复用 QdrantService 的 fashion_memory collection，通过 payload.memory_type=archival_conversation
 * 区分冷热数据。未来可升级为独立 archival_memory_{tenantId} collection（设计文档第五章）。
 */
@Slf4j
@Service
@Lazy
public class MemoryArchiveService {

    private static final int ARCHIVE_BATCH_SIZE = 200;
    private static final int ARCHIVE_MONTHS = 6;
    private static final String MEMORY_TYPE_ARCHIVAL = "archival_conversation";

    @Autowired
    private AiConversationMemoryMapper conversationMemoryMapper;

    /** Qdrant 向量库（可选依赖，不可用时降级到只软删除） */
    @Autowired(required = false)
    private QdrantService qdrantService;

    /**
     * 每天 03:30 归档 6 个月+ 的对话记忆到 Qdrant。
     *
     * <p>流程：
     * <ol>
     *   <li>查询 t_ai_conversation_memory 中 create_time &lt; NOW() - 6 MONTH 且 delete_flag=0 的记录</li>
     *   <li>分批（每批 200 条）处理：写入 Qdrant + 软删除 PostgreSQL</li>
     *   <li>Qdrant 不可用时只软删除（降级）</li>
     * </ol>
     */
    @Scheduled(cron = "0 30 3 * * ?")
    public void archiveOldMemories() {
        log.info("[L5-Archive] 开始归档 {} 个月+ 的对话记忆", ARCHIVE_MONTHS);
        int totalArchived = 0;
        int totalFailed = 0;
        try {
            LocalDateTime cutoff = LocalDateTime.now().minusMonths(ARCHIVE_MONTHS);
            // 分批查询 + 归档，直到没有更多记录
            while (true) {
                List<AiConversationMemory> batch = conversationMemoryMapper.selectList(
                        new LambdaQueryWrapper<AiConversationMemory>()
                                .lt(AiConversationMemory::getCreateTime, cutoff)
                                .eq(AiConversationMemory::getDeleteFlag, 0)
                                .orderByAsc(AiConversationMemory::getCreateTime)
                                .last("LIMIT " + ARCHIVE_BATCH_SIZE));
                if (batch == null || batch.isEmpty()) break;

                try {
                    int archived = batchArchive(batch);
                    totalArchived += archived;
                } catch (Exception e) {
                    totalFailed += batch.size();
                    log.warn("[L5-Archive] 批次归档失败（不影响其他批）: {}", e.getMessage());
                }
            }
            log.info("[L5-Archive] 归档完成，成功 {} 条，失败 {} 条", totalArchived, totalFailed);
        } catch (Exception e) {
            log.error("[L5-Archive] 归档任务异常: {}", e.getMessage(), e);
        }
    }

    /**
     * 单批归档（逐条 try-catch 保护，单条失败不影响其他条）。
     *
     * <p>事务边界说明（P0 铁律 #2 合规）：归档是定时任务无 Orchestrator 层，
     * 方法内逐条 try-catch 保护，无需声明式事务。
     */
    public int batchArchive(List<AiConversationMemory> batch) {
        if (batch == null || batch.isEmpty()) return 0;
        boolean qdrantAvailable = isQdrantAvailable();
        int archived = 0;
        for (AiConversationMemory mem : batch) {
            try {
                if (qdrantAvailable && mem.getTenantId() != null) {
                    archiveToQdrant(mem);
                }
                // 软删除 PostgreSQL 原记录（delete_flag=1，保留 7 天兜底由 purgeJob 硬删除）
                conversationMemoryMapper.update(null,
                        new LambdaUpdateWrapper<AiConversationMemory>()
                                .eq(AiConversationMemory::getId, mem.getId())
                                .eq(AiConversationMemory::getTenantId, mem.getTenantId())
                                .set(AiConversationMemory::getDeleteFlag, 1));
                archived++;
            } catch (Exception e) {
                log.warn("[L5-Archive] 单条归档失败 id={}: {}", mem.getId(), e.getMessage());
            }
        }
        return archived;
    }

    /**
     * 向量搜索召回冷数据（多租户隔离）。
     *
     * @param tenantId 租户ID（必填，P0 铁律 4）
     * @param query    查询文本
     * @param topK     返回条数
     * @return 召回的归档记忆列表（可能为空，不返回 null）
     */
    public List<ArchivalMemoryHit> searchArchival(Long tenantId, String query, int topK) {
        if (tenantId == null || query == null || query.isBlank()) return Collections.emptyList();
        if (!isQdrantAvailable()) return Collections.emptyList();
        try {
            List<QdrantService.ScoredPoint> hits = qdrantService.search(tenantId, query, topK * 2);
            if (hits == null || hits.isEmpty()) return Collections.emptyList();
            // 过滤出归档记忆（memory_type=archival_conversation），限制 topK
            List<ArchivalMemoryHit> result = new ArrayList<>();
            for (QdrantService.ScoredPoint sp : hits) {
                Map<String, String> payload = sp.getPayload();
                if (payload == null) continue;
                if (!MEMORY_TYPE_ARCHIVAL.equals(payload.get("memory_type"))) continue;
                ArchivalMemoryHit hit = new ArchivalMemoryHit();
                hit.setSummary(payload.getOrDefault("summary", ""));
                hit.setCreateTime(payload.get("create_time"));
                hit.setScore(sp.getScore());
                hit.setOriginalId(payload.get("original_id"));
                result.add(hit);
                if (result.size() >= topK) break;
            }
            return result;
        } catch (Exception e) {
            log.warn("[L5-Archive] searchArchival 失败 tenantId={}: {}", tenantId, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 检查 Qdrant 是否可用。
     */
    private boolean isQdrantAvailable() {
        if (qdrantService == null) return false;
        try {
            return qdrantService.isAvailable();
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 将单条对话记忆归档到 Qdrant（复用 fashion_memory collection，payload 标记 memory_type）。
     */
    private void archiveToQdrant(AiConversationMemory mem) {
        String pointId = "archival_" + mem.getId();
        String content = buildArchiveContent(mem);
        Map<String, Object> payload = new HashMap<>();
        payload.put("memory_type", MEMORY_TYPE_ARCHIVAL);
        payload.put("original_id", String.valueOf(mem.getId()));
        payload.put("summary", mem.getMemorySummary() != null ? mem.getMemorySummary() : "");
        payload.put("create_time", mem.getCreateTime() != null ? mem.getCreateTime().toString() : "");
        payload.put("user_id", mem.getUserId() != null ? mem.getUserId() : "");
        payload.put("key_entities", mem.getKeyEntities() != null ? mem.getKeyEntities() : "");
        qdrantService.upsertVector(pointId, mem.getTenantId(), content, payload);
    }

    /**
     * 构建归档内容（用于生成向量）。
     */
    private String buildArchiveContent(AiConversationMemory mem) {
        StringBuilder sb = new StringBuilder();
        if (mem.getMemorySummary() != null) sb.append(mem.getMemorySummary());
        if (mem.getKeyEntities() != null && !mem.getKeyEntities().isBlank()) {
            sb.append(" 实体: ").append(mem.getKeyEntities());
        }
        if (mem.getUserMessage() != null && !mem.getUserMessage().isBlank()) {
            sb.append(" 用户问: ").append(mem.getUserMessage());
        }
        return sb.length() == 0 ? "empty" : sb.toString();
    }

    /**
     * 归档记忆命中结果 DTO。
     */
    @Data
    public static class ArchivalMemoryHit {
        /** 原始记录 ID */
        private String originalId;
        /** 记忆摘要 */
        private String summary;
        /** 创建时间（字符串形式） */
        private String createTime;
        /** 相似度评分 */
        private float score;
    }
}
