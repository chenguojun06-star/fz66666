package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 延期趋势分析编排器 — 按周/月粒度统计延期趋势（生产+样板合并）
 */
@Service
@Slf4j
public class DelayTrendOrchestrator {

    private static final Set<String> TERMINAL_STATUSES = Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private PatternProductionService patternProductionService;

    public Map<String, Object> analyze(String period) {
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId();
        int weeks = "month".equalsIgnoreCase(period) ? 12 : 8;

        LocalDate today = LocalDate.now();
        LocalDate startDate = today.minusWeeks(weeks);

        // 查询生产订单
        LambdaQueryWrapper<ProductionOrder> oqw = new LambdaQueryWrapper<>();
        oqw.eq(tenantId != null, ProductionOrder::getTenantId, tenantId)
           .eq(factoryId != null && !factoryId.isBlank(), ProductionOrder::getFactoryId, factoryId)
           .eq(ProductionOrder::getDeleteFlag, 0)
           .isNotNull(ProductionOrder::getPlannedEndDate)
           .ge(ProductionOrder::getPlannedEndDate, startDate.atStartOfDay())
           .select(ProductionOrder::getId, ProductionOrder::getPlannedEndDate,
                   ProductionOrder::getActualEndDate, ProductionOrder::getStatus);
        List<ProductionOrder> orders = productionOrderService.list(oqw);

        // 查询样板
        LambdaQueryWrapper<PatternProduction> sqw = new LambdaQueryWrapper<>();
        sqw.eq(tenantId != null, PatternProduction::getTenantId, tenantId)
           .eq(PatternProduction::getDeleteFlag, 0)
           .isNotNull(PatternProduction::getDeliveryTime)
           .ge(PatternProduction::getDeliveryTime, startDate.atStartOfDay())
           .select(PatternProduction::getId, PatternProduction::getDeliveryTime,
                   PatternProduction::getCompleteTime, PatternProduction::getStatus);
        List<PatternProduction> samples = patternProductionService.list(sqw);

        // 按周分桶
        List<Map<String, Object>> trend = new ArrayList<>();
        for (int i = 0; i < weeks; i++) {
            LocalDate weekStart = today.minusWeeks(weeks - i);
            LocalDate weekEnd = today.minusWeeks(weeks - i - 1);

            long orderTotal = orders.stream()
                    .filter(o -> inRange(o.getPlannedEndDate(), weekStart, weekEnd)).count();
            long orderDelayed = orders.stream()
                    .filter(o -> inRange(o.getPlannedEndDate(), weekStart, weekEnd))
                    .filter(o -> isOrderDelayed(o, weekEnd)).count();

            long sampleTotal = samples.stream()
                    .filter(s -> inRange(s.getDeliveryTime(), weekStart, weekEnd)).count();
            long sampleDelayed = samples.stream()
                    .filter(s -> inRange(s.getDeliveryTime(), weekStart, weekEnd))
                    .filter(s -> isSampleDelayed(s, weekEnd)).count();

            long total = orderTotal + sampleTotal;
            long delayed = orderDelayed + sampleDelayed;

            Map<String, Object> bucket = new LinkedHashMap<>();
            bucket.put("weekLabel", weekStart.getMonthValue() + "/" + weekStart.getDayOfMonth()
                    + "-" + weekEnd.getMonthValue() + "/" + weekEnd.getDayOfMonth());
            bucket.put("total", total);
            bucket.put("delayed", delayed);
            bucket.put("delayRate", total == 0 ? 0 : Math.round(delayed * 100.0 / total));
            bucket.put("orderDelayed", orderDelayed);
            bucket.put("sampleDelayed", sampleDelayed);
            trend.add(bucket);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("period", period != null ? period : "week");
        result.put("weeks", weeks);
        result.put("trend", trend);

        // 趋势判断
        if (trend.size() >= 3) {
            int last = (int) trend.get(trend.size() - 1).get("delayRate");
            int prev = (int) trend.get(trend.size() - 2).get("delayRate");
            int prev2 = (int) trend.get(trend.size() - 3).get("delayRate");
            String direction = last > prev && prev > prev2 ? "恶化" :
                    last < prev && prev < prev2 ? "改善" : "波动";
            result.put("trendDirection", direction);
        }

        return result;
    }

    private boolean inRange(LocalDateTime dt, LocalDate start, LocalDate end) {
        if (dt == null) return false;
        LocalDate d = dt.toLocalDate();
        return !d.isBefore(start) && d.isBefore(end);
    }

    private boolean isOrderDelayed(ProductionOrder o, LocalDate asOf) {
        if (o.getActualEndDate() != null && o.getPlannedEndDate() != null) {
            return o.getActualEndDate().toLocalDate().isAfter(o.getPlannedEndDate().toLocalDate());
        }
        return o.getPlannedEndDate() != null
                && o.getPlannedEndDate().toLocalDate().isBefore(asOf)
                && !TERMINAL_STATUSES.contains(o.getStatus() == null ? "" : o.getStatus().trim().toLowerCase());
    }

    private boolean isSampleDelayed(PatternProduction s, LocalDate asOf) {
        if (s.getCompleteTime() != null && s.getDeliveryTime() != null) {
            return s.getCompleteTime().toLocalDate().isAfter(s.getDeliveryTime().toLocalDate());
        }
        return s.getDeliveryTime() != null
                && s.getDeliveryTime().toLocalDate().isBefore(asOf)
                && !"COMPLETED".equalsIgnoreCase(s.getStatus());
    }
}
