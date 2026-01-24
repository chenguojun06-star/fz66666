package com.fashion.supplychain.dashboard.orchestration;

import com.fashion.supplychain.dashboard.dto.DashboardActivityDto;
import com.fashion.supplychain.dashboard.dto.DashboardResponse;
import com.fashion.supplychain.dashboard.dto.UrgentEventDto;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.style.entity.StyleInfo;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class DashboardOrchestrator {

    private final DashboardQueryService dashboardQueryService;

    public DashboardOrchestrator(DashboardQueryService dashboardQueryService) {
        this.dashboardQueryService = dashboardQueryService;
    }

    public DashboardResponse dashboard(String startDate, String endDate, String brand, String factory) {
        LocalDate rangeStart = parseDateOrNull(startDate);
        LocalDate rangeEnd = parseDateOrNull(endDate);
        LocalDateTime rangeStartTime = rangeStart == null ? null : rangeStart.atStartOfDay();
        LocalDateTime rangeEndTime = rangeEnd == null ? null : rangeEnd.atTime(LocalTime.MAX);

        long styleCount = dashboardQueryService.countEnabledStyles();
        long productionCount = dashboardQueryService.countProductionOrders();

        long paymentApprovalCount = dashboardQueryService.countApprovedMaterialReconciliations()
                + dashboardQueryService.countApprovedShipmentReconciliations();

        LocalDate today = LocalDate.now();
        LocalDateTime startOfDay = LocalDateTime.of(today, LocalTime.MIN);
        LocalDateTime endOfDay = LocalDateTime.of(today, LocalTime.MAX);

        long warehousingOrderCount = dashboardQueryService.countWarehousingBetween(startOfDay, endOfDay);
        long unqualifiedQuantity = dashboardQueryService.sumUnqualifiedQuantityBetween(rangeStartTime, rangeEndTime);

        List<Activity> activities = new ArrayList<>();
        DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("HH:mm");

        List<StyleInfo> recentStyles = dashboardQueryService.listRecentStyles(5);
        for (StyleInfo s : recentStyles) {
            activities.add(Activity.of(
                    s.getCreateTime(),
                    s.getId() == null ? "style" : s.getId().toString(),
                    "style",
                    "新增款号 " + s.getStyleNo(),
                    s.getCreateTime() == null ? "" : s.getCreateTime().format(timeFormatter)));
        }

        List<ProductionOrder> recentOrders = dashboardQueryService.listRecentOrders(5);
        for (ProductionOrder o : recentOrders) {
            activities.add(Activity.of(
                    o.getCreateTime(),
                    o.getId(),
                    "production",
                    "生产订单 " + o.getOrderNo() + " 已创建",
                    o.getCreateTime() == null ? "" : o.getCreateTime().format(timeFormatter)));
        }

        List<ScanRecord> recentScans = dashboardQueryService.listRecentScans(5);
        for (ScanRecord sr : recentScans) {
            activities.add(Activity.of(
                    sr.getScanTime(),
                    sr.getId(),
                    "scan",
                    "车间扫码 " + (sr.getOrderNo() == null ? "" : sr.getOrderNo()),
                    sr.getScanTime() == null ? "" : sr.getScanTime().format(timeFormatter)));
        }

        List<MaterialPurchase> recentPurchases = dashboardQueryService.listRecentPurchases(5);
        for (MaterialPurchase mp : recentPurchases) {
            activities.add(Activity.of(
                    mp.getCreateTime(),
                    mp.getId(),
                    "material",
                    "物料采购 " + mp.getPurchaseNo() + " 已创建",
                    mp.getCreateTime() == null ? "" : mp.getCreateTime().format(timeFormatter)));
        }

        activities.sort(Comparator.comparing(Activity::getSortTime, Comparator.nullsLast(Comparator.naturalOrder()))
                .reversed());
        List<DashboardActivityDto> recentActivities = new ArrayList<>();
        for (int i = 0; i < Math.min(5, activities.size()); i++) {
            recentActivities.add(activities.get(i).toDto());
        }

        DashboardResponse data = new DashboardResponse();
        // 新字段映射
        data.setSampleDevelopmentCount(styleCount);  // 样衣开发 = 款号总数
        data.setProductionOrderCount(productionCount);  // 生产订单
        data.setOrderQuantityTotal(dashboardQueryService.sumTotalOrderQuantity());  // 订单数量总和
        data.setOverdueOrderCount(dashboardQueryService.countOverdueOrders());  // 延期订单
        data.setTodayWarehousingCount(warehousingOrderCount);  // 当天入库
        data.setTotalWarehousingCount(dashboardQueryService.countTotalWarehousing());  // 入库总数
        data.setDefectiveQuantity(unqualifiedQuantity);  // 次品数量
        data.setPaymentApprovalCount(paymentApprovalCount);  // 审批付款
        data.setRecentActivities(recentActivities);
        return data;
    }

    private LocalDate parseDateOrNull(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.trim();
        if (s.isEmpty() || "undefined".equalsIgnoreCase(s) || "null".equalsIgnoreCase(s)) {
            return null;
        }
        try {
            return LocalDate.parse(s);
        } catch (Exception e) {
            return null;
        }
    }

    private static class Activity {
        private final LocalDateTime sortTime;
        private final String id;
        private final String type;
        private final String content;
        private final String time;

        private Activity(LocalDateTime sortTime, String id, String type, String content, String time) {
            this.sortTime = sortTime;
            this.id = id;
            this.type = type;
            this.content = content;
            this.time = time;
        }

        public static Activity of(LocalDateTime sortTime, String id, String type, String content, String time) {
            return new Activity(sortTime, id == null ? "" : id, type, content, time);
        }

        public LocalDateTime getSortTime() {
            return sortTime;
        }

        public DashboardActivityDto toDto() {
            DashboardActivityDto dto = new DashboardActivityDto();
            dto.setId(id);
            dto.setType(type);
            dto.setContent(content);
            dto.setTime(time);
            return dto;
        }
    }

    /**
     * 获取紧急事件列表
     */
    public List<UrgentEventDto> getUrgentEvents() {
        List<UrgentEventDto> events = new ArrayList<>();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
        
        // 获取延期订单
        List<ProductionOrder> overdueOrders = dashboardQueryService.listOverdueOrders(10);
        for (ProductionOrder order : overdueOrders) {
            UrgentEventDto event = new UrgentEventDto();
            event.setId(order.getId());
            event.setType("overdue");
            event.setTitle("订单延期：" + order.getOrderNo());
            event.setOrderNo(order.getOrderNo());
            event.setTime(order.getPlannedEndDate() == null ? "" : order.getPlannedEndDate().format(formatter));
            events.add(event);
        }
        
        // 注意：当前未实现紧急事件追踪
        // 未来可添加：次品数超标、付款审批超时等紧急事件
        // 这里可以根据实际业务需求添加更多事件类型
        
        return events;
    }
}
