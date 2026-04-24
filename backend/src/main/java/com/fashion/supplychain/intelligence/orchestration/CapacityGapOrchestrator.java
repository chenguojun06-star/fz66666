package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.CapacityGapResponse;
import com.fashion.supplychain.intelligence.dto.CapacityGapResponse.FactoryCapacityGap;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 工厂产能缺口预测引擎（B2）
 *
 * <p>算法：
 * 1. 统计各工厂在手订单总件数（status IN production/cutting）
 * 2. 累计近30天各工厂日均产出（scan_record success）
 * 3. 估算完成天数 = 在手件数 / 日均产出
 * 4. 与最近计划交期对比得出缺口天数
 */
@Service
@Slf4j
public class CapacityGapOrchestrator {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    /** 统计产出的天数窗口 */
    private static final int CAPACITY_WINDOW_DAYS = 30;
    /** 默认日均产出（无历史数据时的保守估计） */
    private static final double DEFAULT_DAILY_CAPACITY = 20.0;

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    public CapacityGapResponse analyze() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId();
        CapacityGapResponse response = new CapacityGapResponse();

        // 1. 在手订单（production + cutting 状态）
        QueryWrapper<ProductionOrder> oqw = new QueryWrapper<>();
        oqw.eq("tenant_id", tenantId)
           .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
           .eq("delete_flag", 0)
           .in("status", "production", "cutting")
           .isNotNull("factory_name")
           .ne("factory_name", "");
        List<ProductionOrder> orders = productionOrderMapper.selectList(oqw);

        if (orders.isEmpty()) {
            response.setTotalFactories(0);
            response.setGapFactoryCount(0);
            return response;
        }

        // 2. 按工厂分组
        Map<String, List<ProductionOrder>> byFactory = orders.stream()
                .collect(Collectors.groupingBy(o -> o.getFactoryName() == null ? "未知工厂" : o.getFactoryName()));

        // 3. 近30天扫码产出（按工厂）
        LocalDateTime since = LocalDateTime.now().minusDays(CAPACITY_WINDOW_DAYS);
        QueryWrapper<ScanRecord> sqw = new QueryWrapper<>();
        sqw.eq("tenant_id", tenantId)
           .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
           .eq("scan_result", "success")
           .ge("scan_time", since)
           .gt("quantity", 0);
        List<ScanRecord> recentScans = scanRecordMapper.selectList(sqw);

        // 按工厂名聚合扫码件数（需关联订单获取工厂名）
        Map<String, List<ProductionOrder>> orderById = orders.stream()
                .collect(Collectors.toMap(o -> String.valueOf(o.getId()), o -> List.of(o), (a, b) -> a));
        Map<String, Long> factoryScanTotal = new HashMap<>();
        for (ScanRecord sr : recentScans) {
            String oid = sr.getOrderId();
            if (oid == null) continue;
            List<ProductionOrder> matching = orderById.get(oid);
            if (matching == null || matching.isEmpty()) continue;
            String fn = matching.get(0).getFactoryName();
            if (fn == null || fn.isEmpty()) continue;
            factoryScanTotal.merge(fn, (long)(sr.getQuantity() == null ? 0 : sr.getQuantity()), Long::sum);
        }

        // 4. 构建每工厂分析结果
        List<FactoryCapacityGap> result = new ArrayList<>();
        for (Map.Entry<String, List<ProductionOrder>> entry : byFactory.entrySet()) {
            String factoryName = entry.getKey();
            List<ProductionOrder> factoryOrders = entry.getValue();

            int pendingQty = factoryOrders.stream()
                    .mapToInt(o -> o.getOrderQuantity() == null ? 0 : o.getOrderQuantity())
                    .sum();

            long totalScanQty = factoryScanTotal.getOrDefault(factoryName, 0L);
            double dailyCapacity = totalScanQty > 0
                    ? totalScanQty / (double) CAPACITY_WINDOW_DAYS
                    : DEFAULT_DAILY_CAPACITY;

            int estimatedDays = dailyCapacity > 0 ? (int) Math.ceil(pendingQty / dailyCapacity) : 9999;

            // 最近的计划交期
            Optional<LocalDateTime> nearestDue = factoryOrders.stream()
                    .filter(o -> o.getPlannedEndDate() != null)
                    .map(ProductionOrder::getPlannedEndDate)
                    .min(Comparator.naturalOrder());

            int daysToNearestDue = nearestDue
                    .map(d -> (int) ChronoUnit.DAYS.between(LocalDate.now(), d.toLocalDate()))
                    .orElse(30);
            String nearestDueStr = nearestDue.map(d -> d.format(DATE_FMT)).orElse(null);

            int gapDays = estimatedDays - daysToNearestDue;

            String gapLevel;
            String advice;
            if (daysToNearestDue < 0) {
                gapLevel = "critical";
                advice = String.format("工厂【%s】最近交期已逾期 %d 天，在手量 %d 件，建议立即协调加班或转单", factoryName, -daysToNearestDue, pendingQty);
            } else if (gapDays > 7) {
                gapLevel = "gap";
                advice = String.format("工厂【%s】预计缺口 %d 天，建议增加产能或提前调配订单", factoryName, gapDays);
            } else if (gapDays > 0) {
                gapLevel = "tight";
                advice = String.format("工厂【%s】产能紧张，缺口 %d 天，建议关注进度并适时干预", factoryName, gapDays);
            } else {
                gapLevel = "safe";
                advice = String.format("工厂【%s】产能充足，预计提前 %d 天完成", factoryName, -gapDays);
            }

            FactoryCapacityGap gap = new FactoryCapacityGap();
            gap.setFactoryName(factoryName);
            gap.setPendingQuantity(pendingQty);
            gap.setDailyCapacity(Math.round(dailyCapacity * 10.0) / 10.0);
            gap.setEstimatedDaysToComplete(estimatedDays);
            gap.setNearestDueDate(nearestDueStr);
            gap.setDaysToNearestDue(daysToNearestDue);
            gap.setGapDays(gapDays);
            gap.setGapLevel(gapLevel);
            gap.setAdvice(advice);
            result.add(gap);
        }

        // 按缺口严重程度排序
        result.sort((a, b) -> {
            int aw = gapLevelWeight(a.getGapLevel()), bw = gapLevelWeight(b.getGapLevel());
            if (aw != bw) return bw - aw;
            return b.getGapDays() - a.getGapDays();
        });

        long gapCount = result.stream()
                .filter(g -> "gap".equals(g.getGapLevel()) || "critical".equals(g.getGapLevel()) || "tight".equals(g.getGapLevel()))
                .count();

        response.setTotalFactories(result.size());
        response.setGapFactoryCount((int) gapCount);
        response.setFactories(result);
        log.info("[CapacityGap] tenant={} factories={} gapCount={}", tenantId, result.size(), gapCount);
        return response;
    }

    private int gapLevelWeight(String level) {
        return switch (level == null ? "" : level) {
            case "critical" -> 4;
            case "gap"      -> 3;
            case "tight"    -> 2;
            default         -> 1;
        };
    }
}
