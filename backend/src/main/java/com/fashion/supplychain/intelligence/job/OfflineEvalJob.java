package com.fashion.supplychain.intelligence.job;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.EvalRunResult;
import com.fashion.supplychain.intelligence.entity.EvalDataset;
import com.fashion.supplychain.intelligence.mapper.EvalDatasetMapper;
import com.fashion.supplychain.intelligence.service.OfflineEvalService;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import java.time.LocalDate;
import java.time.temporal.WeekFields;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 离线评估定时任务（P1-4 Langfuse/Eval 框架方向）
 *
 * <p><b>每周日 02:00 执行</b>（避开 03:30 MemoryConsolidationJob 和 04:00 SharedAgentMemoryCleanupJob），
 * 遍历活跃租户，采样最近 100 条对话，跑离线评估，生成质量趋势数据。</p>
 *
 * <p><b>多租户隔离（P0铁律4）</b>：逐租户设置 UserContext，所有查询带 tenant_id。</p>
 *
 * <p><b>异常隔离</b>：评估失败仅 log.warn，不影响主流程和其他租户。</p>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Slf4j
@Component
@Lazy
public class OfflineEvalJob {

    /** 单租户采样条数 */
    private static final int SAMPLE_SIZE = 100;
    /** 单批评估条数 */
    private static final int BATCH_SIZE = 100;
    /** 单次最多处理的租户数（容量保护） */
    private static final int MAX_TENANTS_PER_RUN = 100;

    @Autowired
    private OfflineEvalService offlineEvalService;

    @Autowired
    private EvalDatasetMapper evalDatasetMapper;

    @Autowired(required = false)
    private ProcessStatsEngine processStatsEngine;

    /**
     * 每周日 02:00 执行离线评估。
     */
    @Scheduled(cron = "0 0 2 * * SUN")
    public void runWeeklyEval() {
        log.info("[OfflineEvalJob] ===== 开始每周离线评估 =====");

        List<Long> tenants = null;
        try {
            if (processStatsEngine != null) {
                tenants = processStatsEngine.findActiveTenantIds();
            }
        } catch (Exception e) {
            log.warn("[OfflineEvalJob] 获取活跃租户失败(不影响主流程): {}", e.getMessage());
        }

        if (tenants == null || tenants.isEmpty()) {
            log.info("[OfflineEvalJob] 无活跃租户，跳过");
            return;
        }

        String weekTag = currentWeekTag();
        String datasetName = "weekly_eval_" + weekTag;
        int tenantsProcessed = 0;
        int totalEvaluated = 0;
        double scoreSum = 0.0;
        int scoreCount = 0;

        for (Long tenantId : tenants) {
            if (tenantId == null) {
                continue;
            }
            if (tenantsProcessed >= MAX_TENANTS_PER_RUN) {
                log.info("[OfflineEvalJob] 已达单次最大租户数 {}，停止处理", MAX_TENANTS_PER_RUN);
                break;
            }

            UserContext previous = UserContext.get();
            try {
                UserContext ctx = new UserContext();
                ctx.setTenantId(tenantId);
                ctx.setUsername("system");
                ctx.setUserId("system");
                UserContext.set(ctx);

                // 1. 创建或复用本周数据集
                Long datasetId = findOrCreateDataset(tenantId, datasetName, weekTag);
                if (datasetId == null) {
                    continue;
                }

                // 2. 采样最近 100 条对话
                int sampled = offlineEvalService.sampleConversations(tenantId, datasetId, SAMPLE_SIZE);
                if (sampled <= 0) {
                    log.info("[OfflineEvalJob] 租户 {} 无对话可采样，跳过评估", tenantId);
                    tenantsProcessed++;
                    continue;
                }

                // 3. 执行评估
                EvalRunResult result = offlineEvalService.runEvaluation(
                        tenantId, datasetId, "rule_v1", BATCH_SIZE);
                tenantsProcessed++;
                totalEvaluated += result.getEvaluated() == null ? 0 : result.getEvaluated();
                if (result.getAvgScore() != null && result.getAvgScore() > 0) {
                    scoreSum += result.getAvgScore();
                    scoreCount++;
                }

                log.info("[OfflineEvalJob] 租户 {} 评估完成: dataset={} sampled={} evaluated={} avgScore={}",
                        tenantId, datasetId, sampled,
                        result.getEvaluated(), result.getAvgScore());
            } catch (Exception e) {
                log.warn("[OfflineEvalJob] 租户 {} 评估异常(不影响主流程): {}", tenantId, e.getMessage());
            } finally {
                if (previous != null) {
                    UserContext.set(previous);
                } else {
                    UserContext.clear();
                }
            }
        }

        double overallAvg = scoreCount > 0 ? scoreSum / scoreCount : 0.0;
        log.info("[OfflineEvalJob] ===== 每周离线评估完成: 租户 {} / 评估 {} 条 / 整体均分 {} =====",
                tenantsProcessed, totalEvaluated, String.format("%.1f", overallAvg));
    }

    /**
     * 查找或创建本周数据集（按 tenant_id + dataset_name 复用，避免重复创建）。
     */
    private Long findOrCreateDataset(Long tenantId, String datasetName, String weekTag) {
        try {
            QueryWrapper<EvalDataset> qw = new QueryWrapper<>();
            qw.eq("tenant_id", tenantId).eq("dataset_name", datasetName);
            List<EvalDataset> existing = evalDatasetMapper.selectList(qw);
            if (existing != null && !existing.isEmpty()) {
                return existing.get(0).getId();
            }
            return offlineEvalService.createDataset(
                    tenantId, datasetName, "每周离线评估 " + weekTag, "CONVERSATION");
        } catch (Exception e) {
            log.warn("[OfflineEvalJob] 查找/创建数据集失败 tenant={} name={}: {}",
                    tenantId, datasetName, e.getMessage());
            return null;
        }
    }

    /**
     * 当前 ISO 周标签：YYYYWW（用 weekBasedYear 处理跨年边界）。
     */
    private String currentWeekTag() {
        LocalDate now = LocalDate.now();
        WeekFields wf = WeekFields.ISO;
        int year = now.get(wf.weekBasedYear());
        int week = now.get(wf.weekOfYear());
        return String.format("%04d%02d", year, week);
    }
}
