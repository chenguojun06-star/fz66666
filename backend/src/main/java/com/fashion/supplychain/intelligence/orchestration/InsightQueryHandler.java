package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.dto.NlQueryResponse;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 洞察/对比/概览/帮助/AI兜底 查询处理器
 */
@Component
@Slf4j
public class InsightQueryHandler {

    @Autowired private DashboardQueryService dashboardQueryService;
    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private ScanRecordService scanRecordService;
    @Autowired private AiAdvisorService aiAdvisorService;

    private static final java.util.Set<String> TERMINAL_STATUSES =
            java.util.Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    public NlQueryResponse handleCompareQuery(Long tenantId, String factoryId,
                                               java.util.function.BiConsumer<NlQueryResponse, Long> insightFn) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("compare");

        LocalDate today = LocalDate.now();
        LocalDateTime todayStart = LocalDateTime.of(today, LocalTime.MIN);
        LocalDateTime todayEnd = LocalDateTime.of(today, LocalTime.MAX);
        LocalDateTime yesterdayStart = LocalDateTime.of(today.minusDays(1), LocalTime.MIN);
        LocalDateTime yesterdayEnd = LocalDateTime.of(today.minusDays(1), LocalTime.MAX);

        long todayScan = dashboardQueryService.countScansBetween(todayStart, todayEnd);
        long todayQty = dashboardQueryService.sumTodayScanQuantity();
        long yesterdayScans = dashboardQueryService.countScansBetween(yesterdayStart, yesterdayEnd);
        long todayWarehouse = dashboardQueryService.countWarehousingBetween(todayStart, todayEnd);
        long yesterdayWarehouse = dashboardQueryService.countWarehousingBetween(yesterdayStart, yesterdayEnd);

        StringBuilder sb = new StringBuilder("📊 今日 vs 昨日对比：\n");
        sb.append(String.format("• 扫码次数：今日 %d 次 vs 昨日 %d 次（%s）\n",
                todayScan, yesterdayScans, NlQueryDataHandlers.formatDelta(todayScan, yesterdayScans)));
        sb.append(String.format("• 今日扫码件数：%d 件\n", todayQty));
        sb.append(String.format("• 入库单数：今日 %d 单 vs 昨日 %d 单（%s）",
                todayWarehouse, yesterdayWarehouse, NlQueryDataHandlers.formatDelta(todayWarehouse, yesterdayWarehouse)));

        resp.setAnswer(sb.toString());
        resp.setConfidence(90);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("todayScans", todayScan);
        data.put("yesterdayScans", yesterdayScans);
        data.put("todayScanQty", todayQty);
        data.put("todayWarehouse", todayWarehouse);
        data.put("yesterdayWarehouse", yesterdayWarehouse);
        resp.setData(data);
        insightFn.accept(resp, tenantId);
        resp.setSuggestions(Arrays.asList("这周产量怎么样？", "哪个工厂产量最高？", "有多少延期订单？"));
        return resp;
    }

    public NlQueryResponse handleSummaryQuery(Long tenantId, String factoryId,
                                               NlQuerySmartHandlers smartHandlers) {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("summary");

        QueryWrapper<ProductionOrder> ipQw = new QueryWrapper<>();
        ipQw.eq("tenant_id", tenantId)
            .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
            .eq("delete_flag", 0).notIn("status", TERMINAL_STATUSES);
        long inProgress = productionOrderService.count(ipQw);
        long overdue = dashboardQueryService.countOverdueOrders();
        long todayScan = dashboardQueryService.sumTodayScanQuantity();

        LocalDateTime todayStart = LocalDateTime.of(LocalDate.now(), LocalTime.MIN);
        LocalDateTime todayEnd = LocalDateTime.of(LocalDate.now(), LocalTime.MAX);
        long todayWarehouse = dashboardQueryService.countWarehousingBetween(todayStart, todayEnd);

        StringBuilder sb = new StringBuilder("📊 生产全景概要：\n");

        String healthLine = smartHandlers.getHealthSummaryLine();
        if (healthLine != null) {
            sb.append(healthLine).append("\n");
        }

        sb.append(String.format("• 在制订单：%d 个\n", inProgress));
        sb.append(String.format("• 延期订单：%d 个%s\n", overdue, overdue == 0 ? " ✅" : " ⚠️"));
        sb.append(String.format("• 今日扫码：%d 件\n", todayScan));
        sb.append(String.format("• 今日入库：%d 单\n", todayWarehouse));

        try {
            QueryWrapper<ScanRecord> aqw = new QueryWrapper<>();
            aqw.eq("tenant_id", tenantId)
               .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
               .eq("scan_result", "success")
               .ne("scan_type", "orchestration")
               .ge("scan_time", LocalDateTime.now().minusMinutes(60))
               .select("DISTINCT operator_id");
            long recentWorkers = scanRecordService.list(aqw).stream()
                    .map(ScanRecord::getOperatorId).filter(Objects::nonNull).distinct().count();
            if (recentWorkers > 0) {
                sb.append(String.format("• 最近1小时活跃工人：%d 人", recentWorkers));
            }
        } catch (Exception e) {
            log.warn("[智能问答] 查询最近1小时活跃工人失败: tenantId={}, error={}", tenantId, e.getMessage());
        }

        resp.setAnswer(sb.toString().trim());
        resp.setConfidence(85);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("inProgress", inProgress);
        data.put("overdue", overdue);
        data.put("todayScanQty", todayScan);
        data.put("todayWarehousing", todayWarehouse);
        resp.setData(data);
        resp.setSuggestions(Arrays.asList("有哪些延期订单？", "和昨天比怎么样？", "哪个工厂最忙？", "谁的产量最高？"));
        return resp;
    }

    public NlQueryResponse handleAiDeepFallback(String question, Long tenantId, String factoryId,
                                                  NlQuerySmartHandlers smartHandlers) {
        NlQueryResponse ctx = handleSummaryQuery(tenantId, factoryId, smartHandlers);
        if (aiAdvisorService.isEnabled() && aiAdvisorService.checkAndConsumeQuota(tenantId)) {
            try {
                String ctxStr = buildBriefContext(ctx.getData(), ctx.getAnswer());
                String sys = "你是一位专业的服装供应链管理AI助手，服务于服装制造工厂。\n"
                        + "以下是系统当前实时业务数据（JSON格式）：\n" + ctxStr + "\n"
                        + "业务背景：订单生产流程为 采购面料→裁剪→车缝→尾部整理→质检→入库，"
                        + "涉及多家外协工厂、多名工人，按工序计件发放工资。\n"
                        + "回答要求：用中文简洁回答，不超过150字，优先引用上方数据中的具体数字，"
                        + "末尾若有合适建议可补充1条操作建议。";
                String aiAnswer = aiAdvisorService.chat(sys, question);
                if (aiAnswer != null && !aiAnswer.isBlank()) {
                    NlQueryResponse r = new NlQueryResponse();
                    r.setIntent("ai_direct");
                    r.setAnswer(aiAnswer);
                    r.setConfidence(88);
                    r.setData(ctx.getData());
                    r.setAiInsight(aiAnswer);
                    r.setSuggestions(ctx.getSuggestions());
                    return r;
                }
            } catch (Exception e) {
                log.warn("[NlQuery] AI兜底失败，降级: {}", e.getMessage());
            }
        }
        ctx.setConfidence(40);
        ctx.setIntent("fallback");
        ctx.setAnswer("您的问题暂时没有直接匹配，以下是系统当前概况：\n" + ctx.getAnswer());
        return ctx;
    }

    public NlQueryResponse handleHelpQuery() {
        NlQueryResponse resp = new NlQueryResponse();
        resp.setIntent("help");
        resp.setAnswer("👋 我是AI决策助手，支持 22 类问题，覆盖全系统：\n\n"
                + "📋 订单 & 进度：\n"
                + "• 「订单PO20260301001进度如何？」\n"
                + "• 「有多少延期订单？」「当前在制订单？」\n\n"
                + "📦 产量 & 扫码：\n"
                + "• 「今天扫码多少件？」「和昨天比怎么样？」\n"
                + "• 「今日裁剪数量？」「入库情况如何？」\n\n"
                + "🏭 工厂 & 产能：\n"
                + "• 「哪个工厂最忙？」「工厂排名如何？」\n"
                + "• 「产能负荷怎么样？」「实时脉搏？」\n\n"
                + "👷 人员 & 效率：\n"
                + "• 「谁的产量最高？」「员工效率排名？」\n\n"
                + "🔍 智能分析（12项黑科技）：\n"
                + "• 「系统健康指数？」  — 综合评分\n"
                + "• 「有瓶颈吗？」      — 瓶颈检测\n"
                + "• 「交期风险？」       — 延期预警\n"
                + "• 「有异常吗？」       — 异常行为告警\n"
                + "• 「质量缺陷分布？」   — 缺陷热力图\n"
                + "• 「生产节拍如何？」   — 节拍DNA分析\n"
                + "• 「成本利润？」       — 利润预估\n"
                + "• 「有通知吗？」       — 智能通知\n"
                + "• 「系统自检？」       — 健康诊断\n"
                + "• 「学习报告？」       — 模型置信度\n\n"
                + "📊 综合：「整体情况怎么样？」「质检通过率？」");
        resp.setConfidence(100);
        resp.setSuggestions(Arrays.asList("系统健康指数？", "整体情况怎么样？", "有瓶颈吗？", "今日产量多少？"));
        return resp;
    }

    private String buildBriefContext(Map<String, Object> data, String summaryAnswer) {
        if (data == null || data.isEmpty()) return summaryAnswer != null ? summaryAnswer : "（暂无数据）";
        StringBuilder sb = new StringBuilder();
        data.forEach((k, v) -> sb.append(k).append(": ").append(v).append("，"));
        return sb.toString();
    }
}