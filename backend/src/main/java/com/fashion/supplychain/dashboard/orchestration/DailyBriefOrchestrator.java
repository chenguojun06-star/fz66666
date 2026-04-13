package com.fashion.supplychain.dashboard.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.dashboard.dto.BriefDecisionCard;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import java.util.stream.Collectors;

/**
 * 智能运营日报编排器
 * 汇总昨日业绩 + 今日风险 + 优先建议，提供给仪表盘展示
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class DailyBriefOrchestrator {

    private static final long DAILY_BRIEF_AI_TIMEOUT_MS = 1200L;

    private static final ExecutorService DAILY_BRIEF_AI_EXECUTOR = Executors.newFixedThreadPool(2, runnable -> {
        Thread thread = new Thread(runnable);
        thread.setName("daily-brief-ai");
        thread.setDaemon(true);
        return thread;
    });

    private final DashboardQueryService dashboardQueryService;
    private final ProductionOrderService productionOrderService;
    private final DailyBriefDecisionOrchestrator dailyBriefDecisionOrchestrator;

    /** 可选注入：Key 未配置时为 null，业务逻辑降级为规则建议 */
    @Autowired(required = false)
    private AiAdvisorService aiAdvisorService;

    /**
     * 获取智能运营日报
     * ① 昨日入库单数/件数
     * ② 今日扫码总次数
     * ③ 逾期订单数
     * ④ 高风险订单（IN_PROGRESS + 7天内到期 + 进度<50%）
     * ⑤ 首要关注订单
     * ⑥ 智能建议文案
     */
    public Map<String, Object> getBrief() {
        Map<String, Object> brief = new LinkedHashMap<>();
        LocalDate today = LocalDate.now();
        LocalDate yesterday = today.minusDays(1);
        DateTimeFormatter cnDate = DateTimeFormatter.ofPattern("yyyy年MM月dd日");
        brief.put("date", today.format(cnDate));

        // ① 昨日入库
        LocalDateTime ydStart = yesterday.atStartOfDay();
        LocalDateTime ydEnd   = yesterday.atTime(LocalTime.MAX);
        long ydCount = dashboardQueryService.countWarehousingBetween(ydStart, ydEnd);
        long ydQty   = dashboardQueryService.sumWarehousingQuantityBetween(ydStart, ydEnd);
        brief.put("yesterdayWarehousingCount", (int) ydCount);
        brief.put("yesterdayWarehousingQuantity", (int) ydQty);

        // ② 今日扫码 + 近7天扫码
        LocalDateTime tdStart = today.atStartOfDay();
        LocalDateTime tdEnd   = today.atTime(LocalTime.MAX);
        long todayScan = dashboardQueryService.countScansBetween(tdStart, tdEnd);
        brief.put("todayScanCount", (int) todayScan);
        LocalDateTime week7Start = today.minusDays(7).atStartOfDay();
        long weekScan = dashboardQueryService.countScansBetween(week7Start, tdEnd);
        brief.put("weekScanCount", (int) weekScan);
        // 近7天入库
        long weekWh = dashboardQueryService.countWarehousingBetween(week7Start, tdEnd);
        brief.put("weekWarehousingCount", (int) weekWh);

        // ③ 今日下单数 / 今日入库数 / 今日出库数
        long todayOrders = dashboardQueryService.countProductionOrdersBetween(tdStart, tdEnd);
        brief.put("todayOrderCount", (int) todayOrders);
        long todayOrderQty = dashboardQueryService.sumOrderQuantityBetween(tdStart, tdEnd);
        brief.put("todayOrderQuantity", (int) todayOrderQty);
        long todayInbound = dashboardQueryService.countWarehousingBetween(tdStart, tdEnd);
        brief.put("todayInboundCount", (int) todayInbound);
        long todayInboundQty = dashboardQueryService.sumWarehousingQuantityBetween(tdStart, tdEnd);
        brief.put("todayInboundQuantity", (int) todayInboundQty);
        long todayOutbound = dashboardQueryService.countOutstockBetween(tdStart, tdEnd);
        brief.put("todayOutboundCount", (int) todayOutbound);
        long todayOutboundQty = dashboardQueryService.sumOutstockQuantityBetween(tdStart, tdEnd);
        brief.put("todayOutboundQuantity", (int) todayOutboundQty);

        // ④ 逾期订单数 + 拉取逾期订单明细（用于决策卡工厂分布展示）
        long overdueCount = dashboardQueryService.countOverdueOrders();
        brief.put("overdueOrderCount", (int) overdueCount);
        List<com.fashion.supplychain.production.entity.ProductionOrder> overdueOrders =
            dashboardQueryService.listOverdueOrders(60);

        // ④ 高风险订单（进行中 + 7天内到期但【尚未逾期】 + 进度 < 50%）
        // 注意：已逾期订单已在 overdueOrderCount 中计数，此处排除避免双重计数
        String briefFactoryId = UserContext.factoryId(); // 🔒 工厂账号只看自己工厂的订单
        LocalDateTime nowTime = today.atStartOfDay();
        LocalDateTime deadline = today.plusDays(7).atTime(LocalTime.MAX);
        List<ProductionOrder> highRisk = productionOrderService.list(
            new LambdaQueryWrapper<ProductionOrder>()
                .select(
                    ProductionOrder::getId,
                    ProductionOrder::getOrderNo,
                    ProductionOrder::getStyleNo,
                    ProductionOrder::getFactoryName,
                    ProductionOrder::getProductionProgress,
                    ProductionOrder::getPlannedEndDate,
                    ProductionOrder::getOrderQuantity,
                    ProductionOrder::getMerchandiser
                )
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getTenantId, UserContext.tenantId())  // 🔒 租户隔离
                .eq(org.springframework.util.StringUtils.hasText(briefFactoryId), ProductionOrder::getFactoryId, briefFactoryId)  // 🔒 工厂隔离
                .eq(ProductionOrder::getStatus, "production")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .ge(ProductionOrder::getPlannedEndDate, nowTime)   // 未逾期（今天之后）
                .le(ProductionOrder::getPlannedEndDate, deadline)   // 7天内到期
        ).stream()
            .filter(o -> o.getProductionProgress() == null || o.getProductionProgress() < 50)
            .sorted(Comparator.comparing(ProductionOrder::getPlannedEndDate))
            .collect(Collectors.toList());
        brief.put("highRiskOrderCount", highRisk.size());

        // ⑤ 首要关注订单（最近到期的高风险单）
        if (!highRisk.isEmpty()) {
            ProductionOrder top = highRisk.get(0);
            Map<String, Object> topOrder = new LinkedHashMap<>();
            topOrder.put("orderNo", top.getOrderNo());
            topOrder.put("styleNo", top.getStyleNo());
            topOrder.put("factoryName", top.getFactoryName());
            topOrder.put("progress", top.getProductionProgress() == null ? 0 : top.getProductionProgress());
            long daysLeft = ChronoUnit.DAYS.between(today, top.getPlannedEndDate().toLocalDate());
            topOrder.put("daysLeft", (int) daysLeft);
            brief.put("topPriorityOrder", topOrder);
        }

        // ⑤+ 待办事项详情（前端小云助手展示具体订单内容）
        List<Map<String, Object>> pendingItems = highRisk.stream()
            .limit(3)
            .map(o -> {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("orderNo", o.getOrderNo());
                item.put("styleNo", o.getStyleNo() != null ? o.getStyleNo() : "");
                item.put("factoryName", o.getFactoryName() != null ? o.getFactoryName() : "");
                item.put("progress", o.getProductionProgress() != null ? o.getProductionProgress() : 0);
                item.put("daysLeft", (int) ChronoUnit.DAYS.between(today, o.getPlannedEndDate().toLocalDate()));
                return item;
            })
            .collect(Collectors.toList());
        brief.put("pendingItems", pendingItems);

        List<BriefDecisionCard> decisionCards = dailyBriefDecisionOrchestrator.buildDecisionCards(
            today,
            overdueCount,
            todayScan,
            ydCount,
            ydQty,
            highRisk,
            overdueOrders
        );
        brief.put("decisionCards", decisionCards);

        // ⑥ 智能建议文案
        List<String> suggestions = new ArrayList<>();
        if (overdueCount > 0) {
            suggestions.add("🚨 有 " + overdueCount + " 张订单已逾期，请立即跟进工厂");
        }
        if (!highRisk.isEmpty()) {
            ProductionOrder top = highRisk.get(0);
            long daysLeft = ChronoUnit.DAYS.between(today, top.getPlannedEndDate().toLocalDate());
            suggestions.add("⚡ " + top.getOrderNo() + " 还剩 " + daysLeft + " 天到期，进度仅 "
                + (top.getProductionProgress() == null ? 0 : top.getProductionProgress()) + "%，建议今日催单");
        }
        if (suggestions.isEmpty()) {
            suggestions.add("✅ 整体生产状态良好，暂无高风险订单");
        }

        // ⑥+ AI增强建议：Key 已配置时调用 DeepSeek 替换规则文案，失败则无缝降级
        if (aiAdvisorService != null && aiAdvisorService.isEnabled()) {
            try {
                StringBuilder ctx = new StringBuilder();
                ctx.append("逾期").append(overdueCount).append("张");
                if (!highRisk.isEmpty()) {
                    ProductionOrder top = highRisk.get(0);
                    long daysLeft = ChronoUnit.DAYS.between(today, top.getPlannedEndDate().toLocalDate());
                    ctx.append("，高风险").append(highRisk.size()).append("张，最紧急：")
                       .append(top.getOrderNo())
                       .append("（进度").append(top.getProductionProgress() == null ? 0 : top.getProductionProgress())
                       .append("%，还剩").append(daysLeft).append("天）");
                }
                ctx.append("，今日扫码").append(todayScan).append("次")
                   .append("，昨日入库").append(ydCount).append("单/").append(ydQty).append("件");
                     String aiText = getTimedDailyAdvice(ctx.toString());
                if (aiText != null && !aiText.isBlank()) {
                    List<String> aiList = Arrays.stream(aiText.split("\n"))
                            .map(String::trim)
                            .filter(s -> !s.isEmpty())
                            .collect(Collectors.toList());
                    if (!aiList.isEmpty()) {
                        suggestions.clear();
                        suggestions.addAll(aiList);
                        brief.put("suggestionsSource", "ai");
                    }
                }
            } catch (Exception e) {
                log.warn("[DailyBrief] AI建议生成失败，降级使用规则建议: {}", e.getMessage());
            }
        }

        brief.put("suggestions", suggestions);

        // ⑦ 7日趋势数据（扫码/入库/下单）— 前端折线图使用
        brief.put("trendData", buildTrendData(today));

        return brief;
    }

    /**
     * 构建近7天每日趋势数据：扫码次数 / 入库单数 / 下单数
     */
    private List<Map<String, Object>> buildTrendData(LocalDate today) {
        DateTimeFormatter labelFmt = DateTimeFormatter.ofPattern("MM-dd");
        List<Map<String, Object>> trend = new ArrayList<>(7);
        for (int i = 6; i >= 0; i--) {
            LocalDate d = today.minusDays(i);
            LocalDateTime dayStart = d.atStartOfDay();
            LocalDateTime dayEnd = d.atTime(LocalTime.MAX);
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("date", d.format(labelFmt));
            point.put("scanCount", (int) dashboardQueryService.countScansBetween(dayStart, dayEnd));
            point.put("warehousingCount", (int) dashboardQueryService.countWarehousingBetween(dayStart, dayEnd));
            point.put("orderCount", (int) dashboardQueryService.countProductionOrdersBetween(dayStart, dayEnd));
            trend.add(point);
        }
        return trend;
    }

    private String getTimedDailyAdvice(String contextSummary) {
        UserContext snapshot = copyUserContext(UserContext.get());
        return CompletableFuture
                .supplyAsync(() -> withUserContext(snapshot,
                        () -> aiAdvisorService.getDailyAdvice(contextSummary)), DAILY_BRIEF_AI_EXECUTOR)
                .completeOnTimeout(null, DAILY_BRIEF_AI_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                .exceptionally(ex -> {
                    log.warn("[DailyBrief] AI建议异步调用失败，降级规则建议: {}", ex.getMessage());
                    return null;
                })
                .join();
    }

    private <T> T withUserContext(UserContext snapshot, Supplier<T> supplier) {
        UserContext previous = UserContext.get();
        try {
            if (snapshot != null) {
                UserContext.set(snapshot);
            } else {
                UserContext.clear();
            }
            return supplier.get();
        } finally {
            if (previous != null) {
                UserContext.set(previous);
            } else {
                UserContext.clear();
            }
        }
    }

    private UserContext copyUserContext(UserContext source) {
        if (source == null) {
            return null;
        }
        UserContext copy = new UserContext();
        copy.setUserId(source.getUserId());
        copy.setUsername(source.getUsername());
        copy.setRole(source.getRole());
        copy.setPermissionRange(source.getPermissionRange());
        copy.setTeamId(source.getTeamId());
        copy.setTenantId(source.getTenantId());
        copy.setTenantOwner(source.getTenantOwner());
        copy.setSuperAdmin(source.getSuperAdmin());
        copy.setFactoryId(source.getFactoryId());
        return copy;
    }
}
