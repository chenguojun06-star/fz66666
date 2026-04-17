package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import com.fashion.supplychain.finance.service.FinishedProductSettlementService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 管理层经营洞察编排器 —— 为老板/管理人员提供决策级数据汇总。
 * 供 ManagementDashboardTool（小云AI）调用，不直接暴露 REST 端点。
 *
 * 四大维度：
 * 1. 款式利润排名：哪些款赚钱、哪些款亏钱
 * 2. 工厂绩效对比：完成率、准时率、产能利用
 * 3. 关键风险识别：逾期、低进度、高次品
 * 4. 老板摘要：一句话概览经营全貌
 */
@Slf4j
@Service
public class ManagementInsightOrchestrator {

    @Autowired
    private FinishedProductSettlementService settlementService;
    @Autowired
    private ProductionOrderService productionOrderService;

    private static final java.util.Set<String> TERMINAL_STATUSES = java.util.Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    // ────────────────────── 1. 款式利润排名 ──────────────────────
    public Map<String, Object> getStyleProfitability(Long tenantId) {
        Map<String, Object> result = new LinkedHashMap<>();

        List<FinishedProductSettlement> settlements = settlementService.lambdaQuery()
                .eq(FinishedProductSettlement::getTenantId, tenantId)
                .isNotNull(FinishedProductSettlement::getProfit)
                .list();

        if (settlements.isEmpty()) {
            result.put("message", "暂无结算数据，无法生成利润排名");
            result.put("styles", List.of());
            return result;
        }

        // 按款号聚合
        Map<String, List<FinishedProductSettlement>> byStyle = settlements.stream()
                .filter(s -> s.getStyleNo() != null && !s.getStyleNo().isBlank())
                .collect(Collectors.groupingBy(FinishedProductSettlement::getStyleNo));

        List<Map<String, Object>> styles = byStyle.entrySet().stream().map(e -> {
            List<FinishedProductSettlement> items = e.getValue();
            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("styleNo", e.getKey());
            dto.put("orderCount", items.size());

            BigDecimal totalRevenue = items.stream()
                    .map(s -> s.getTotalAmount() != null ? s.getTotalAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal totalProfit = items.stream()
                    .map(s -> s.getProfit() != null ? s.getProfit() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal totalMaterial = items.stream()
                    .map(s -> s.getMaterialCost() != null ? s.getMaterialCost() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal totalProduction = items.stream()
                    .map(s -> s.getProductionCost() != null ? s.getProductionCost() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            dto.put("totalRevenue", totalRevenue);
            dto.put("totalProfit", totalProfit);
            dto.put("materialCost", totalMaterial);
            dto.put("productionCost", totalProduction);

            BigDecimal avgMargin = totalRevenue.compareTo(BigDecimal.ZERO) > 0
                    ? totalProfit.multiply(BigDecimal.valueOf(100)).divide(totalRevenue, 1, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            dto.put("profitMarginPct", avgMargin + "%");
            dto.put("profitMarginValue", avgMargin);

            int totalQty = items.stream()
                    .mapToInt(s -> s.getOrderQuantity() != null ? s.getOrderQuantity() : 0).sum();
            dto.put("totalQuantity", totalQty);

            return dto;
        }).sorted((a, b) -> ((BigDecimal) b.get("totalProfit")).compareTo((BigDecimal) a.get("totalProfit")))
                .collect(Collectors.toList());

        result.put("styleCount", styles.size());
        result.put("styles", styles);

        // Top3 / Bottom3
        if (styles.size() >= 2) {
            result.put("top3", styles.subList(0, Math.min(3, styles.size())));
            result.put("bottom3", styles.subList(Math.max(0, styles.size() - 3), styles.size()));
        }

        return result;
    }

    // ────────────────────── 2. 工厂绩效对比 ──────────────────────
    public Map<String, Object> getFactoryPerformance(Long tenantId) {
        Map<String, Object> result = new LinkedHashMap<>();

        QueryWrapper<ProductionOrder> q = new QueryWrapper<>();
        q.eq("tenant_id", tenantId).eq("delete_flag", 0)
                .in("status", "IN_PROGRESS", "COMPLETED")
                .isNotNull("factory_name");
        List<ProductionOrder> orders = productionOrderService.list(q);

        if (orders.isEmpty()) {
            result.put("message", "暂无工厂订单数据");
            result.put("factories", List.of());
            return result;
        }

        Map<String, List<ProductionOrder>> byFactory = orders.stream()
                .filter(o -> o.getFactoryName() != null && !o.getFactoryName().isBlank())
                .collect(Collectors.groupingBy(ProductionOrder::getFactoryName));

        List<Map<String, Object>> factories = byFactory.entrySet().stream().map(e -> {
            List<ProductionOrder> fOrders = e.getValue();
            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("factoryName", e.getKey());
            dto.put("totalOrders", fOrders.size());

            long completed = fOrders.stream().filter(o -> "COMPLETED".equals(o.getStatus())).count();
            dto.put("completedOrders", completed);
            dto.put("completionRate", fOrders.isEmpty() ? "0%"
                    : String.format("%.1f%%", (double) completed / fOrders.size() * 100));

            int totalQty = fOrders.stream()
                    .mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0).sum();
            int completedQty = fOrders.stream()
                    .mapToInt(o -> o.getCompletedQuantity() != null ? o.getCompletedQuantity() : 0).sum();
            dto.put("totalQuantity", totalQty);
            dto.put("completedQuantity", completedQty);

            double avgProgress = fOrders.stream()
                    .mapToInt(o -> o.getProductionProgress() != null ? o.getProductionProgress() : 0)
                    .average().orElse(0);
            dto.put("avgProgress", Math.round(avgProgress) + "%");

            // 准时率
            long overdue = fOrders.stream()
                    .filter(o -> !"COMPLETED".equals(o.getStatus()) && o.getPlannedEndDate() != null
                            && o.getPlannedEndDate().isBefore(LocalDateTime.now()))
                    .count();
            dto.put("overdueCount", overdue);
            double onTimeRate = fOrders.isEmpty() ? 100 : (1 - (double) overdue / fOrders.size()) * 100;
            dto.put("onTimeRate", String.format("%.1f%%", onTimeRate));

            // 综合评分：完成率40% + 准时率30% + 平均进度30%
            double completionScore = fOrders.isEmpty() ? 0 : (double) completed / fOrders.size() * 100;
            double score = completionScore * 0.4 + onTimeRate * 0.3 + avgProgress * 0.3;
            dto.put("performanceScore", Math.round(score));

            return dto;
        }).sorted((a, b) -> Long.compare((long) b.get("performanceScore"), (long) a.get("performanceScore")))
                .collect(Collectors.toList());

        result.put("factoryCount", factories.size());
        result.put("factories", factories);
        return result;
    }

    // ────────────────────── 3. 关键风险识别 ──────────────────────
    public Map<String, Object> getKeyRisks(Long tenantId) {
        Map<String, Object> result = new LinkedHashMap<>();

        QueryWrapper<ProductionOrder> q = new QueryWrapper<>();
        q.eq("tenant_id", tenantId).eq("delete_flag", 0)
                .notIn("status", TERMINAL_STATUSES);
        List<ProductionOrder> activeOrders = productionOrderService.list(q);

        // 逾期订单
        LocalDateTime now = LocalDateTime.now();
        List<Map<String, Object>> overdueOrders = activeOrders.stream()
                .filter(o -> o.getPlannedEndDate() != null && o.getPlannedEndDate().isBefore(now))
                .sorted(Comparator.comparing(ProductionOrder::getPlannedEndDate))
                .limit(10)
                .map(this::buildRiskOrderDto)
                .collect(Collectors.toList());

        // 高风险：7天内到期 且 进度<50%
        List<Map<String, Object>> highRiskOrders = activeOrders.stream()
                .filter(o -> o.getPlannedEndDate() != null
                        && o.getPlannedEndDate().isAfter(now)
                        && o.getPlannedEndDate().isBefore(now.plusDays(7))
                        && (o.getProductionProgress() == null || o.getProductionProgress() < 50))
                .sorted(Comparator.comparing(ProductionOrder::getPlannedEndDate))
                .limit(10)
                .map(this::buildRiskOrderDto)
                .collect(Collectors.toList());

        // 低进度紧急单：标记为紧急但进度<30%
        List<Map<String, Object>> stuckUrgent = activeOrders.stream()
                .filter(o -> "urgent".equalsIgnoreCase(o.getUrgencyLevel())
                        && (o.getProductionProgress() == null || o.getProductionProgress() < 30))
                .limit(5)
                .map(this::buildRiskOrderDto)
                .collect(Collectors.toList());

        result.put("overdueCount", overdueOrders.size());
        result.put("overdueOrders", overdueOrders);
        result.put("highRiskCount", highRiskOrders.size());
        result.put("highRiskOrders", highRiskOrders);
        result.put("stuckUrgentCount", stuckUrgent.size());
        result.put("stuckUrgentOrders", stuckUrgent);
        result.put("totalActiveOrders", activeOrders.size());

        // 总风险等级
        String riskLevel = !overdueOrders.isEmpty() ? "RED"
                : !highRiskOrders.isEmpty() ? "ORANGE"
                : !stuckUrgent.isEmpty() ? "YELLOW" : "GREEN";
        result.put("overallRiskLevel", riskLevel);

        return result;
    }

    // ────────────────────── 4. 老板摘要 ──────────────────────
    public Map<String, Object> getExecutiveSummary(Long tenantId) {
        Map<String, Object> summary = new LinkedHashMap<>();

        Map<String, Object> profitability = getStyleProfitability(tenantId);
        Map<String, Object> factory = getFactoryPerformance(tenantId);
        Map<String, Object> risks = getKeyRisks(tenantId);

        summary.put("styleProfitability", profitability);
        summary.put("factoryPerformance", factory);
        summary.put("risks", risks);

        // 一句话概览
        StringBuilder headline = new StringBuilder();
        int overdueCount = (int) risks.getOrDefault("overdueCount", 0);
        int highRiskCount = (int) risks.getOrDefault("highRiskCount", 0);
        int totalActive = (int) risks.getOrDefault("totalActiveOrders", 0);

        if (overdueCount > 0) {
            headline.append(String.format("🔴 当前有%d张逾期订单需要立即跟进", overdueCount));
        } else if (highRiskCount > 0) {
            headline.append(String.format("🟠 当前有%d张高风险订单（7天内到期且进度不足50%%）", highRiskCount));
        } else {
            headline.append("🟢 当前无逾期订单");
        }
        headline.append(String.format("，在制订单共%d张。", totalActive));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> topStyles = (List<Map<String, Object>>) profitability.get("top3");
        if (topStyles != null && !topStyles.isEmpty()) {
            headline.append(String.format("利润最高款：%s", topStyles.get(0).get("styleNo")));
        }

        summary.put("headline", headline.toString());
        summary.put("overallRiskLevel", risks.get("overallRiskLevel"));

        return summary;
    }

    // ────────────── 辅助方法 ──────────────
    private Map<String, Object> buildRiskOrderDto(ProductionOrder o) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("orderId", o.getId());
        dto.put("orderNo", o.getOrderNo());
        dto.put("styleNo", o.getStyleNo());
        dto.put("factoryName", o.getFactoryName());
        dto.put("orderQuantity", o.getOrderQuantity());
        dto.put("progress", (o.getProductionProgress() != null ? o.getProductionProgress() : 0) + "%");
        dto.put("status", o.getStatus());
        dto.put("plannedEndDate", o.getPlannedEndDate() != null ? o.getPlannedEndDate().toString() : null);
        if (o.getPlannedEndDate() != null) {
            long daysOverdue = java.time.Duration.between(o.getPlannedEndDate(), LocalDateTime.now()).toDays();
            dto.put("daysOverdue", daysOverdue > 0 ? daysOverdue : 0);
            dto.put("daysRemaining", daysOverdue < 0 ? -daysOverdue : 0);
        }
        dto.put("urgencyLevel", o.getUrgencyLevel());
        dto.put("merchandiser", o.getMerchandiser());
        return dto;
    }
}
