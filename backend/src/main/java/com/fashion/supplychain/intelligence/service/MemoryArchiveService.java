package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.lock.DistributedLockService;
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
import java.util.concurrent.TimeUnit;

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

    /**
     * 【P2-3修复】任务开关，默认 true（不影响现有行为）。
     * 运维可通过 yml/env 关闭：xiaoyun.memory.archive.enabled=false
     */
    @org.springframework.beans.factory.annotation.Value("${xiaoyun.memory.archive.enabled:true}")
    private boolean archiveEnabled;

    @Autowired
    private AiConversationMemoryMapper conversationMemoryMapper;

    /** Qdrant 向量库（可选依赖，不可用时降级到只软删除） */
    @Autowired(required = false)
    private QdrantService qdrantService;

    @Autowired
    private DistributedLockService distributedLockService;

    /**
     * 每天 03:45 归档 6 个月+ 的对话记忆到 Qdrant。
     *
     * <p>【P1-5修复】原 03:30 与 SelfDrillOrchestrator 同时执行，DB连接池瞬时双倍压力。
     * 错峰到 03:45，与 03:30 的 SelfDrill 错开 15 分钟，避免 DB/Qdrant 资源争抢。
     *
     * <p>凌晨cron错峰时间表（03:00-05:00 区间）：
     * <ul>
     *   <li>03:15 DatabaseHealthCheckJob</li>
     *   <li>03:20 WorkerProfileOrchestrator</li>
     *   <li>03:30 SelfDrillOrchestrator</li>
     *   <li>03:40 OrderLearningRefreshJob</li>
     *   <li>03:45 MemoryArchiveService（本任务）</li>
     *   <li>04:00 SystemDoctorPatrolJob</li>
     *   <li>04:15 SharedAgentMemoryService</li>
     *   <li>04:20 GepaPromptOptimizer</li>
     *   <li>04:30 AiSelfEvolutionJob</li>
     *   <li>04:45 MemoryNudgeOrchestrator</li>
     * </ul>
     *
     * <p>流程：
     * <ol>
     *   <li>查询 t_ai_conversation_memory 中 create_time &lt; NOW() - 6 MONTH 且 delete_flag=0 的记录</li>
     *   <li>分批（每批 200 条）处理：写入 Qdrant + 软删除 PostgreSQL</li>
     *   <li>Qdrant 不可用时只软删除（降级）</li>
     * </ol>
     */
    @Scheduled(cron = "0 45 3 * * ?")
    public void archiveOldMemories() {
        if (!archiveEnabled) {
            log.debug("[L5-Archive] 已禁用（xiaoyun.memory.archive.enabled=false）");
            return;
        }
        String lockValue = distributedLockService.tryLock(
                "job:memory-archive", 30, TimeUnit.MINUTES);
        if (lockValue == null) {
            log.info("[L5-Archive] 未获取到分布式锁，跳过本次执行");
            return;
        }
        try {
            log.info("[L5-Archive] 开始归档 {} 个月+ 的对话记忆", ARCHIVE_MONTHS);
            int totalArchived = 0;
            int totalFailed = 0;
            try {
                LocalDateTime cutoff = LocalDateTime.now().minusMonths(ARCHIVE_MONTHS);
                // 分批查询 + 归档，直到没有更多记录
                boolean degraded = false;
                while (true) {
                    List<AiConversationMemory> batch;
                    if (!degraded) {
                        try {
                            // 优先使用 MyBatis-Plus selectList（SELECT *，含全部字段）
                            batch = conversationMemoryMapper.selectList(
                                    new LambdaQueryWrapper<AiConversationMemory>()
                                            .lt(AiConversationMemory::getCreateTime, cutoff)
                                            .eq(AiConversationMemory::getDeleteFlag, 0)
                                            .orderByAsc(AiConversationMemory::getCreateTime)
                                            .last("LIMIT " + ARCHIVE_BATCH_SIZE));
                        } catch (Exception selectError) {
                            // 降级：云端数据库可能因 Flyway 迁移未完整执行导致 user_message/
                            // ai_response/feedback_score/feedback_reason 字段缺失，
                            // MyBatis-Plus selectList（SELECT *）会触发 Unknown column 错误。
                            // 降级到只查询归档必需字段（显式列名，不依赖新增字段）。
                            // ★关键修复：设置 degraded=true 后，后续批次直接走降级查询，
                            // 不再重复尝试 selectList 抛异常（避免N批→N次异常的性能灾难）。
                            log.warn("[L5-Archive] selectList 失败，降级到必需字段查询（后续批次直接降级，不再重试selectList）。根因: {}",
                                    selectError.getMessage());
                            degraded = true;
                            batch = conversationMemoryMapper.findArchivableBatchDegraded(
                                    cutoff, ARCHIVE_BATCH_SIZE);
                        }
                    } else {
                        // 已进入降级模式，后续批次直接使用降级查询（避免重复抛异常）
                        batch = conversationMemoryMapper.findArchivableBatchDegraded(
                                cutoff, ARCHIVE_BATCH_SIZE);
                    }
                    if (batch == null || batch.isEmpty()) break;

                    try {
                        int archived = batchArchive(batch);
                        totalArchived += archived;
                    } catch (Exception e) {
                        totalFailed += batch.size();
                        log.warn("[L5-Archive] 批次归档失败（不影响其他批）: {}", e.getMessage());
                    }
                }
                log.info("[L5-Archive] 归档完成，成功 {} 条，失败 {} 条{}",
                        totalArchived, totalFailed,
                        degraded ? "（降级模式）" : "");
            } catch (Exception e) {
                // 记录完整堆栈（含 Cause），便于排查根因
                log.error("[L5-Archive] 归档任务异常: {}", e.getMessage(), e);
                Throwable cause = e.getCause();
                while (cause != null) {
                    log.error("[L5-Archive]   Caused by: {}", cause.getMessage());
                    cause = cause.getCause();
                }
            }
        } finally {
            distributedLockService.unlock("job:memory-archive", lockValue);
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
                // 注意：只用 id（主键）作为条件，避免 tenant_id=NULL 时删除失败
                conversationMemoryMapper.update(null,
                        new LambdaUpdateWrapper<AiConversationMemory>()
                                .eq(AiConversationMemory::getId, mem.getId())
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
     * P3-3：分级智能召回（优先 HOT 层，不足时扩展 WARM/COLD）。
     *
     * <p>调用 QdrantService.searchArchivalSmart，按访问频率分级召回：
     * <ul>
     *   <li>第1轮：仅搜 HOT 层（6 个月~1 年）</li>
     *   <li>第2轮：HOT 不足时扩展到 HOT+WARM（1~2 年）</li>
     *   <li>第3轮：仍不足且 includeCold=true 时全量搜索（含 2 年+）</li>
     * </ul>
     *
     * @param tenantId    租户ID（必填）
     * @param query       查询文本
     * @param topK        返回条数
     * @param includeCold 是否最终兜底到 COLD 层
     * @return 召回的归档记忆列表（可能为空，不返回 null）
     */
    public List<ArchivalMemoryHit> searchArchivalSmart(Long tenantId, String query, int topK,
                                                        boolean includeCold) {
        if (tenantId == null || query == null || query.isBlank()) return Collections.emptyList();
        if (!isQdrantAvailable()) return Collections.emptyList();
        try {
            List<QdrantService.ScoredPoint> hits = qdrantService.searchArchivalSmart(
                    tenantId, query, topK, null, null, includeCold);
            if (hits == null || hits.isEmpty()) return Collections.emptyList();

            List<ArchivalMemoryHit> result = new ArrayList<>();
            for (QdrantService.ScoredPoint sp : hits) {
                Map<String, String> payload = sp.getPayload();
                if (payload == null) continue;
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
            log.warn("[L5-Archive] searchArchivalSmart 失败 tenantId={}: {}", tenantId, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * P3-3：统计租户归档数据的分级分布。
     *
     * @return Map：tier 名 → 计数；空 Map 表示 Qdrant 不可用
     */
    public Map<String, Long> countArchivalByTier(Long tenantId) {
        if (tenantId == null || !isQdrantAvailable()) return Collections.emptyMap();
        try {
            return qdrantService.countArchivalByTier(tenantId);
        } catch (Exception e) {
            log.warn("[L5-Archive] countArchivalByTier 失败 tenantId={}: {}", tenantId, e.getMessage());
            return Collections.emptyMap();
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
     * 将单条对话记忆归档到 Qdrant（写入独立 archival_memory_{tenantId} collection）。
     */
    private void archiveToQdrant(AiConversationMemory mem) {
        String originalId = String.valueOf(mem.getId());
        String summary = mem.getMemorySummary() != null ? mem.getMemorySummary() : "";
        String keyEntities = mem.getKeyEntities() != null ? mem.getKeyEntities() : "";
        String createTime = mem.getCreateTime() != null ? mem.getCreateTime().toString() : "";
        qdrantService.upsertArchivalTiered(mem.getTenantId(), originalId, MEMORY_TYPE_ARCHIVAL,
                summary, keyEntities, createTime, null);
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
