package com.fashion.supplychain.intelligence.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.entity.AiPatrolAction;
import com.fashion.supplychain.intelligence.orchestration.DecisionCardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.LongTermMemoryOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.PatrolClosedLoopOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ProcessRewardOrchestrator;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * AI 闭环质量巡检 + 生产业务异常自主巡查定时任务
 *
 * <p><b>凌晨 02:00 — AI质量巡检：</b>
 * <ol>
 *   <li>工具失败率 &gt; 50% → 创建 TOOL_FAILURE_RATE 巡检工单</li>
 *   <li>决策卡采纳率 &lt; 20% → 创建 LOW_ADOPTION_RATE 巡检工单</li>
 *   <li>REFLECTIVE 记忆生成：高/低采纳率场景写入 ai_long_memory</li>
 * </ol>
 *
 * <p><b>每4小时 — 生产业务异常巡查（真实业务数据）：</b>
 * <ol>
 *   <li>高危截止订单：5天内到期 + 进度 &lt; 40% → DEADLINE_RISK 工单</li>
 *   <li>工厂沉默检测：有进行中订单的工厂 3天内无任何扫码 → FACTORY_SILENCE 工单</li>
 * </ol>
 *
 * <p>生成的 AiPatrolAction 会被 AiAgentPromptHelper 实时注入 AI 系统提示词，
 * 使 AI 在回答问题时主动感知当前业务风险。这是 AI "自我意识" 的核心来源。
 */
@Slf4j
@Component
public class AiPatrolJob {

    /** 工具失败率阈值：超过此值视为异常 */
    private static final double TOOL_FAILURE_THRESHOLD = 0.5;
    /** 决策卡采纳率阈值：低于此值视为低效 */
    private static final double ADOPTION_RATE_THRESHOLD = 0.2;
    /** 高危订单：距交货日期天数阈值 */
    private static final int DEADLINE_DAYS_THRESHOLD = 5;
    /** 高危订单：生产进度百分比阈值（低于此值+即将到期=高危） */
    private static final int PROGRESS_THRESHOLD = 40;
    /** 工厂沉默阈值：超过此天数无扫码视为沉默 */
    private static final int FACTORY_SILENCE_DAYS = 3;

    @Autowired
    private ProcessRewardOrchestrator processRewardOrchestrator;
    @Autowired
    private DecisionCardOrchestrator decisionCardOrchestrator;
    @Autowired
    private PatrolClosedLoopOrchestrator patrolOrchestrator;
    @Autowired
    private LongTermMemoryOrchestrator longTermMemoryOrchestrator;

    /**
     * 跨模块读取生产数据（只读，不涉及事务，Job 层允许跨模块调用 Service）。
     * required=false：即使生产模块未部署，Job 也能正常启动，业务巡查部分静默跳过。
     */
    @Autowired(required = false)
    private ProductionOrderService productionOrderService;

    @Autowired(required = false)
    private ScanRecordService scanRecordService;

    // ══════════════════════════════════════════════════════════════════
    // 生产业务异常巡查（每4小时，真实业务数据）
    // 这是 AI "自我意识" 的来源：AI 主动发现业务问题，而非等用户告知
    // ══════════════════════════════════════════════════════════════════

    /**
     * 每4小时执行一次生产业务异常巡查。
     *
     * <p>检测两类高价值业务异常：
     * <ul>
     *   <li><b>DEADLINE_RISK</b>：订单5天内到期 + 进度 &lt; 40% → 立即告警</li>
     *   <li><b>FACTORY_SILENCE</b>：工厂有进行中订单但3天内零扫码 → 异常静默告警</li>
     * </ul>
     *
     * <p>产生的 AiPatrolAction 会被 {@code AiAgentPromptHelper} 实时注入 System Prompt，
     * 使 AI 在每次对话时均可感知当前生产风险，实现「主动意识」而非「被动问答」。
     */
    @Scheduled(cron = "0 0 */4 * * ?")
    public void scanProductionAnomalies() {
        if (productionOrderService == null || scanRecordService == null) {
            log.debug("[AiPatrolJob-Biz] 生产服务未注入，跳过业务异常巡查");
            return;
        }
        log.info("[AiPatrolJob-Biz] ===== 开始生产业务异常巡查 =====");
        int found = 0;

        // ── 1. 高危截止订单（5天内到期 + 进度 < 40%）──
        try {
            LocalDate today = LocalDate.now();
            LocalDate deadline = today.plusDays(DEADLINE_DAYS_THRESHOLD);
            LambdaQueryWrapper<ProductionOrder> q = new LambdaQueryWrapper<>();
            q.eq(ProductionOrder::getDeleteFlag, 0)
             .in(ProductionOrder::getStatus, "IN_PROGRESS", "CREATED")
             .isNotNull(ProductionOrder::getExpectedShipDate)
             .le(ProductionOrder::getExpectedShipDate, deadline)
             .ge(ProductionOrder::getExpectedShipDate, today)
             .select(ProductionOrder::getId, ProductionOrder::getOrderNo,
                     ProductionOrder::getFactoryName, ProductionOrder::getTenantId,
                     ProductionOrder::getExpectedShipDate, ProductionOrder::getProductionProgress);
            List<ProductionOrder> criticals = productionOrderService.list(q);
            for (ProductionOrder o : criticals) {
                int progress = o.getProductionProgress() == null ? 0 : o.getProductionProgress();
                if (progress >= PROGRESS_THRESHOLD) continue; // 进度达标，跳过
                long daysLeft = ChronoUnit.DAYS.between(today, o.getExpectedShipDate());
                String issue = String.format(
                    "订单[%s] 仅剩 %d 天交货（%s），当前进度仅 %d%%，工厂：%s",
                    o.getOrderNo(), daysLeft, o.getExpectedShipDate(),
                    progress, Objects.toString(o.getFactoryName(), "未指定"));
                patrolOrchestrator.createAction(
                    "BIZ_PATROL_JOB", issue, "DEADLINE_RISK",
                    daysLeft <= 2 ? "HIGH" : "MEDIUM",
                    "order", o.getOrderNo(),
                    "{\"action\":\"urge_production\",\"orderId\":\"" + o.getId() + "\"}",
                    BigDecimal.valueOf(daysLeft <= 2 ? 0.95 : 0.75),
                    daysLeft <= 2 ? "NEED_APPROVAL" : "AUTO_EXECUTE"
                );
                log.warn("[AiPatrolJob-Biz] 高危截止订单: {}", issue);
                found++;
            }
        } catch (Exception e) {
            log.warn("[AiPatrolJob-Biz] 高危订单扫描异常: {}", e.getMessage());
        }

        // ── 2. 工厂沉默检测（有进行中订单但3天内无扫码）──
        try {
            LocalDateTime silenceThreshold = LocalDateTime.now().minusDays(FACTORY_SILENCE_DAYS);

            // 找到有活跃订单的工厂（tenantId+factoryName 组合）
            LambdaQueryWrapper<ProductionOrder> activeQ = new LambdaQueryWrapper<>();
            activeQ.eq(ProductionOrder::getDeleteFlag, 0)
                   .in(ProductionOrder::getStatus, "IN_PROGRESS", "CREATED")
                   .isNotNull(ProductionOrder::getFactoryName)
                   .select(ProductionOrder::getTenantId, ProductionOrder::getFactoryName,
                           ProductionOrder::getOrderNo);
            List<ProductionOrder> activeOrders = productionOrderService.list(activeQ);

            // 按 tenantId+factoryName 分组，找到有活跃订单的工厂列表
            Map<String, Set<String>> activeFactories = activeOrders.stream()
                .filter(o -> o.getFactoryName() != null && o.getTenantId() != null)
                .collect(Collectors.groupingBy(
                    o -> o.getTenantId() + "##" + o.getFactoryName(),
                    Collectors.mapping(ProductionOrder::getOrderNo, Collectors.toSet())
                ));

            if (!activeFactories.isEmpty()) {
                // 查询最近3天内各工厂的最后扫码时间
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> latestScans = (List<Map<String, Object>>)
                    (Object) scanRecordService.listMaps(
                        new QueryWrapper<ScanRecord>()
                            .select("tenant_id, factory_name, MAX(scan_time) as last_scan")
                            .eq("scan_result", "success")
                            .ne("scan_type", "orchestration")
                            .ge("scan_time", silenceThreshold)
                            .isNotNull("factory_name")
                            .groupBy("tenant_id, factory_name")
                    );

                Set<String> recentScanFactories = latestScans.stream()
                    .filter(r -> r.get("tenant_id") != null && r.get("factory_name") != null)
                    .map(r -> r.get("tenant_id") + "##" + r.get("factory_name"))
                    .collect(Collectors.toSet());

                // 有活跃订单但无近期扫码的工厂 = 沉默工厂
                for (Map.Entry<String, Set<String>> entry : activeFactories.entrySet()) {
                    if (!recentScanFactories.contains(entry.getKey())) {
                        String[] parts = entry.getKey().split("##", 2);
                        String factoryName = parts.length > 1 ? parts[1] : entry.getKey();
                        Set<String> orders = entry.getValue();
                        String orderList = orders.stream().limit(3).collect(Collectors.joining("、"));
                        if (orders.size() > 3) orderList += "等";
                        String issue = String.format(
                            "工厂[%s] 已连续 %d 天无扫码记录，但仍有进行中订单：%s",
                            factoryName, FACTORY_SILENCE_DAYS, orderList);
                        patrolOrchestrator.createAction(
                            "BIZ_PATROL_JOB", issue, "FACTORY_SILENCE",
                            "HIGH",
                            "factory", factoryName,
                            "{\"action\":\"contact_factory\",\"factoryName\":\"" + factoryName + "\"}",
                            BigDecimal.valueOf(0.85),
                            "NEED_APPROVAL"
                        );
                        log.warn("[AiPatrolJob-Biz] 工厂沉默告警: {}", issue);
                        found++;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[AiPatrolJob-Biz] 工厂沉默检测异常: {}", e.getMessage());
        }

        log.info("[AiPatrolJob-Biz] ===== 业务异常巡查完成，发现 {} 个风险 =====", found);

        if (found > 0) {
            performCorrelationAnalysis();
        }
    }

    private void performCorrelationAnalysis() {
        try {
            List<AiPatrolAction> recentActions = patrolOrchestrator.recentActions(24);
            if (recentActions == null || recentActions.size() < 2) return;

            Map<Long, List<AiPatrolAction>> byTenant = recentActions.stream()
                .filter(a -> a.getTenantId() != null)
                .collect(Collectors.groupingBy(AiPatrolAction::getTenantId));

            for (Map.Entry<Long, List<AiPatrolAction>> entry : byTenant.entrySet()) {
                List<AiPatrolAction> actions = entry.getValue();
                boolean hasDeadlineRisk = actions.stream().anyMatch(a -> "DEADLINE_RISK".equals(a.getIssueType()));
                boolean hasFactorySilence = actions.stream().anyMatch(a -> "FACTORY_SILENCE".equals(a.getIssueType()));
                boolean hasQualitySpike = actions.stream().anyMatch(a -> "QUALITY_SPIKE".equals(a.getIssueType()));

                int coOccurrence = (hasDeadlineRisk ? 1 : 0) + (hasFactorySilence ? 1 : 0) + (hasQualitySpike ? 1 : 0);
                if (coOccurrence >= 2) {
                    String correlation = String.format(
                        "租户[%d] 同时出现多种风险信号（%s%s%s），极可能存在系统性交付风险，建议立即排查",
                        entry.getKey(),
                        hasDeadlineRisk ? "高危截止" : "",
                        hasFactorySilence ? "+工厂沉默" : "",
                        hasQualitySpike ? "+质量异常" : "");
                    patrolOrchestrator.createAction(
                        "BIZ_PATROL_JOB", correlation, "CORRELATED_RISK",
                        "HIGH", "tenant", String.valueOf(entry.getKey()),
                        "{\"action\":\"escalate_correlated_risk\"}",
                        BigDecimal.valueOf(0.95), "NEED_APPROVAL"
                    );
                    log.warn("[AiPatrolJob-Biz] 关联风险升级: {}", correlation);
                }
            }
        } catch (Exception e) {
            log.warn("[AiPatrolJob-Biz] 关联分析异常: {}", e.getMessage());
        }
    }

    @Scheduled(cron = "0 30 */4 * * ?")
    public void scanExtendedAnomalies() {
        if (productionOrderService == null || scanRecordService == null) {
            return;
        }
        log.info("[AiPatrolJob-Ext] ===== 开始扩展业务异常巡查 =====");
        int found = 0;

        try {
            LocalDateTime since = LocalDateTime.now().minusHours(24);
            QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
            qw.select("tenant_id, process_name, COUNT(*) as total",
                      "SUM(CASE WHEN scan_result='fail' THEN 1 ELSE 0 END) as fail_count")
              .ne("scan_type", "orchestration")
              .ge("scan_time", since)
              .groupBy("tenant_id, process_name");
            List<Map<String, Object>> qualityStats = (List<Map<String, Object>>) (Object) scanRecordService.listMaps(qw);

            for (Map<String, Object> row : qualityStats) {
                Number total = (Number) row.getOrDefault("total", 0);
                Number failCount = (Number) row.getOrDefault("fail_count", 0);
                if (total == null || total.intValue() < 5) continue;
                double failRate = failCount.doubleValue() / total.doubleValue();
                if (failRate > 0.15) {
                    String tenantId = String.valueOf(row.getOrDefault("tenant_id", ""));
                    String processName = String.valueOf(row.getOrDefault("process_name", "未知工序"));
                    String issue = String.format(
                        "工序[%s] 近24h次品率%.0f%%（共%d次扫码，失败%d次），超出15%阈值",
                        processName, failRate * 100, total.intValue(), failCount.intValue());
                    patrolOrchestrator.createAction(
                        "BIZ_PATROL_JOB", issue, "QUALITY_SPIKE",
                        failRate > 0.3 ? "HIGH" : "MEDIUM",
                        "process", processName,
                        "{\"action\":\"investigate_quality\",\"processName\":\"" + processName + "\"}",
                        BigDecimal.valueOf(1.0 - failRate), "NEED_APPROVAL"
                    );
                    found++;
                }
            }
        } catch (Exception e) {
            log.warn("[AiPatrolJob-Ext] 质量异常检测失败: {}", e.getMessage());
        }

        try {
            LocalDateTime since = LocalDateTime.now().minusHours(48);
            LambdaQueryWrapper<ProductionOrder> cuttingDone = new LambdaQueryWrapper<>();
            cuttingDone.eq(ProductionOrder::getDeleteFlag, 0)
                       .eq(ProductionOrder::getStatus, "IN_PROGRESS")
                       .isNotNull(ProductionOrder::getFactoryName)
                       .select(ProductionOrder::getId, ProductionOrder::getOrderNo,
                               ProductionOrder::getFactoryName, ProductionOrder::getTenantId);
            List<ProductionOrder> inProgress = productionOrderService.list(cuttingDone);

            for (ProductionOrder order : inProgress) {
                QueryWrapper<ScanRecord> sewQ = new QueryWrapper<>();
                sewQ.eq("order_no", order.getOrderNo())
                    .eq("scan_type", "production")
                    .ne("scan_type", "orchestration")
                    .ge("scan_time", since)
                    .last("LIMIT 1");
                List<Map<String, Object>> sewScans = (List<Map<String, Object>>) (Object) scanRecordService.listMaps(sewQ);

                QueryWrapper<ScanRecord> cutQ = new QueryWrapper<>();
                cutQ.eq("order_no", order.getOrderNo())
                    .eq("scan_type", "cutting")
                    .lt("scan_time", since)
                    .last("LIMIT 1");
                List<Map<String, Object>> cutScans = (List<Map<String, Object>>) (Object) scanRecordService.listMaps(cutQ);

                if (!cutScans.isEmpty() && sewScans.isEmpty()) {
                    String issue = String.format(
                        "订单[%s] 裁剪完成已超48h但车缝未开始，工厂：%s",
                        order.getOrderNo(), Objects.toString(order.getFactoryName(), "未指定"));
                    patrolOrchestrator.createAction(
                        "BIZ_PATROL_JOB", issue, "CUTTING_BACKLOG",
                        "MEDIUM", "order", order.getOrderNo(),
                        "{\"action\":\"check_sewing_start\",\"orderNo\":\"" + order.getOrderNo() + "\"}",
                        BigDecimal.valueOf(0.7), "NEED_APPROVAL"
                    );
                    found++;
                }
            }
        } catch (Exception e) {
            log.warn("[AiPatrolJob-Ext] 裁剪积压检测失败: {}", e.getMessage());
        }

        log.info("[AiPatrolJob-Ext] ===== 扩展巡查完成，发现 {} 个风险 =====", found);
    }

    // ══════════════════════════════════════════════════════════════════
    // AI质量巡检（每日凌晨02:00）
    // ══════════════════════════════════════════════════════════════════

    /**
     * 每日 02:00 执行全量巡检
     */
    @Scheduled(cron = "0 0 2 * * ?")
    public void runDailyPatrol() {
        log.info("[AiPatrolJob] ===== 开始 AI 闭环质量巡检 =====");
        LocalDateTime since = LocalDateTime.now().minusHours(24);
        int issuesFound = 0;

        // ── 1. 工具失败率检测 ──
        try {
            List<Map<String, Object>> toolStats = processRewardOrchestrator.aggregateToolPerformance(since);
            for (Map<String, Object> row : toolStats) {
                String toolName = getString(row, "tool_name");
                Number totalNum = (Number) row.getOrDefault("total", 0);
                Number positiveNum = (Number) row.getOrDefault("positive", 0);
                if (totalNum == null || totalNum.intValue() < 5) continue; // 样本太小，跳过
                int total = totalNum.intValue();
                int failed = total - positiveNum.intValue();
                double failRate = (double) failed / total;
                if (failRate > TOOL_FAILURE_THRESHOLD) {
                    String issue = String.format("工具[%s] 过去24h失败率=%.0f%%（共%d次，失败%d次）",
                        toolName, failRate * 100, total, failed);
                    patrolOrchestrator.createAction(
                        "PATROL_JOB",
                        issue,
                        "TOOL_FAILURE_RATE",
                        failRate > 0.8 ? "HIGH" : "MEDIUM",
                        "tool",
                        toolName,
                        "{\"action\":\"review_tool_implementation\",\"toolName\":\"" + toolName + "\"}",
                        BigDecimal.valueOf(1.0 - failRate),
                        "NEED_APPROVAL"
                    );
                    log.warn("[AiPatrolJob] 工具失败率异常: {}", issue);
                    issuesFound++;
                }
            }
        } catch (Exception e) {
            log.warn("[AiPatrolJob] 工具失败率检测异常: {}", e.getMessage());
        }

        // ── 2. 决策卡采纳率检测 ──
        try {
            List<Map<String, Object>> adoptionStats = decisionCardOrchestrator.aggregateAdoption(since);
            for (Map<String, Object> row : adoptionStats) {
                String scene = getString(row, "scene");
                Number totalNum = (Number) row.getOrDefault("total", 0);
                Number adoptedNum = (Number) row.getOrDefault("adopted_count", 0);
                if (totalNum == null || totalNum.intValue() < 3) continue;
                double adoptionRate = adoptedNum.doubleValue() / totalNum.doubleValue();
                if (adoptionRate < ADOPTION_RATE_THRESHOLD) {
                    String issue = String.format("场景[%s] 过去24h决策卡采纳率=%.0f%%（共%d张，采纳%d张）",
                        scene, adoptionRate * 100, totalNum.intValue(), adoptedNum.intValue());
                    patrolOrchestrator.createAction(
                        "PATROL_JOB",
                        issue,
                        "LOW_ADOPTION_RATE",
                        "LOW",
                        "scene",
                        scene,
                        "{\"action\":\"review_recommendation_quality\",\"scene\":\"" + scene + "\"}",
                        BigDecimal.valueOf(adoptionRate + 0.1),
                        "AUTO_EXECUTE"
                    );
                    log.info("[AiPatrolJob] 决策卡采纳率偏低: {}", issue);
                    issuesFound++;
                }
            }
        } catch (Exception e) {
            log.warn("[AiPatrolJob] 决策卡采纳率检测异常: {}", e.getMessage());
        }

        log.info("[AiPatrolJob] ===== 巡检完成，发现 {} 个问题 =====", issuesFound);

        // ── 3. REFLECTIVE 记忆生成：将高/低采纳率场景写入长期记忆 ──
        generateReflectiveMemories(since);
    }

    /**
     * P1: REFLECTIVE 记忆生成。
     * <ul>
     *   <li>高采纳率场景 (&gt;80%) → 写正向 REFLECTIVE 记忆，强化该场景的决策能力</li>
     *   <li>低采纳率场景 (&lt;20%) → 写负向 REFLECTIVE 记忆，提醒 AI 对该场景更谨慎</li>
     * </ul>
     * 写入 ai_long_memory.layer = 'REFLECTIVE'，subject_type = 'platform_scene'
     */
    private void generateReflectiveMemories(LocalDateTime since) {
        int written = 0;
        try {
            List<Map<String, Object>> adoptionStats = decisionCardOrchestrator.aggregateAdoption(since);
            for (Map<String, Object> row : adoptionStats) {
                String scene = getString(row, "scene");
                Number totalNum = (Number) row.getOrDefault("total", 0);
                Number adoptedNum = (Number) row.getOrDefault("adopted_count", 0);
                if (totalNum == null || totalNum.intValue() < 5) continue; // 样本不足5条跳过
                double rate = adoptedNum.doubleValue() / totalNum.doubleValue();
                String content;
                double confidence;
                if (rate > 0.8) {
                    content = String.format(
                        "场景「%s」的决策建议采纳率高达 %.0f%%（样本%d条），说明当前推荐策略非常有效，应持续强化类似的表达和依据。",
                        scene, rate * 100, totalNum.intValue());
                    confidence = rate;
                } else if (rate < 0.2) {
                    content = String.format(
                        "场景「%s」的决策建议采纳率仅 %.0f%%（样本%d条），说明当前推荐策略效果较差，需要重新审视该场景下的建议生成逻辑和措辞。",
                        scene, rate * 100, totalNum.intValue());
                    confidence = 1.0 - rate;
                } else {
                    continue; // 中间区间不写记忆
                }
                longTermMemoryOrchestrator.writePlatformMemory(
                    "REFLECTIVE",
                    "platform_scene",
                    content,
                    null,
                    BigDecimal.valueOf(confidence)
                );
                written++;
            }
        } catch (Exception e) {
            log.warn("[AiPatrolJob] REFLECTIVE 记忆生成异常: {}", e.getMessage());
        }
        if (written > 0) {
            log.info("[AiPatrolJob] REFLECTIVE 记忆生成完成，新增 {} 条", written);
        }
    }

    private static String getString(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v == null ? "unknown" : v.toString();
    }
}
