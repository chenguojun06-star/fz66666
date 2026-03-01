package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.*;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * NlQuery 智能处理器 — 接入全系统 15 个智能编排器，为 AI 助手提供深度分析能力。
 *
 * <p>覆盖维度：系统健康 / 瓶颈 / 交期风险 / 异常告警 / 工厂排名 /
 * 员工人效 / 产能脉搏 / 成本利润 / 缺陷热力 / 生产节拍 /
 * 排程建议 / 智能通知 / 自愈诊断 / 学习报告
 */
@Component
@Slf4j
public class NlQuerySmartHandlers {

    @Autowired private HealthIndexOrchestrator healthIndexOrchestrator;
    @Autowired private BottleneckDetectionOrchestrator bottleneckDetectionOrchestrator;
    @Autowired private WorkerEfficiencyOrchestrator workerEfficiencyOrchestrator;
    @Autowired private FactoryLeaderboardOrchestrator factoryLeaderboardOrchestrator;
    @Autowired private DeliveryPredictionOrchestrator deliveryPredictionOrchestrator;
    @Autowired private ProfitEstimationOrchestrator profitEstimationOrchestrator;
    @Autowired private LivePulseOrchestrator livePulseOrchestrator;
    @Autowired private AnomalyDetectionOrchestrator anomalyDetectionOrchestrator;
    @Autowired private DefectHeatmapOrchestrator defectHeatmapOrchestrator;
    @Autowired private RhythmDnaOrchestrator rhythmDnaOrchestrator;
    @Autowired private OrderDeliveryRiskOrchestrator orderDeliveryRiskOrchestrator;
    @Autowired private SchedulingSuggestionOrchestrator schedulingSuggestionOrchestrator;
    @Autowired private SmartNotificationOrchestrator smartNotificationOrchestrator;
    @Autowired private SelfHealingOrchestrator selfHealingOrchestrator;
    @Autowired private LearningReportOrchestrator learningReportOrchestrator;

    // ── 系统健康指数 ──
    public NlQueryResponse handleHealthQuery() {
        NlQueryResponse resp = build("health");
        try {
            HealthIndexResponse h = healthIndexOrchestrator.calculate();
            StringBuilder sb = new StringBuilder("🏥 系统健康指数：\n");
            sb.append(String.format("• 综合评分：%d 分（%s）\n", h.getHealthIndex(), h.getGrade()));
            sb.append(String.format("• 生产：%d | 交付：%d | 质量：%d | 库存：%d | 财务：%d\n",
                    h.getProductionScore(), h.getDeliveryScore(), h.getQualityScore(),
                    h.getInventoryScore(), h.getFinanceScore()));
            if (h.getTopRisk() != null) sb.append("• ⚠️ 首要风险：").append(h.getTopRisk()).append("\n");
            if (h.getSuggestion() != null) sb.append("• 💡 建议：").append(h.getSuggestion());
            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(90);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("healthIndex", h.getHealthIndex());
            data.put("grade", h.getGrade());
            data.put("productionScore", h.getProductionScore());
            data.put("deliveryScore", h.getDeliveryScore());
            data.put("qualityScore", h.getQualityScore());
            data.put("inventoryScore", h.getInventoryScore());
            data.put("financeScore", h.getFinanceScore());
            data.put("topRisk", h.getTopRisk());
            resp.setData(data);
        } catch (Exception e) {
            fallback(resp, "健康指数", e);
        }
        resp.setSuggestions(Arrays.asList("有异常告警吗？", "哪里有瓶颈？", "整体情况怎么样？"));
        return resp;
    }

    // ── 瓶颈检测 ──
    public NlQueryResponse handleBottleneckQuery() {
        NlQueryResponse resp = build("bottleneck");
        try {
            BottleneckDetectionResponse b = bottleneckDetectionOrchestrator.detect(null);
            if (!b.isHasBottleneck()) {
                resp.setAnswer("✅ 当前生产线没有明显瓶颈，各工序衔接流畅！");
                resp.setConfidence(90);
            } else {
                StringBuilder sb = new StringBuilder("🔴 发现生产瓶颈：\n");
                sb.append("• ").append(b.getSummary()).append("\n");
                for (BottleneckDetectionResponse.BottleneckItem item : b.getBottlenecks()) {
                    sb.append(String.format("  ⚠️ %s — 积压 %d 件（%s）\n",
                            item.getStageName(), item.getBacklog(), item.getSeverity()));
                    if (item.getSuggestion() != null) sb.append("     💡 ").append(item.getSuggestion()).append("\n");
                }
                resp.setAnswer(sb.toString().trim());
                resp.setConfidence(88);
            }
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("hasBottleneck", b.isHasBottleneck());
            data.put("summary", b.getSummary());
            data.put("bottleneckCount", b.getBottlenecks().size());
            resp.setData(data);
        } catch (Exception e) {
            fallback(resp, "瓶颈检测", e);
        }
        resp.setSuggestions(Arrays.asList("系统健康度如何？", "有异常告警吗？", "排产建议？"));
        return resp;
    }

    // ── 交期风险评估 ──
    public NlQueryResponse handleRiskQuery() {
        NlQueryResponse resp = build("risk");
        try {
            DeliveryRiskResponse r = orderDeliveryRiskOrchestrator.assess(null);
            List<DeliveryRiskResponse.DeliveryRiskItem> orders = r.getOrders();
            long dangerCount = orders.stream()
                    .filter(o -> "danger".equals(o.getRiskLevel()) || "overdue".equals(o.getRiskLevel())).count();
            long warningCount = orders.stream().filter(o -> "warning".equals(o.getRiskLevel())).count();

            StringBuilder sb = new StringBuilder("🚨 交期风险评估：\n");
            sb.append(String.format("• 评估订单数：%d | 危险/逾期：%d | 预警：%d\n", orders.size(), dangerCount, warningCount));
            orders.stream().filter(o -> !"safe".equals(o.getRiskLevel())).limit(5).forEach(o ->
                    sb.append(String.format("  • %s（%s）— %s，进度 %d%%\n",
                            o.getOrderNo(), o.getFactoryName(), o.getRiskDescription(), o.getCurrentProgress())));
            if (dangerCount == 0 && warningCount == 0) {
                sb.append("✅ 所有订单交期风险可控！");
            }
            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(88);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("totalOrders", orders.size());
            data.put("dangerCount", dangerCount);
            data.put("warningCount", warningCount);
            resp.setData(data);
        } catch (Exception e) {
            fallback(resp, "交期风险", e);
        }
        resp.setSuggestions(Arrays.asList("哪里有瓶颈？", "有延期订单吗？", "排产建议？"));
        return resp;
    }

    // ── 异常告警 ──
    public NlQueryResponse handleAnomalyQuery() {
        NlQueryResponse resp = build("anomaly");
        try {
            AnomalyDetectionResponse a = anomalyDetectionOrchestrator.detect();
            List<AnomalyDetectionResponse.AnomalyItem> items = a.getAnomalies();
            if (items.isEmpty()) {
                resp.setAnswer("✅ 系统未检测到异常行为，一切正常运行！");
                resp.setConfidence(90);
            } else {
                StringBuilder sb = new StringBuilder(String.format("🔔 检测到 %d 项异常（共检查 %d 项）：\n",
                        items.size(), a.getTotalChecked()));
                for (AnomalyDetectionResponse.AnomalyItem item : items) {
                    sb.append(String.format("  %s %s — %s\n",
                            "critical".equals(item.getSeverity()) ? "🔴" : "🟡",
                            item.getTitle(), item.getDescription()));
                }
                resp.setAnswer(sb.toString().trim());
                resp.setConfidence(88);
            }
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("anomalyCount", items.size());
            data.put("totalChecked", a.getTotalChecked());
            resp.setData(data);
        } catch (Exception e) {
            fallback(resp, "异常检测", e);
        }
        resp.setSuggestions(Arrays.asList("系统健康度如何？", "哪里有瓶颈？", "系统自检？"));
        return resp;
    }

    // ── 工厂排名（增强版） ──
    public NlQueryResponse handleFactoryRankingQuery() {
        NlQueryResponse resp = build("factory");
        try {
            FactoryLeaderboardResponse f = factoryLeaderboardOrchestrator.rank();
            List<FactoryLeaderboardResponse.FactoryRank> ranks = f.getRankings();
            StringBuilder sb = new StringBuilder(String.format("🏭 工厂排行榜（共 %d 家）：\n", f.getTotalFactories()));
            for (FactoryLeaderboardResponse.FactoryRank r : ranks) {
                sb.append(String.format("  %s %d. %s — 综合 %d 分（产能%d/交付%d/质量%d）%s\n",
                        r.getMedal() != null ? r.getMedal() : "  ",
                        r.getRank(), r.getFactoryName(), r.getTotalScore(),
                        r.getCapacityScore(), r.getDeliveryScore(), r.getQualityScore(),
                        r.getTrend() != null ? r.getTrend() : ""));
            }
            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(90);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("totalFactories", f.getTotalFactories());
            data.put("rankings", ranks);
            resp.setData(data);
        } catch (Exception e) {
            fallback(resp, "工厂排名", e);
        }
        resp.setSuggestions(Arrays.asList("哪个工厂延期最多？", "员工效率排名？", "产能脉搏？"));
        return resp;
    }

    // ── 员工效率（增强版） ──
    public NlQueryResponse handleWorkerEfficiencyQuery() {
        NlQueryResponse resp = build("worker");
        try {
            WorkerEfficiencyResponse w = workerEfficiencyOrchestrator.evaluate();
            StringBuilder sb = new StringBuilder(String.format("🏆 员工效率评估（共 %d 人）：\n", w.getTotalEvaluated()));
            if (w.getTopWorkerName() != null) {
                sb.append("👑 最佳员工：").append(w.getTopWorkerName()).append("\n\n");
            }
            List<WorkerEfficiencyResponse.WorkerEfficiency> workers = w.getWorkers();
            int rank = 1;
            for (WorkerEfficiencyResponse.WorkerEfficiency we : workers.stream().limit(5).collect(java.util.stream.Collectors.toList())) {
                sb.append(String.format("  %d. %s — 综合 %d 分（速度%d/质量%d/稳定%d）日均 %.0f件 %s\n",
                        rank++, we.getWorkerName(), we.getOverallScore(),
                        we.getSpeedScore(), we.getQualityScore(), we.getStabilityScore(),
                        we.getDailyAvgOutput(), we.getTrend() != null ? we.getTrend() : ""));
            }
            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(90);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("totalEvaluated", w.getTotalEvaluated());
            data.put("topWorkerName", w.getTopWorkerName());
            resp.setData(data);
        } catch (Exception e) {
            fallback(resp, "员工效率", e);
        }
        resp.setSuggestions(Arrays.asList("工厂排名？", "今日产量多少？", "有异常告警吗？"));
        return resp;
    }

    // ── 产能脉搏（实时） ──
    public NlQueryResponse handlePulseQuery() {
        NlQueryResponse resp = build("capacity");
        try {
            LivePulseResponse p = livePulseOrchestrator.pulse();
            StringBuilder sb = new StringBuilder("⚡ 实时产能脉搏：\n");
            sb.append(String.format("• 今日扫码：%d 件 | 活跃工人：%d | 活跃工厂：%d\n",
                    p.getTodayScanQty(), p.getActiveWorkers(), p.getActiveFactories()));
            sb.append(String.format("• 每小时速率：%.0f 件/h\n", p.getScanRatePerHour()));
            List<LivePulseResponse.StagnantFactory> stagnant = p.getStagnantFactories();
            if (stagnant != null && !stagnant.isEmpty()) {
                sb.append("• ⏸ 停滞工厂：\n");
                for (LivePulseResponse.StagnantFactory sf : stagnant) {
                    sb.append(String.format("    %s — 已沉默 %d 分钟\n", sf.getFactoryName(), sf.getMinutesSilent()));
                }
            }
            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(90);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("todayScanQty", p.getTodayScanQty());
            data.put("activeWorkers", p.getActiveWorkers());
            data.put("activeFactories", p.getActiveFactories());
            data.put("scanRatePerHour", p.getScanRatePerHour());
            resp.setData(data);
        } catch (Exception e) {
            fallback(resp, "产能脉搏", e);
        }
        resp.setSuggestions(Arrays.asList("和昨天比怎么样？", "工厂排名？", "有异常告警吗？"));
        return resp;
    }

    // ── 成本利润（增强版） ──
    public NlQueryResponse handleCostQuery() {
        NlQueryResponse resp = build("cost");
        try {
            ProfitEstimationResponse p = profitEstimationOrchestrator.estimate(null);
            StringBuilder sb = new StringBuilder("💰 成本利润分析：\n");
            sb.append(String.format("• 订单：%s\n", p.getOrderNo() != null ? p.getOrderNo() : "全局汇总"));
            sb.append(String.format("• 报价总额：%.2f | 总成本：%.2f\n", doubleVal(p.getQuotationTotal()), doubleVal(p.getTotalCost())));
            sb.append(String.format("• 物料成本：%.2f | 人工成本：%.2f\n", doubleVal(p.getMaterialCost()), doubleVal(p.getWageCost())));
            sb.append(String.format("• 预估利润：%.2f（毛利率 %.1f%%）\n", doubleVal(p.getEstimatedProfit()), p.getGrossMarginPct()));
            if (p.getProfitStatus() != null) sb.append("• 状态：").append(p.getProfitStatus()).append("\n");
            if (p.getCostWarning() != null) sb.append("• ⚠️ ").append(p.getCostWarning());
            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(85);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("quotationTotal", p.getQuotationTotal());
            data.put("totalCost", p.getTotalCost());
            data.put("estimatedProfit", p.getEstimatedProfit());
            data.put("grossMarginPct", p.getGrossMarginPct());
            data.put("profitStatus", p.getProfitStatus());
            resp.setData(data);
        } catch (Exception e) {
            fallback(resp, "成本利润", e);
        }
        resp.setSuggestions(Arrays.asList("工厂排名？", "整体情况怎么样？", "有延期订单吗？"));
        return resp;
    }

    // ── 缺陷热力图 ──
    public NlQueryResponse handleDefectQuery() {
        NlQueryResponse resp = build("defect");
        try {
            DefectHeatmapResponse d = defectHeatmapOrchestrator.analyze();
            StringBuilder sb = new StringBuilder(String.format("🔥 缺陷热力分析（累计 %d 件不良）：\n", d.getTotalDefects()));
            if (d.getWorstProcess() != null) sb.append("• 最高缺陷工序：").append(d.getWorstProcess()).append("\n");
            if (d.getWorstFactory() != null) sb.append("• 最高缺陷工厂：").append(d.getWorstFactory()).append("\n");
            if (d.getCells() != null) {
                long severeCount = d.getCells().stream().filter(c -> c.getHeatLevel() >= 3).count();
                long warnCount = d.getCells().stream().filter(c -> c.getHeatLevel() == 2).count();
                sb.append(String.format("• 严重区域：%d 个 | 预警区域：%d 个", severeCount, warnCount));
            }
            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(85);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("totalDefects", d.getTotalDefects());
            data.put("worstProcess", d.getWorstProcess());
            data.put("worstFactory", d.getWorstFactory());
            resp.setData(data);
        } catch (Exception e) {
            fallback(resp, "缺陷热力", e);
        }
        resp.setSuggestions(Arrays.asList("质检通过率多少？", "有异常告警吗？", "工厂排名？"));
        return resp;
    }

    // ── 生产节拍 ──
    public NlQueryResponse handleRhythmQuery() {
        NlQueryResponse resp = build("rhythm");
        try {
            RhythmDnaResponse r = rhythmDnaOrchestrator.analyze();
            List<RhythmDnaResponse.OrderRhythm> orders = r.getOrders();
            StringBuilder sb = new StringBuilder(String.format("🎵 生产节拍分析（%d 个订单）：\n", orders.size()));
            for (RhythmDnaResponse.OrderRhythm o : orders.stream().limit(3).collect(java.util.stream.Collectors.toList())) {
                sb.append(String.format("• %s（%s）— 总耗时 %d天\n", o.getOrderNo(), o.getStyleName(), o.getTotalDays()));
                if (o.getSegments() != null) {
                    for (RhythmDnaResponse.RhythmSegment seg : o.getSegments()) {
                        sb.append(String.format("    %s：%.1f天（%.0f%%）%s\n",
                                seg.getStageName(), seg.getDays(), seg.getPct(),
                                seg.isBottleneck() ? "⚠瓶颈" : ""));
                    }
                }
            }
            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(85);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("orderCount", orders.size());
            resp.setData(data);
        } catch (Exception e) {
            fallback(resp, "生产节拍", e);
        }
        resp.setSuggestions(Arrays.asList("哪里有瓶颈？", "排产建议？", "整体情况怎么样？"));
        return resp;
    }

    // ── 排程建议 ──
    public NlQueryResponse handleSchedulingQuery() {
        NlQueryResponse resp = build("scheduling");
        try {
            SchedulingSuggestionRequest req = new SchedulingSuggestionRequest();
            req.setQuantity(1000);
            SchedulingSuggestionResponse s = schedulingSuggestionOrchestrator.suggest(req);
            List<SchedulingSuggestionResponse.SchedulePlan> plans = s.getPlans();
            StringBuilder sb = new StringBuilder(String.format("📅 排产建议（%d 个方案）：\n", plans.size()));
            for (SchedulingSuggestionResponse.SchedulePlan plan : plans) {
                sb.append(String.format("  🏭 %s — 匹配度 %d 分，负荷 %d%%，可用产能 %d\n",
                        plan.getFactoryName(), plan.getMatchScore(), plan.getCurrentLoad(), plan.getAvailableCapacity()));
                sb.append(String.format("     建议排期：%s → %s（约 %d 天）\n",
                        plan.getSuggestedStart(), plan.getEstimatedEnd(), plan.getEstimatedDays()));
            }
            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(85);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("planCount", plans.size());
            resp.setData(data);
        } catch (Exception e) {
            fallback(resp, "排程建议", e);
        }
        resp.setSuggestions(Arrays.asList("工厂排名？", "产能脉搏？", "哪里有瓶颈？"));
        return resp;
    }

    // ── 智能通知 ──
    public NlQueryResponse handleNotificationQuery() {
        NlQueryResponse resp = build("notification");
        try {
            SmartNotificationResponse n = smartNotificationOrchestrator.generateNotifications();
            StringBuilder sb = new StringBuilder(String.format("🔔 智能通知（待处理 %d 条）：\n", n.getPendingCount()));
            sb.append(String.format("• 今日已发 %d 条，送达率 %.0f%%\n", n.getSentToday(), n.getSuccessRate() * 100));
            for (SmartNotificationResponse.NotificationItem item :
                    n.getNotifications().stream().limit(5).collect(java.util.stream.Collectors.toList())) {
                sb.append(String.format("  %s [%s] %s\n",
                        "high".equals(item.getPriority()) ? "🔴" : "🟡",
                        item.getType(), item.getTitle()));
            }
            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(85);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("pendingCount", n.getPendingCount());
            data.put("sentToday", n.getSentToday());
            resp.setData(data);
        } catch (Exception e) {
            fallback(resp, "智能通知", e);
        }
        resp.setSuggestions(Arrays.asList("有异常告警吗？", "有延期订单吗？", "整体情况怎么样？"));
        return resp;
    }

    // ── 系统自检 ──
    public NlQueryResponse handleSelfHealingQuery() {
        NlQueryResponse resp = build("self_healing");
        try {
            SelfHealingResponse s = selfHealingOrchestrator.diagnose();
            StringBuilder sb = new StringBuilder(String.format("🔧 系统自检报告（健康分 %d）：\n", s.getHealthScore()));
            sb.append(String.format("• 状态：%s | 检查 %d 项 | 问题 %d | 已修复 %d | 需人工 %d\n",
                    s.getStatus(), s.getTotalChecks(), s.getIssuesFound(), s.getAutoFixed(), s.getNeedManual()));
            if (s.getItems() != null) {
                for (SelfHealingResponse.DiagnosisItem item : s.getItems()) {
                    String icon = "ok".equals(item.getResult()) ? "✅" : "fixed".equals(item.getResult()) ? "🔧" : "⚠️";
                    sb.append(String.format("  %s %s — %s\n", icon, item.getCheckName(), item.getDescription()));
                }
            }
            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(90);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("healthScore", s.getHealthScore());
            data.put("status", s.getStatus());
            data.put("issuesFound", s.getIssuesFound());
            data.put("autoFixed", s.getAutoFixed());
            resp.setData(data);
        } catch (Exception e) {
            fallback(resp, "系统自检", e);
        }
        resp.setSuggestions(Arrays.asList("系统健康度如何？", "有异常告警吗？", "学习报告？"));
        return resp;
    }

    // ── 学习报告 ──
    public NlQueryResponse handleLearningReportQuery() {
        NlQueryResponse resp = build("learning_report");
        try {
            LearningReportResponse l = learningReportOrchestrator.getReport();
            StringBuilder sb = new StringBuilder("📚 AI 学习报告：\n");
            sb.append(String.format("• 学习样本：%d 条 | 覆盖工序：%d 种\n", l.getTotalSamples(), l.getStageCount()));
            sb.append(String.format("• 平均置信度：%.1f%%\n", l.getAvgConfidence() * 100));
            sb.append(String.format("• 反馈次数：%d | 最后学习：%s\n", l.getFeedbackCount(),
                    l.getLastLearnTime() != null ? l.getLastLearnTime() : "未运行"));
            if (l.getStages() != null) {
                sb.append("• 各工序学习进展：\n");
                for (LearningReportResponse.StageLearningStat st : l.getStages()) {
                    sb.append(String.format("    %s — %d样本，置信度 %.0f%%\n",
                            st.getStageName(), st.getSampleCount(), st.getConfidence() * 100));
                }
            }
            resp.setAnswer(sb.toString().trim());
            resp.setConfidence(90);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("totalSamples", l.getTotalSamples());
            data.put("stageCount", l.getStageCount());
            data.put("avgConfidence", l.getAvgConfidence());
            resp.setData(data);
        } catch (Exception e) {
            fallback(resp, "学习报告", e);
        }
        resp.setSuggestions(Arrays.asList("系统健康度如何？", "系统自检？", "整体情况怎么样？"));
        return resp;
    }

    // ── 获取健康指数摘要（供 summary 增补使用） ──
    public String getHealthSummaryLine() {
        try {
            HealthIndexResponse h = healthIndexOrchestrator.calculate();
            return String.format("• 系统健康：%d分（%s）%s",
                    h.getHealthIndex(), h.getGrade(),
                    h.getTopRisk() != null ? " ⚠️" + h.getTopRisk() : "");
        } catch (Exception e) {
            return null;
        }
    }

    // ── 工具方法 ──

    private NlQueryResponse build(String intent) {
        NlQueryResponse r = new NlQueryResponse();
        r.setIntent(intent);
        return r;
    }

    private void fallback(NlQueryResponse resp, String module, Exception e) {
        log.warn("[NlQuery] {}查询失败: {}", module, e.getMessage());
        resp.setAnswer(module + "数据暂时不可用，请稍后再试");
        resp.setConfidence(30);
    }

    private double doubleVal(java.math.BigDecimal bd) {
        return bd != null ? bd.doubleValue() : 0;
    }
}
