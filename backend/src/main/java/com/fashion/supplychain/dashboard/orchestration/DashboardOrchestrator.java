package com.fashion.supplychain.dashboard.orchestration;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.dashboard.dto.DashboardActivityDto;
import com.fashion.supplychain.dashboard.dto.DashboardResponse;
import com.fashion.supplychain.dashboard.dto.DeliveryAlertOrderDto;
import com.fashion.supplychain.dashboard.dto.DeliveryAlertResponse;
import com.fashion.supplychain.dashboard.dto.OrderCuttingChartResponse;
import com.fashion.supplychain.dashboard.dto.OverdueOrderDto;
import com.fashion.supplychain.dashboard.dto.QualityStatsResponse;
import com.fashion.supplychain.dashboard.dto.ScanCountChartResponse;
import com.fashion.supplychain.dashboard.dto.TopStatsResponse;
import com.fashion.supplychain.production.dto.MaterialStockAlertDto;
import com.fashion.supplychain.dashboard.helper.DashboardCacheHelper;
import com.fashion.supplychain.dashboard.helper.DashboardStatsHelper;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.orchestration.MaterialStockOrchestrator;
import com.fashion.supplychain.style.entity.StyleInfo;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class DashboardOrchestrator {

    private final DashboardQueryService dashboardQueryService;
    private final ProductionOrderService productionOrderService;
    private final MaterialStockOrchestrator materialStockOrchestrator;
    private final DashboardStatsHelper statsHelper;
    private final DashboardCacheHelper cacheHelper;

    public DashboardOrchestrator(
            DashboardQueryService dashboardQueryService,
            ProductionOrderService productionOrderService,
            MaterialStockOrchestrator materialStockOrchestrator,
            DashboardStatsHelper statsHelper,
            DashboardCacheHelper cacheHelper) {
        this.dashboardQueryService = dashboardQueryService;
        this.productionOrderService = productionOrderService;
        this.materialStockOrchestrator = materialStockOrchestrator;
        this.statsHelper = statsHelper;
        this.cacheHelper = cacheHelper;
    }

    public DashboardResponse dashboard(String startDate, String endDate, String brand, String factory) {
        String ctxFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        if (org.springframework.util.StringUtils.hasText(ctxFactoryId)) {
            String factoryCacheKey = "factory_dashboard:" + ctxFactoryId;
            DashboardResponse cached = cacheHelper.getFromCache(factoryCacheKey);
            if (cached != null) return cached;
            DashboardResponse result = buildFactoryDashboard(ctxFactoryId);
            cacheHelper.putToCache(factoryCacheKey, result);
            return result;
        }

        String cacheKey = "main_dashboard";
        DashboardResponse cachedMain = cacheHelper.getFromCache(cacheKey);
        if (cachedMain != null) return cachedMain;

        LocalDate rangeStart = parseDateOrNull(startDate);
        LocalDate rangeEnd = parseDateOrNull(endDate);
        LocalDateTime rangeStartTime = rangeStart == null ? null : rangeStart.atStartOfDay();
        LocalDateTime rangeEndTime = rangeEnd == null ? null : rangeEnd.atTime(LocalTime.MAX);

        LocalDate today = LocalDate.now();
        LocalDateTime startOfDay = LocalDateTime.of(today, LocalTime.MIN);
        LocalDateTime endOfDay = LocalDateTime.of(today, LocalTime.MAX);

        long styleCount = dashboardQueryService.countEnabledStyles();
        long productionCount = dashboardQueryService.countProductionOrders();
        long paymentApprovalCount = dashboardQueryService.countApprovedMaterialReconciliations()
                + dashboardQueryService.countApprovedShipmentReconciliations();
        long warehousingOrderCount = dashboardQueryService.countWarehousingBetween(startOfDay, endOfDay);
        long unqualifiedQuantity = dashboardQueryService.sumUnqualifiedQuantityBetween(rangeStartTime, rangeEndTime);

        List<DashboardActivityDto> recentActivities = buildRecentActivities(today);

        DashboardResponse data = new DashboardResponse();
        data.setSampleDevelopmentCount(styleCount);
        data.setProductionOrderCount(productionCount);
        data.setOrderQuantityTotal(dashboardQueryService.sumTotalOrderQuantity());
        data.setOverdueOrderCount(dashboardQueryService.countOverdueOrders());
        LocalDateTime todayStart = LocalDateTime.of(today, LocalTime.MIN);
        LocalDateTime todayEnd = LocalDateTime.of(today, LocalTime.MAX);
        data.setTodayScanCount(dashboardQueryService.countScansBetween(todayStart, todayEnd));
        data.setTotalScanCount(dashboardQueryService.sumTotalScanQuantity());
        data.setTodayWarehousingCount(warehousingOrderCount);
        data.setTotalWarehousingCount(dashboardQueryService.countTotalWarehousing());
        data.setDefectiveQuantity(unqualifiedQuantity);
        data.setPaymentApprovalCount(paymentApprovalCount);
        data.setRecentActivities(recentActivities);
        cacheHelper.putToCache(cacheKey, data);
        return data;
    }

    private List<DashboardActivityDto> buildRecentActivities(LocalDate today) {
        DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("MM-dd HH:mm");
        List<Activity> activities = new ArrayList<>();

        for (StyleInfo s : dashboardQueryService.listRecentStyles(5)) {
            activities.add(Activity.of(s.getCreateTime(), s.getId() == null ? "style" : s.getId().toString(),
                    "style", "新增款号 " + s.getStyleNo(),
                    s.getCreateTime() == null ? "" : s.getCreateTime().format(timeFormatter)));
        }
        for (ProductionOrder o : dashboardQueryService.listRecentOrders(5)) {
            activities.add(Activity.of(o.getCreateTime(), o.getId(), "production",
                    "生产订单 " + o.getOrderNo() + " 已创建",
                    o.getCreateTime() == null ? "" : o.getCreateTime().format(timeFormatter)));
        }
        for (ScanRecord sr : dashboardQueryService.listRecentScans(5)) {
            activities.add(Activity.of(sr.getScanTime(), sr.getId(), "scan",
                    "车间扫码 " + (sr.getOrderNo() == null ? "" : sr.getOrderNo()),
                    sr.getScanTime() == null ? "" : sr.getScanTime().format(timeFormatter)));
        }
        for (MaterialPurchase mp : dashboardQueryService.listRecentPurchases(5)) {
            activities.add(Activity.of(mp.getCreateTime(), mp.getId(), "material",
                    "物料采购 " + mp.getPurchaseNo() + " 已创建",
                    mp.getCreateTime() == null ? "" : mp.getCreateTime().format(timeFormatter)));
        }

        activities.sort(Comparator.comparing(Activity::getSortTime, Comparator.nullsLast(Comparator.naturalOrder())).reversed());
        List<DashboardActivityDto> result = new ArrayList<>();
        for (int i = 0; i < Math.min(5, activities.size()); i++) {
            result.add(activities.get(i).toDto());
        }
        return result;
    }

    private LocalDate parseDateOrNull(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.isEmpty() || "undefined".equalsIgnoreCase(s) || "null".equalsIgnoreCase(s)) return null;
        try {
            return LocalDate.parse(s);
        } catch (Exception e) {
            log.warn("[Dashboard] 日期解析失败: {}", e.getMessage());
            return null;
        }
    }

    private DashboardResponse buildFactoryDashboard(String factoryId) {
        DashboardResponse data = new DashboardResponse();
        List<ProductionOrder> factoryOrders = productionOrderService.lambdaQuery()
            .select(ProductionOrder::getOrderQuantity, ProductionOrder::getStatus, ProductionOrder::getPlannedEndDate)
                .eq(ProductionOrder::getFactoryId, factoryId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .last("LIMIT 5000")
                .list();

        data.setProductionOrderCount(factoryOrders.size());
        data.setOrderQuantityTotal(factoryOrders.stream()
                .mapToLong(o -> o.getOrderQuantity() == null ? 0 : o.getOrderQuantity()).sum());

        LocalDateTime now = LocalDateTime.now();
        data.setOverdueOrderCount(factoryOrders.stream()
                .filter(o -> !"completed".equals(o.getStatus()) && !"cancelled".equals(o.getStatus())
                        && !"scrapped".equals(o.getStatus()) && !"closed".equals(o.getStatus())
                        && !"archived".equals(o.getStatus()))
                .filter(o -> o.getPlannedEndDate() != null && o.getPlannedEndDate().isBefore(now))
                .count());

        data.setSampleDevelopmentCount(0);
        data.setTodayScanCount(0);
        data.setTotalScanCount(0);
        data.setTodayWarehousingCount(0);
        data.setTotalWarehousingCount(0);
        data.setDefectiveQuantity(0);
        data.setPaymentApprovalCount(0);
        data.setRecentActivities(new ArrayList<>());
        return data;
    }

    private TopStatsResponse buildFactoryTopStats(String factoryId) {
        TopStatsResponse response = new TopStatsResponse();
        LocalDateTime endTime = LocalDateTime.now();
        LocalDate today = LocalDate.now();
        LocalDateTime dayStart = LocalDateTime.of(today, LocalTime.MIN);
        LocalDate monday = today.minusDays(today.getDayOfWeek().getValue() - 1);
        LocalDateTime weekStart = LocalDateTime.of(monday, LocalTime.MIN);
        LocalDateTime monthStart = LocalDateTime.of(today.withDayOfMonth(1), LocalTime.MIN);
        LocalDateTime yearStart = LocalDateTime.of(today.withDayOfYear(1), LocalTime.MIN);
        LocalDateTime totalStart = LocalDateTime.of(2000, 1, 1, 0, 0, 0);

        response.setSampleDevelopment(new TopStatsResponse.TimeRangeStats());

        List<ProductionOrder> factoryOrders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getFactoryId, factoryId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .select(ProductionOrder::getOrderQuantity, ProductionOrder::getCreateTime)
                .last("LIMIT 5000")
                .list();
        TopStatsResponse.TimeRangeStats bulkStats = new TopStatsResponse.TimeRangeStats();
        bulkStats.setDay((int) sumFactoryOrderQty(factoryOrders, dayStart, endTime));
        bulkStats.setWeek((int) sumFactoryOrderQty(factoryOrders, weekStart, endTime));
        bulkStats.setMonth((int) sumFactoryOrderQty(factoryOrders, monthStart, endTime));
        bulkStats.setYear((int) sumFactoryOrderQty(factoryOrders, yearStart, endTime));
        bulkStats.setTotal((int) sumFactoryOrderQty(factoryOrders, totalStart, endTime));
        response.setBulkOrder(bulkStats);

        response.setCutting(new TopStatsResponse.TimeRangeStats());
        response.setWarehousing(new TopStatsResponse.TimeRangeStats());
        response.setWarehousingInbound(new TopStatsResponse.TimeRangeStats());
        response.setWarehousingOutbound(new TopStatsResponse.TimeRangeStats());
        return response;
    }

    private long sumFactoryOrderQty(List<ProductionOrder> orders, LocalDateTime start, LocalDateTime end) {
        return orders.stream()
                .filter(o -> o.getCreateTime() != null && !o.getCreateTime().isBefore(start) && !o.getCreateTime().isAfter(end))
                .mapToLong(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0L)
                .sum();
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

        public LocalDateTime getSortTime() { return sortTime; }

        public DashboardActivityDto toDto() {
            DashboardActivityDto dto = new DashboardActivityDto();
            dto.setId(id);
            dto.setType(type);
            dto.setContent(content);
            dto.setTime(time);
            return dto;
        }
    }

    public List<Map<String, Object>> getUrgentEvents() {
        List<Map<String, Object>> events = new ArrayList<>();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

        for (ProductionOrder order : dashboardQueryService.listOverdueOrders(10)) {
            events.add(buildUrgentEvent(order.getId(), "overdue",
                    "订单延期：" + order.getOrderNo(), order.getOrderNo(),
                    order.getPlannedEndDate() == null ? "" : order.getPlannedEndDate().format(formatter)));
        }

        try {
            Map<String, Object> params = new HashMap<>();
            params.put("onlyNeed", "true");
            params.put("limit", 5);
            for (MaterialStockAlertDto alert : materialStockOrchestrator.listAlerts(params)) {
                events.add(buildUrgentEvent(alert.getStockId(), "material",
                        "库存预警：" + (alert.getMaterialName() == null ? "物料" : alert.getMaterialName()),
                        alert.getMaterialCode(),
                        alert.getLastOutTime() == null ? "" : alert.getLastOutTime().format(formatter)));
            }
        } catch (Exception e) {
            log.warn("[Dashboard] 库存预警查询失败: {}", e.getMessage());
        }

        return events;
    }

    private Map<String, Object> buildUrgentEvent(Object id, String type, String title, String orderNo, String time) {
        Map<String, Object> event = new HashMap<>();
        event.put("id", id == null ? "" : String.valueOf(id));
        event.put("type", type);
        event.put("title", title);
        event.put("orderNo", orderNo);
        event.put("time", time);
        return event;
    }

    public DeliveryAlertResponse getDeliveryAlert() {
        DeliveryAlertResponse response = new DeliveryAlertResponse();
        LocalDate today = LocalDate.now();

        TenantAssert.assertTenantContext();
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        String factoryId = com.fashion.supplychain.common.UserContext.factoryId();
        List<ProductionOrder> allOrders = productionOrderService.lambdaQuery()
            .select(ProductionOrder::getId, ProductionOrder::getOrderNo, ProductionOrder::getStyleNo,
                    ProductionOrder::getStyleName, ProductionOrder::getFactoryName,
                    ProductionOrder::getOrderQuantity, ProductionOrder::getCompletedQuantity,
                    ProductionOrder::getProductionProgress, ProductionOrder::getStatus,
                    ProductionOrder::getPlannedEndDate)
            .eq(ProductionOrder::getDeleteFlag, 0)
            .eq(ProductionOrder::getTenantId, tenantId)
            .eq(org.springframework.util.StringUtils.hasText(factoryId), ProductionOrder::getFactoryId, factoryId)
            .notIn(ProductionOrder::getStatus, "completed", "cancelled", "scrapped", "closed", "archived")
            .last("LIMIT 5000")
            .list();

        if (allOrders == null || allOrders.isEmpty()) {
            response.setUrgentOrders(new ArrayList<>());
            response.setWarningOrders(new ArrayList<>());
            return response;
        }

        List<DeliveryAlertOrderDto> urgentOrders = new ArrayList<>();
        List<DeliveryAlertOrderDto> warningOrders = new ArrayList<>();
        statsHelper.classifyDeliveryAlerts(allOrders, today, urgentOrders, warningOrders);

        urgentOrders.sort(Comparator.comparing(DeliveryAlertOrderDto::getDaysUntilDelivery));
        warningOrders.sort(Comparator.comparing(DeliveryAlertOrderDto::getDaysUntilDelivery));

        response.setUrgentOrders(urgentOrders);
        response.setWarningOrders(warningOrders);
        return response;
    }

    public QualityStatsResponse getQualityStats(String range) {
        QualityStatsResponse response = new QualityStatsResponse();
        LocalDateTime startTime = calculateStartTime(range);
        LocalDateTime endTime = LocalDateTime.now();

        long qualifiedCount = dashboardQueryService.sumQualifiedQuantityBetween(startTime, endTime);
        long defectiveCount = dashboardQueryService.sumUnqualifiedQuantityBetween(startTime, endTime);
        response.setDefectiveCount(defectiveCount);

        long totalQuantity = qualifiedCount + defectiveCount;
        response.setTotalWarehousing(totalQuantity);
        if (totalQuantity > 0) {
            response.setDefectRate(Math.round((defectiveCount * 100.0) / totalQuantity * 100.0) / 100.0);
            response.setQualifiedRate(Math.round((qualifiedCount * 100.0) / totalQuantity * 100.0) / 100.0);
        } else {
            response.setDefectRate(0.0);
            response.setQualifiedRate(0.0);
        }
        response.setRepairIssues(dashboardQueryService.countRepairIssuesBetween(startTime, endTime));
        return response;
    }

    private LocalDateTime calculateStartTime(String range) {
        LocalDate today = LocalDate.now();
        if ("day".equalsIgnoreCase(range)) return LocalDateTime.of(today, LocalTime.MIN);
        else if ("month".equalsIgnoreCase(range)) return LocalDateTime.of(today.withDayOfMonth(1), LocalTime.MIN);
        else {
            LocalDate monday = today.minusDays(today.getDayOfWeek().getValue() - 1);
            return LocalDateTime.of(monday, LocalTime.MIN);
        }
    }

    public TopStatsResponse getTopStats(String range) {
        String ctxFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        if (org.springframework.util.StringUtils.hasText(ctxFactoryId)) {
            // 工厂账号：按工厂 ID 分别缓存 5 分钟
            String factoryCacheKey = "topstats_factory_" + ctxFactoryId;
            TopStatsResponse factoryCached = cacheHelper.getFromCache(factoryCacheKey);
            if (factoryCached != null) return factoryCached;
            TopStatsResponse factoryResult = buildFactoryTopStats(ctxFactoryId);
            cacheHelper.putToCache(factoryCacheKey, factoryResult);
            return factoryResult;
        }

        // 管理员/租户账号：全量统计结果缓存 5 分钟（每个方法 ×5 范围 = 约 20 次 DB 查询降为 0）
        String cacheKey = "topstats";
        TopStatsResponse cached = cacheHelper.getFromCache(cacheKey);
        if (cached != null) return cached;

        TopStatsResponse response = new TopStatsResponse();
        LocalDateTime endTime = LocalDateTime.now();
        LocalDate today = LocalDate.now();
        LocalDateTime dayStart = LocalDateTime.of(today, LocalTime.MIN);
        LocalDate monday = today.minusDays(today.getDayOfWeek().getValue() - 1);
        LocalDateTime weekStart = LocalDateTime.of(monday, LocalTime.MIN);
        LocalDateTime monthStart = LocalDateTime.of(today.withDayOfMonth(1), LocalTime.MIN);
        LocalDateTime yearStart = LocalDateTime.of(today.withDayOfYear(1), LocalTime.MIN);
        LocalDateTime totalStart = LocalDateTime.of(2000, 1, 1, 0, 0, 0);

        response.setSampleDevelopment(buildTimeRangeStats(
                (s, e) -> dashboardQueryService.countSampleStylesBetween(s, e), dayStart, weekStart, monthStart, yearStart, totalStart, endTime));
        response.setBulkOrder(buildTimeRangeStats(
                (s, e) -> dashboardQueryService.sumOrderQuantityBetween(s, e), dayStart, weekStart, monthStart, yearStart, totalStart, endTime));
        response.setCutting(buildTimeRangeStats(
                (s, e) -> dashboardQueryService.sumCuttingQuantityBetween(s, e), dayStart, weekStart, monthStart, yearStart, totalStart, endTime));
        response.setWarehousingInbound(buildTimeRangeStats(
                (s, e) -> dashboardQueryService.sumWarehousingQuantityBetween(s, e), dayStart, weekStart, monthStart, yearStart, totalStart, endTime));
        response.setWarehousingOutbound(buildTimeRangeStats(
                (s, e) -> dashboardQueryService.sumOutstockQuantityBetween(s, e), dayStart, weekStart, monthStart, yearStart, totalStart, endTime));

        TopStatsResponse.TimeRangeStats ws = new TopStatsResponse.TimeRangeStats();
        ws.setDay(response.getWarehousingInbound().getDay() + response.getWarehousingOutbound().getDay());
        ws.setWeek(response.getWarehousingInbound().getWeek() + response.getWarehousingOutbound().getWeek());
        ws.setMonth(response.getWarehousingInbound().getMonth() + response.getWarehousingOutbound().getMonth());
        ws.setYear(response.getWarehousingInbound().getYear() + response.getWarehousingOutbound().getYear());
        ws.setTotal(response.getWarehousingInbound().getTotal() + response.getWarehousingOutbound().getTotal());
        response.setWarehousing(ws);

        cacheHelper.putToCache(cacheKey, response);
        return response;
    }

    @FunctionalInterface
    private interface TimeRangeQuery {
        long query(LocalDateTime start, LocalDateTime end);
    }

    private TopStatsResponse.TimeRangeStats buildTimeRangeStats(TimeRangeQuery query,
            LocalDateTime dayStart, LocalDateTime weekStart, LocalDateTime monthStart,
            LocalDateTime yearStart, LocalDateTime totalStart, LocalDateTime endTime) {
        TopStatsResponse.TimeRangeStats stats = new TopStatsResponse.TimeRangeStats();
        stats.setDay((int) query.query(dayStart, endTime));
        stats.setWeek((int) query.query(weekStart, endTime));
        stats.setMonth((int) query.query(monthStart, endTime));
        stats.setYear((int) query.query(yearStart, endTime));
        stats.setTotal((int) query.query(totalStart, endTime));
        return stats;
    }

    public OrderCuttingChartResponse getOrderCuttingChart() {
        LocalDate today = LocalDate.now();
        LocalDateTime startTime = LocalDateTime.of(today.minusDays(29), LocalTime.MIN);
        LocalDateTime endTime = LocalDateTime.of(today, LocalTime.MAX);

        List<Integer> orderQuantities = dashboardQueryService.getDailyOrderQuantities(startTime, endTime);
        List<Integer> cuttingQuantities = dashboardQueryService.getDailyCuttingQuantities(startTime, endTime);

        List<String> dates = new ArrayList<>();
        DateTimeFormatter dateFormatter = DateTimeFormatter.ofPattern("MM-dd");
        for (int i = 0; i < 30; i++) {
            dates.add(startTime.plusDays(i).format(dateFormatter));
        }
        return new OrderCuttingChartResponse(dates, orderQuantities, cuttingQuantities);
    }

    public ScanCountChartResponse getScanCountChart() {
        LocalDate today = LocalDate.now();
        LocalDateTime startTime = LocalDateTime.of(today.minusDays(29), LocalTime.MIN);
        LocalDateTime endTime = LocalDateTime.of(today, LocalTime.MAX);

        List<Integer> scanCounts = dashboardQueryService.getDailyScanCounts(startTime, endTime);
        List<Integer> scanQuantities = dashboardQueryService.getDailyScanQuantities(startTime, endTime);

        List<String> dates = new ArrayList<>();
        DateTimeFormatter dateFormatter = DateTimeFormatter.ofPattern("MM-dd");
        for (int i = 0; i < 30; i++) {
            dates.add(startTime.plusDays(i).format(dateFormatter));
        }
        return new ScanCountChartResponse(dates, scanCounts, scanQuantities);
    }

    public List<OverdueOrderDto> getOverdueOrders() {
        List<ProductionOrder> orders = dashboardQueryService.listAllOverdueOrders();
        List<OverdueOrderDto> result = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();

        for (ProductionOrder order : orders) {
            OverdueOrderDto dto = new OverdueOrderDto();
            dto.setId(order.getId());
            dto.setOrderNo(order.getOrderNo());
            dto.setStyleNo(order.getStyleNo());
            dto.setQuantity(order.getOrderQuantity());
            if (order.getPlannedEndDate() != null) {
                dto.setDeliveryDate(order.getPlannedEndDate().toLocalDate().toString());
                dto.setOverdueDays((int) Math.max(0, ChronoUnit.DAYS.between(order.getPlannedEndDate(), now)));
            } else {
                dto.setDeliveryDate("");
                dto.setOverdueDays(0);
            }
            dto.setFactoryName(order.getFactoryName());
            result.add(dto);
        }
        return result;
    }

    public Map<String, Object> getOverdueFactoryStats() {
        return statsHelper.computeOverdueFactoryStats();
    }
}
