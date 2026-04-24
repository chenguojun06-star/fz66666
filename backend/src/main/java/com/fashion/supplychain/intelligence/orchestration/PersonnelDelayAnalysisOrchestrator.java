package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 人员延期分析编排器 — 按跟单员/纸样师/工厂维度分析延期情况
 */
@Service
@Slf4j
public class PersonnelDelayAnalysisOrchestrator {

    private static final Set<String> TERMINAL_STATUSES = Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    @Autowired
    private ProductionOrderService productionOrderService;

    public Map<String, Object> analyze() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId();

        LambdaQueryWrapper<ProductionOrder> qw = new LambdaQueryWrapper<>();
        qw.eq(ProductionOrder::getTenantId, tenantId)
          .eq(factoryId != null && !factoryId.isBlank(), ProductionOrder::getFactoryId, factoryId)
          .eq(ProductionOrder::getDeleteFlag, 0)
          .isNotNull(ProductionOrder::getPlannedEndDate)
          .select(ProductionOrder::getId, ProductionOrder::getOrderNo,
                  ProductionOrder::getMerchandiser, ProductionOrder::getPatternMaker,
                  ProductionOrder::getFactoryName, ProductionOrder::getPlannedEndDate,
                  ProductionOrder::getActualEndDate, ProductionOrder::getStatus,
                  ProductionOrder::getProductionProgress);

        List<ProductionOrder> orders = productionOrderService.list(qw);
        LocalDate today = LocalDate.now();

        List<ProductionOrder> delayed = orders.stream().filter(o -> {
            if (o.getActualEndDate() != null && o.getPlannedEndDate() != null) {
                return o.getActualEndDate().toLocalDate().isAfter(o.getPlannedEndDate().toLocalDate());
            }
            if (o.getPlannedEndDate() != null && o.getActualEndDate() == null) {
                boolean pastDue = o.getPlannedEndDate().toLocalDate().isBefore(today);
                boolean notDone = !TERMINAL_STATUSES.contains(o.getStatus() == null ? "" : o.getStatus().trim().toLowerCase());
                return pastDue && notDone;
            }
            return false;
        }).collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalOrders", orders.size());
        result.put("delayedCount", delayed.size());
        result.put("delayRate", orders.isEmpty() ? 0 : Math.round(delayed.size() * 100.0 / orders.size()));

        result.put("byMerchandiser", groupByField(delayed, today, ProductionOrder::getMerchandiser, "跟单员"));
        result.put("byPatternMaker", groupByField(delayed, today, ProductionOrder::getPatternMaker, "纸样师"));
        result.put("byFactory", groupByField(delayed, today, ProductionOrder::getFactoryName, "工厂"));

        // 最严重延期订单Top5
        List<Map<String, Object>> top5 = delayed.stream()
                .sorted(Comparator.comparingLong((ProductionOrder o) -> calcDelayDays(o, today)).reversed())
                .limit(5)
                .map(o -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("orderNo", o.getOrderNo());
                    m.put("merchandiser", o.getMerchandiser());
                    m.put("factory", o.getFactoryName());
                    m.put("delayDays", calcDelayDays(o, today));
                    m.put("progress", o.getProductionProgress());
                    return m;
                }).collect(Collectors.toList());
        result.put("worstOrders", top5);

        return result;
    }

    private long calcDelayDays(ProductionOrder o, LocalDate today) {
        if (o.getPlannedEndDate() == null) return 0;
        LocalDate planned = o.getPlannedEndDate().toLocalDate();
        LocalDate actual = o.getActualEndDate() != null ? o.getActualEndDate().toLocalDate() : today;
        return Math.max(0, ChronoUnit.DAYS.between(planned, actual));
    }

    @FunctionalInterface
    private interface FieldExtractor {
        String apply(ProductionOrder o);
    }

    private List<Map<String, Object>> groupByField(List<ProductionOrder> delayed, LocalDate today,
                                                    FieldExtractor extractor, String label) {
        Map<String, List<ProductionOrder>> grouped = delayed.stream()
                .filter(o -> extractor.apply(o) != null && !extractor.apply(o).isBlank())
                .collect(Collectors.groupingBy(o -> extractor.apply(o)));

        return grouped.entrySet().stream()
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("name", e.getKey());
                    m.put("delayedCount", e.getValue().size());
                    double avgDays = e.getValue().stream()
                            .mapToLong(o -> calcDelayDays(o, today))
                            .average().orElse(0);
                    m.put("avgDelayDays", Math.round(avgDays * 10) / 10.0);
                    long maxDelay = e.getValue().stream()
                            .mapToLong(o -> calcDelayDays(o, today)).max().orElse(0);
                    m.put("maxDelayDays", maxDelay);
                    return m;
                })
                .sorted(Comparator.comparingInt((Map<String, Object> m) -> (int) m.get("delayedCount")).reversed())
                .collect(Collectors.toList());
    }
}
