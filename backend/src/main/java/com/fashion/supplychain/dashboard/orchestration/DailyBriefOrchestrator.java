package com.fashion.supplychain.dashboard.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 智能运营日报编排器
 * 汇总昨日业绩 + 今日风险 + 优先建议，提供给仪表盘展示
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class DailyBriefOrchestrator {

    private final DashboardQueryService dashboardQueryService;
    private final ProductionOrderService productionOrderService;

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
        brief.put("yesterdayWarehousingCount", ydCount);
        brief.put("yesterdayWarehousingQuantity", ydQty);

        // ② 今日扫码
        LocalDateTime tdStart = today.atStartOfDay();
        LocalDateTime tdEnd   = today.atTime(LocalTime.MAX);
        long todayScan = dashboardQueryService.countScansBetween(tdStart, tdEnd);
        brief.put("todayScanCount", todayScan);

        // ③ 逾期订单数
        long overdueCount = dashboardQueryService.countOverdueOrders();
        brief.put("overdueOrderCount", overdueCount);

        // ④ 高风险订单（进行中 + 7天内到期 + 进度 < 50%）
        LocalDateTime deadline = today.plusDays(7).atTime(LocalTime.MAX);
        List<ProductionOrder> highRisk = productionOrderService.list(
            new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getStatus, "IN_PROGRESS")
                .isNotNull(ProductionOrder::getPlannedEndDate)
                .le(ProductionOrder::getPlannedEndDate, deadline)
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
            topOrder.put("daysLeft", daysLeft);
            brief.put("topPriorityOrder", topOrder);
        }

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
        brief.put("suggestions", suggestions);

        return brief;
    }
}
