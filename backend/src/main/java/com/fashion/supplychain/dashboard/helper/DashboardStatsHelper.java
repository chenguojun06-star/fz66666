package com.fashion.supplychain.dashboard.helper;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.dashboard.dto.DeliveryAlertOrderDto;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class DashboardStatsHelper {

    private final DashboardQueryService dashboardQueryService;
    private final ScanRecordService scanRecordService;

    public DashboardStatsHelper(DashboardQueryService dashboardQueryService,
                                ScanRecordService scanRecordService) {
        this.dashboardQueryService = dashboardQueryService;
        this.scanRecordService = scanRecordService;
    }

    public Map<String, Object> computeOverdueFactoryStats() {
        List<ProductionOrder> allOverdues = dashboardQueryService.listAllOverdueOrders();
        LocalDateTime now = LocalDateTime.now();

        Map<String, List<ProductionOrder>> byFactory = groupOrdersByFactory(allOverdues);
        List<Map<String, Object>> factoryGroups = new ArrayList<>();
        int totalQuantity = 0;
        int totalProgress = 0;
        int totalOverdueDays = 0;

        for (Map.Entry<String, List<ProductionOrder>> entry : byFactory.entrySet()) {
            FactoryAggregate agg = buildFactoryAggregate(entry.getKey(), entry.getValue(), now);
            factoryGroups.add(agg.groupMap);
            totalQuantity += agg.totalQty;
            totalProgress += agg.progressSum;
            totalOverdueDays += agg.overdueDaysSum;
        }

        int totalCount = allOverdues.size();
        int overallAvgProgress = totalCount > 0 ? totalProgress / totalCount : 0;
        int overallAvgOverdueDays = totalCount > 0 ? totalOverdueDays / totalCount : 0;

        factoryGroups.sort((a, b) -> (int) b.get("totalOrders") - (int) a.get("totalOrders"));

        Map<String, Object> result = new HashMap<>();
        result.put("overdueCount", totalCount);
        result.put("totalQuantity", totalQuantity);
        result.put("avgProgress", overallAvgProgress);
        result.put("avgOverdueDays", overallAvgOverdueDays);
        result.put("factoryGroupCount", byFactory.size());
        result.put("factoryGroups", factoryGroups);
        return result;
    }

    private Map<String, List<ProductionOrder>> groupOrdersByFactory(List<ProductionOrder> orders) {
        Map<String, List<ProductionOrder>> byFactory = new HashMap<>();
        for (ProductionOrder o : orders) {
            String fName = o.getFactoryName() != null ? o.getFactoryName() : "未指定";
            byFactory.computeIfAbsent(fName, k -> new ArrayList<>()).add(o);
        }
        return byFactory;
    }

    private FactoryAggregate buildFactoryAggregate(String factoryName, List<ProductionOrder> orders, LocalDateTime now) {
        int fOrderCount = orders.size();
        int fTotalQty = 0;
        int fProgressSum = 0;
        int fOverdueDaysSum = 0;
        List<Map<String, Object>> orderItems = new ArrayList<>();

        for (ProductionOrder o : orders) {
            int qty = o.getOrderQuantity() != null ? o.getOrderQuantity() : 0;
            int prog = o.getProductionProgress() != null ? o.getProductionProgress() : 0;
            int days = o.getPlannedEndDate() != null ? (int) ChronoUnit.DAYS.between(o.getPlannedEndDate(), now) : 0;
            fTotalQty += qty;
            fProgressSum += prog;
            fOverdueDaysSum += Math.max(0, days);

            Map<String, Object> item = new HashMap<>();
            item.put("orderNo", o.getOrderNo());
            item.put("styleNo", o.getStyleNo());
            item.put("progress", prog);
            item.put("overdueDays", Math.max(0, days));
            item.put("quantity", qty);
            item.put("plannedEndDate", o.getPlannedEndDate() != null ? o.getPlannedEndDate().toLocalDate().toString() : null);
            orderItems.add(item);
        }

        int fAvgProgress = fOrderCount > 0 ? fProgressSum / fOrderCount : 0;
        int fAvgOverdueDays = fOrderCount > 0 ? fOverdueDaysSum / fOrderCount : 0;
        int fEstDays = fAvgProgress > 0
                ? (int) Math.ceil((100.0 - fAvgProgress) / Math.max(fAvgProgress, 1) * (fAvgOverdueDays > 0 ? fAvgOverdueDays : 7))
                : -1;

        int fActiveWorkers = countActiveWorkers(orders, now);

        Map<String, Object> group = new HashMap<>();
        group.put("factoryName", factoryName);
        group.put("totalOrders", fOrderCount);
        group.put("totalQuantity", fTotalQty);
        group.put("avgProgress", fAvgProgress);
        group.put("avgOverdueDays", fAvgOverdueDays);
        group.put("activeWorkers", fActiveWorkers);
        group.put("estimatedCompletionDays", fEstDays);
        group.put("orders", orderItems);

        FactoryAggregate agg = new FactoryAggregate();
        agg.groupMap = group;
        agg.totalQty = fTotalQty;
        agg.progressSum = fProgressSum;
        agg.overdueDaysSum = fOverdueDaysSum;
        return agg;
    }

    private int countActiveWorkers(List<ProductionOrder> orders, LocalDateTime now) {
        try {
            Set<String> orderIds = orders.stream()
                    .map(ProductionOrder::getId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet());
            if (orderIds.isEmpty()) return 0;
            QueryWrapper<ScanRecord> aqw = new QueryWrapper<>();
            aqw.eq("tenant_id", com.fashion.supplychain.common.UserContext.tenantId())
               .in("order_id", orderIds)
               .eq("scan_result", "success")
               .ne("scan_type", "orchestration")
               .ge("scan_time", now.minusDays(30))
               .select("DISTINCT operator_id");
            return (int) scanRecordService.list(aqw).stream()
                    .map(ScanRecord::getOperatorId).filter(Objects::nonNull).distinct().count();
        } catch (Exception e) {
            log.warn("[Dashboard] 查询工厂活跃工人失败: error={}", e.getMessage());
            return 0;
        }
    }

    public void classifyDeliveryAlerts(List<ProductionOrder> allOrders, java.time.LocalDate today,
            List<DeliveryAlertOrderDto> urgentOrders, List<DeliveryAlertOrderDto> warningOrders) {
        for (ProductionOrder order : allOrders) {
            if (order.getPlannedEndDate() == null) continue;
            java.time.LocalDate deliveryDate = order.getPlannedEndDate().toLocalDate();
            long daysUntilDelivery = ChronoUnit.DAYS.between(today, deliveryDate);
            if (daysUntilDelivery < 1 || daysUntilDelivery > 7) continue;

            DeliveryAlertOrderDto dto = buildDeliveryAlertDto(order, daysUntilDelivery);
            if (daysUntilDelivery <= 4) urgentOrders.add(dto);
            else warningOrders.add(dto);
        }
    }

    private DeliveryAlertOrderDto buildDeliveryAlertDto(ProductionOrder order, long daysUntilDelivery) {
        DeliveryAlertOrderDto dto = new DeliveryAlertOrderDto();
        dto.setId(order.getId());
        dto.setOrderNo(order.getOrderNo());
        dto.setStyleNo(order.getStyleNo());
        dto.setStyleName(order.getStyleName());
        dto.setFactoryName(order.getFactoryName());
        dto.setOrderQuantity(order.getOrderQuantity());
        dto.setCompletedQuantity(order.getCompletedQuantity() == null ? 0 : order.getCompletedQuantity());
        dto.setProductionProgress(order.getProductionProgress() == null ? 0 : order.getProductionProgress());
        dto.setPlannedEndDate(order.getPlannedEndDate());
        dto.setDaysUntilDelivery((int) daysUntilDelivery);
        return dto;
    }

    private static class FactoryAggregate {
        Map<String, Object> groupMap;
        int totalQty;
        int progressSum;
        int overdueDaysSum;
    }
}
