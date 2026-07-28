package com.fashion.supplychain.intelligence.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiConversationMemory;
import com.fashion.supplychain.intelligence.entity.AiLongMemory;
import com.fashion.supplychain.intelligence.mapper.AiConversationMemoryMapper;
import com.fashion.supplychain.intelligence.mapper.AiLongMemoryMapper;
import com.fashion.supplychain.intelligence.service.QdrantService;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import java.time.LocalDateTime;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * L5 Archival Memory 归档定时任务（P1-1）。
 *
 * <p><b>每天 04:00 执行</b>，将 6 个月+ 的旧记忆归档到 Qdrant 独立 collection
 * ({@code archival_memory_{tenantId}})，避免 PostgreSQL 热表膨胀。
 *
 * <p>归档策略（参考 five-layer-memory-design.md 第五章）：
 * <ol>
 *   <li>查询 6 个月+ 的 t_ai_conversation_memory 和 t_ai_long_memory（分批，每批 200 条）</li>
 *   <li>调用 {@link QdrantService#upsertArchival} 写入租户专属 collection</li>
 *   <li>软删除原记录（delete_flag=1，保留 7 天兜底）</li>
 *   <li>7 天后由 archivePurgeJob 硬删除（本任务不实现，避免一次性删错）</li>
 * </ol>
 *
 * <p><b>多租户安全</b>（P0 铁律 4）：
 * <ul>
 *   <li>每个租户独立 collection（archival_memory_{tenantId}）</li>
 *   <li>归档前设置 UserContext，确保租户上下文正确</li>
 *   <li>QdrantService 内部强制 tenant_id payload 过滤</li>
 * </ul>
 *
 * <p><b>容错设计</b>：
 * <ul>
 *   <li>Qdrant 不可用时跳过归档（不影响业务）</li>
 *   <li>单租户归档失败仅 log.warn，不影响其他租户</li>
 *   <li>软删除保留 7 天兜底，硬删除由独立任务执行</li>
 * </ul>
 *
 * @author xiaoyun
 * @since 2026-07-28
 */
@Slf4j
@Component
@Lazy
public class MemoryArchiveJob {

    /** 单租户单次最多归档条数（容量保护） */
    private static final int BATCH_SIZE = 200;

    /** 单次最多处理的租户数 */
    private static final int MAX_TENANTS_PER_RUN = 50;

    /** 归档阈值：6 个月前 */
    private static final int ARCHIVAL_THRESHOLD_MONTHS = 6;

    @Value("${xiaoyun.job.memory-archive.enabled:true}")
    private boolean enabled;

    @Autowired
    private AiConversationMemoryMapper conversationMemoryMapper;

    @Autowired
    private AiLongMemoryMapper longMemoryMapper;

    @Autowired(required = false)
    private QdrantService qdrantService;

    @Autowired(required = false)
    private ProcessStatsEngine processStatsEngine;

    /**
     * 每天 04:00 执行归档（错开 03:30 的 MemoryConsolidationJob）。
     */
    @Scheduled(cron = "0 0 4 * * ?")
    public void archiveOldMemories() {
        if (!enabled) {
            log.debug("[MemoryArchiveJob] 已禁用");
            return;
        }
        if (qdrantService == null) {
            log.debug("[MemoryArchiveJob] QdrantService 未启用，跳过归档");
            return;
        }

        log.info("[MemoryArchiveJob] ===== 开始 L5 归档 =====");

        List<Long> tenants = findActiveTenants();
        if (tenants == null || tenants.isEmpty()) {
            log.info("[MemoryArchiveJob] 无活跃租户，跳过");
            return;
        }

        LocalDateTime threshold = LocalDateTime.now().minusMonths(ARCHIVAL_THRESHOLD_MONTHS);
        int tenantsProcessed = 0;
        int totalConversationArchived = 0;
        int totalLongMemoryArchived = 0;

        for (Long tenantId : tenants) {
            if (tenantId == null) continue;
            if (tenantsProcessed >= MAX_TENANTS_PER_RUN) {
                log.info("[MemoryArchiveJob] 已达单次最大租户数 {}，停止处理", MAX_TENANTS_PER_RUN);
                break;
            }

            UserContext previous = UserContext.get();
            try {
                UserContext ctx = new UserContext();
                ctx.setTenantId(tenantId);
                ctx.setUsername("system");
                ctx.setUserId("system");
                UserContext.set(ctx);

                int conv = archiveConversationMemories(tenantId, threshold);
                int long_ = archiveLongMemories(tenantId, threshold);

                tenantsProcessed++;
                totalConversationArchived += conv;
                totalLongMemoryArchived += long_;

                if (conv > 0 || long_ > 0) {
                    log.info("[MemoryArchiveJob] 租户 {} 归档完成: 会话摘要 {} 条, 长期记忆 {} 条",
                            tenantId, conv, long_);
                }
            } catch (Exception e) {
                log.warn("[MemoryArchiveJob] 租户 {} 归档异常(不影响其他租户): {}",
                        tenantId, e.getMessage());
            } finally {
                if (previous != null) {
                    UserContext.set(previous);
                } else {
                    UserContext.clear();
                }
            }
        }

        log.info("[MemoryArchiveJob] ===== L5 归档完成: 租户 {} / 会话摘要 {} / 长期记忆 {} 条 =====",
                tenantsProcessed, totalConversationArchived, totalLongMemoryArchived);
    }

    /** 归档 t_ai_conversation_memory 中 6 个月+ 的记录 */
    private int archiveConversationMemories(Long tenantId, LocalDateTime threshold) {
        LambdaQueryWrapper<AiConversationMemory> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AiConversationMemory::getTenantId, tenantId)
                .lt(AiConversationMemory::getCreateTime, threshold)
                .eq(AiConversationMemory::getDeleteFlag, 0)
                .last("LIMIT " + BATCH_SIZE);

        List<AiConversationMemory> records = conversationMemoryMapper.selectList(wrapper);
        if (records == null || records.isEmpty()) return 0;

        int archived = 0;
        for (AiConversationMemory mem : records) {
            try {
                boolean ok = qdrantService.upsertArchival(
                        tenantId,
                        String.valueOf(mem.getId()),
                        "conversation_summary",
                        mem.getMemorySummary() != null ? mem.getMemorySummary() : "",
                        mem.getUserId() != null ? "{\"userId\":\"" + mem.getUserId() + "\"}" : "",
                        mem.getCreateTime() != null ? mem.getCreateTime().toString() : "");
                if (ok) {
                    // 软删除原记录
                    mem.setDeleteFlag(1);
                    conversationMemoryMapper.updateById(mem);
                    archived++;
                }
            } catch (Exception e) {
                log.debug("[MemoryArchiveJob] 会话摘要归档失败 id={}: {}", mem.getId(), e.getMessage());
            }
        }
        return archived;
    }

    /** 归档 t_ai_long_memory 中 6 个月+ 的记录 */
    private int archiveLongMemories(Long tenantId, LocalDateTime threshold) {
        LambdaQueryWrapper<AiLongMemory> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AiLongMemory::getTenantId, tenantId)
                .lt(AiLongMemory::getCreateTime, threshold)
                .eq(AiLongMemory::getDeleteFlag, 0)
                .last("LIMIT " + BATCH_SIZE);

        List<AiLongMemory> records = longMemoryMapper.selectList(wrapper);
        if (records == null || records.isEmpty()) return 0;

        int archived = 0;
        for (AiLongMemory mem : records) {
            try {
                String memoryType = "long_" + (mem.getLayer() != null ? mem.getLayer().toLowerCase() : "fact");
                boolean ok = qdrantService.upsertArchival(
                        tenantId,
                        mem.getMemoryUid() != null ? mem.getMemoryUid() : String.valueOf(mem.getId()),
                        memoryType,
                        mem.getContent() != null ? mem.getContent() : "",
                        buildKeyEntitiesJson(mem),
                        mem.getCreateTime() != null ? mem.getCreateTime().toString() : "");
                if (ok) {
                    mem.setDeleteFlag(1);
                    longMemoryMapper.updateById(mem);
                    archived++;
                }
            } catch (Exception e) {
                log.debug("[MemoryArchiveJob] 长期记忆归档失败 id={}: {}", mem.getId(), e.getMessage());
            }
        }
        return archived;
    }

    private String buildKeyEntitiesJson(AiLongMemory mem) {
        StringBuilder sb = new StringBuilder("{");
        if (mem.getSubjectType() != null) sb.append("\"subjectType\":\"").append(mem.getSubjectType()).append("\"");
        if (mem.getSubjectId() != null) sb.append(",\"subjectId\":\"").append(mem.getSubjectId()).append("\"");
        if (mem.getSubjectName() != null) sb.append(",\"subjectName\":\"").append(mem.getSubjectName()).append("\"");
        if (mem.getSourceUserId() != null) sb.append(",\"userId\":\"").append(mem.getSourceUserId()).append("\"");
        sb.append("}");
        return sb.toString();
    }

    private List<Long> findActiveTenants() {
        if (processStatsEngine == null) return List.of();
        try {
            return processStatsEngine.findActiveTenantIds();
        } catch (Exception e) {
            log.warn("[MemoryArchiveJob] 获取活跃租户失败: {}", e.getMessage());
            return List.of();
        }
    }
}
