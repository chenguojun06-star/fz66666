package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.ConsolidationResult;
import com.fashion.supplychain.intelligence.service.MemoryConsolidationService;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 离线记忆巩固定时任务（P1-5 Cognee 离线巩固方向）。
 *
 * <p><b>每天 03:30 执行</b>（避开 04:00 的 SharedAgentMemoryCleanupJob），
 * 遍历活跃租户，调用 {@link MemoryConsolidationService#consolidateForTenant}
 * 合并相似事实记忆，生成"精华版"记忆，提升 L3 长期记忆的检索质量。</p>
 *
 * <p><b>容量保护</b>：每次最多处理 100 个租户 × 20 组 = 2000 次合并，避免任务过长。</p>
 *
 * <p><b>异常隔离</b>：巩固失败仅 log.warn，不影响主流程（参考 Cognee 离线巩固的容错设计）。</p>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Slf4j
@Component
@Lazy
public class MemoryConsolidationJob {

    /** 单次最多处理的租户数（容量保护） */
    private static final int MAX_TENANTS_PER_RUN = 100;

    @Autowired
    private MemoryConsolidationService memoryConsolidationService;

    @Autowired(required = false)
    private ProcessStatsEngine processStatsEngine;

    /**
     * 每日 03:30 执行离线记忆巩固。
     *
     * <p>流程：
     * <ol>
     *   <li>获取活跃租户列表（最多 100 个）</li>
     *   <li>逐租户设置 UserContext（多租户隔离，P0 铁律 #4）</li>
     *   <li>调用 Service 执行巩固，汇总结果</li>
     * </ol>
     */
    @Scheduled(cron = "0 30 3 * * ?")
    public void consolidateMemories() {
        log.info("[MemoryConsolidationJob] ===== 开始离线记忆巩固 =====");

        List<Long> tenants = null;
        try {
            if (processStatsEngine != null) {
                tenants = processStatsEngine.findActiveTenantIds();
            }
        } catch (Exception e) {
            log.warn("[MemoryConsolidationJob] 获取活跃租户失败(不影响主流程): {}", e.getMessage());
        }

        if (tenants == null || tenants.isEmpty()) {
            log.info("[MemoryConsolidationJob] 无活跃租户，跳过");
            return;
        }

        int tenantsProcessed = 0;
        int totalGroups = 0;
        int totalMerged = 0;

        for (Long tenantId : tenants) {
            if (tenantId == null) {
                continue;
            }
            if (tenantsProcessed >= MAX_TENANTS_PER_RUN) {
                log.info("[MemoryConsolidationJob] 已达单次最大租户数 {}，停止处理", MAX_TENANTS_PER_RUN);
                break;
            }

            UserContext previous = UserContext.get();
            try {
                UserContext ctx = new UserContext();
                ctx.setTenantId(tenantId);
                ctx.setUsername("system");
                ctx.setUserId("system");
                UserContext.set(ctx);

                ConsolidationResult result = memoryConsolidationService.consolidateForTenant(tenantId);
                tenantsProcessed++;
                totalGroups += result.getGroupsProcessed();
                totalMerged += result.getMemoriesMerged();

                if (result.getMemoriesMerged() > 0) {
                    log.info("[MemoryConsolidationJob] 租户 {} 巩固完成: 扫描 {} 条，处理 {} 组，合并 {} 条",
                            tenantId, result.getTotalScanned(),
                            result.getGroupsProcessed(), result.getMemoriesMerged());
                }
            } catch (Exception e) {
                log.warn("[MemoryConsolidationJob] 租户 {} 巩固异常(不影响主流程): {}",
                        tenantId, e.getMessage());
            } finally {
                if (previous != null) {
                    UserContext.set(previous);
                } else {
                    UserContext.clear();
                }
            }
        }

        log.info("[MemoryConsolidationJob] ===== 离线记忆巩固完成: 租户 {} / 组 {} / 合并 {} 条 =====",
                tenantsProcessed, totalGroups, totalMerged);
    }
}
