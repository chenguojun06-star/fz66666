package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.intelligence.orchestration.KnowledgeGraphOrchestrator;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 知识图谱构建定时任务（P0-KG1）。
 *
 * <p><b>问题背景</b>：{@link com.fashion.supplychain.intelligence.orchestration.kg.KnowledgeGraphFiller}
 * 仅提供单点关系记录方法，无任何调用方，也无定时任务驱动全量构建，导致知识图谱长期为空，
 * GraphRAG 检索失效。
 *
 * <p><b>每天 03:00 执行</b>，遍历所有活跃租户，调用
 * {@link KnowledgeGraphOrchestrator#buildGraphFromBusinessData(Long)} 从业务数据
 * （订单/款式/工序/工厂/供应商/物料）全量构建知识图谱实体与关系。
 *
 * <p><b>多租户安全</b>（P0 铁律 4）：
 * <ul>
 *   <li>按租户隔离迭代，单租户构建失败仅 log.warn，不影响其他租户</li>
 *   <li>{@code buildGraphFromBusinessData} 内部自设置 UserContext 并强制 tenant_id 过滤</li>
 * </ul>
 *
 * <p><b>容错设计</b>：
 * <ul>
 *   <li>分布式锁 {@code job:knowledge-graph-build} 防止多实例重复构建</li>
 *   <li>单次最多处理 {@value #MAX_TENANTS_PER_RUN} 个租户，避免单次任务过长</li>
 *   <li>{@code buildGraphFromBusinessData} 为 {@code @Async}，提交后异步执行，不阻塞定时任务线程</li>
 * </ul>
 *
 * <p>事务边界说明（P0 铁律 #2 合规）：本任务仅编排调用，无直接数据库写操作；
 * 实际写入由 {@link KnowledgeGraphOrchestrator}（Orchestrator 层）负责。
 *
 * @author xiaoyun
 * @since 2026-08-01
 */
@Slf4j
@Service
@Lazy
public class KnowledgeGraphBuildJob {

    /** 单次最多处理的租户数（容量保护，避免单次任务过长） */
    private static final int MAX_TENANTS_PER_RUN = 50;

    @Value("${xiaoyun.kg.build.enabled:true}")
    private boolean enabled;

    @Autowired
    private KnowledgeGraphOrchestrator knowledgeGraphOrchestrator;

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    @Autowired
    private DistributedLockService distributedLockService;

    /**
     * 每天 03:00 全量构建知识图谱。
     *
     * <p>错峰说明：避开 03:15 DatabaseHealthCheckJob、03:30 SelfDrill、03:45 MemoryArchive、
     * 04:00+ 其他归档任务，选择 03:00 空闲时段执行。
     */
    @Scheduled(cron = "0 0 3 * * ?")
    public void buildKnowledgeGraph() {
        if (!enabled) {
            log.debug("[KnowledgeGraphBuildJob] 已禁用（xiaoyun.kg.build.enabled=false）");
            return;
        }

        String lockValue = distributedLockService.tryLock(
                "job:knowledge-graph-build", 2, TimeUnit.HOURS);
        if (lockValue == null) {
            log.info("[KnowledgeGraphBuildJob] 未获取到分布式锁，跳过本次执行");
            return;
        }

        try {
            List<Long> tenants = findActiveTenants();
            if (tenants == null || tenants.isEmpty()) {
                log.info("[KnowledgeGraphBuildJob] 无活跃租户，跳过");
                return;
            }

            log.info("[KnowledgeGraphBuildJob] ===== 开始构建知识图谱，活跃租户 {} 个 =====",
                    tenants.size());

            int submitted = 0;
            int skipped = 0;
            for (Long tenantId : tenants) {
                if (tenantId == null) continue;
                if (submitted >= MAX_TENANTS_PER_RUN) {
                    log.info("[KnowledgeGraphBuildJob] 已达单次最大租户数 {}，停止提交",
                            MAX_TENANTS_PER_RUN);
                    break;
                }
                try {
                    // buildGraphFromBusinessData 为 @Async，提交后异步执行
                    // 内部自行设置 UserContext（tenantId + SYSTEM），无需此处绑定
                    knowledgeGraphOrchestrator.buildGraphFromBusinessData(tenantId);
                    submitted++;
                } catch (Exception e) {
                    skipped++;
                    log.warn("[KnowledgeGraphBuildJob] 租户 {} 构建提交失败(不影响其他租户): {}",
                            tenantId, e.getMessage());
                }
            }

            log.info("[KnowledgeGraphBuildJob] ===== 提交完成: 已提交 {} / 跳过 {} =====",
                    submitted, skipped);
        } catch (Exception e) {
            log.error("[KnowledgeGraphBuildJob] 任务异常: {}", e.getMessage(), e);
        } finally {
            distributedLockService.unlock("job:knowledge-graph-build", lockValue);
        }
    }

    private List<Long> findActiveTenants() {
        if (processStatsEngine == null) return List.of();
        try {
            return processStatsEngine.findActiveTenantIds();
        } catch (Exception e) {
            log.warn("[KnowledgeGraphBuildJob] 获取活跃租户失败: {}", e.getMessage());
            return List.of();
        }
    }
}
