package com.fashion.supplychain.dashboard.orchestration;

import com.fashion.supplychain.dashboard.dto.DashboardActivityDto;
import com.fashion.supplychain.dashboard.dto.DashboardResponse;
import com.fashion.supplychain.dashboard.dto.DeliveryAlertOrderDto;
import com.fashion.supplychain.dashboard.dto.DeliveryAlertResponse;
import com.fashion.supplychain.dashboard.dto.OrderCuttingChartResponse;
import com.fashion.supplychain.dashboard.dto.OverdueOrderDto;
import com.fashion.supplychain.dashboard.dto.QualityStatsResponse;
import com.fashion.supplychain.dashboard.dto.ScanCountChartResponse;
import com.fashion.supplychain.dashboard.dto.TopStatsResponse;
import com.fashion.supplychain.dashboard.dto.UrgentEventDto;
import com.fashion.supplychain.production.dto.MaterialStockAlertDto;
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

    public DashboardOrchestrator(
            DashboardQueryService dashboardQueryService,
            ProductionOrderService productionOrderService,
            MaterialStockOrchestrator materialStockOrchestrator) {
        this.dashboardQueryService = dashboardQueryService;
        this.productionOrderService = productionOrderService;
        this.materialStockOrchestrator = materialStockOrchestrator;
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
        DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("MM-dd HH:mm");

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
        data.setTodayScanCount(dashboardQueryService.sumTodayScanQuantity());  // 当天生产件数
        data.setTotalScanCount(dashboardQueryService.sumTotalScanQuantity());  // 生产总件数
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

        try {
            Map<String, Object> params = new java.util.HashMap<>();
            params.put("onlyNeed", "true");
            params.put("limit", 5);
            List<MaterialStockAlertDto> alerts = materialStockOrchestrator.listAlerts(params);
            for (MaterialStockAlertDto alert : alerts) {
                UrgentEventDto event = new UrgentEventDto();
                event.setId(alert.getStockId());
                event.setType("material");
                event.setTitle("库存预警：" + (alert.getMaterialName() == null ? "物料" : alert.getMaterialName()));
                event.setOrderNo(alert.getMaterialCode());
                event.setTime(alert.getLastOutTime() == null ? "" : alert.getLastOutTime().format(formatter));
                events.add(event);
            }
        } catch (Exception e) {
            // ignore alert failures
        }

        // 注意：当前未实现紧急事件追踪
        // 未来可添加：次品数超标、付款审批超时等紧急事件
        // 这里可以根据实际业务需求添加更多事件类型

        return events;
    }

    /**
     * 获取交期预警数据
     * - 紧急订单：距离交期1-4天，且未完成
     * - 预警订单：距离交期5-7天，且未完成
     *
     * @return 交期预警响应数据
     */
    public DeliveryAlertResponse getDeliveryAlert() {
        DeliveryAlertResponse response = new DeliveryAlertResponse();
        LocalDate today = LocalDate.now();

        // 获取所有生产订单（优化：未来可添加数据库查询条件）
        List<ProductionOrder> allOrders = productionOrderService.list();

        // 如果没有订单，直接返回空结果
        if (allOrders == null || allOrders.isEmpty()) {
            response.setUrgentOrders(new ArrayList<>());
            response.setWarningOrders(new ArrayList<>());
            return response;
        }

        List<DeliveryAlertOrderDto> urgentOrders = new ArrayList<>();
        List<DeliveryAlertOrderDto> warningOrders = new ArrayList<>();

        for (ProductionOrder order : allOrders) {
            // 跳过已完成或已取消的订单
            if ("completed".equals(order.getStatus()) || "cancelled".equals(order.getStatus())) {
                continue;
            }

            // 跳过没有交期的订单
            if (order.getPlannedEndDate() == null) {
                continue;
            }

            // 计算距离交期的天数
            LocalDate deliveryDate = order.getPlannedEndDate().toLocalDate();
            long daysUntilDelivery = ChronoUnit.DAYS.between(today, deliveryDate);

            // 只处理未来7天内的订单
            if (daysUntilDelivery < 1 || daysUntilDelivery > 7) {
                continue;
            }

            // 构建DTO
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

            // 分类：1-4天为紧急，5-7天为预警
            if (daysUntilDelivery >= 1 && daysUntilDelivery <= 4) {
                urgentOrders.add(dto);
            } else if (daysUntilDelivery >= 5 && daysUntilDelivery <= 7) {
                warningOrders.add(dto);
            }
        }

        // 按照距离交期天数排序（越近的越靠前）
        urgentOrders.sort(Comparator.comparing(DeliveryAlertOrderDto::getDaysUntilDelivery));
        warningOrders.sort(Comparator.comparing(DeliveryAlertOrderDto::getDaysUntilDelivery));

        response.setUrgentOrders(urgentOrders);
        response.setWarningOrders(warningOrders);

        return response;
    }

    /**
     * 获取质检统计数据
     * @param range 时间范围：day、week、month
     */
    public QualityStatsResponse getQualityStats(String range) {
        QualityStatsResponse response = new QualityStatsResponse();

        // 计算时间范围
        LocalDateTime startTime = calculateStartTime(range);
        LocalDateTime endTime = LocalDateTime.now();

        // 获取入库总数（指定时间范围内）
        long totalWarehousing = dashboardQueryService.countWarehousingBetween(startTime, endTime);
        response.setTotalWarehousing(totalWarehousing);

        // 获取合格品和次品数量（指定时间范围内）
        long qualifiedCount = dashboardQueryService.sumQualifiedQuantityBetween(startTime, endTime);
        long defectiveCount = dashboardQueryService.sumUnqualifiedQuantityBetween(startTime, endTime);
        response.setDefectiveCount(defectiveCount);

        // 计算次品率和合格率
        long totalQuantity = qualifiedCount + defectiveCount;
        if (totalQuantity > 0) {
            double defectRate = (defectiveCount * 100.0) / totalQuantity;
            double qualifiedRate = (qualifiedCount * 100.0) / totalQuantity;
            response.setDefectRate(Math.round(defectRate * 100.0) / 100.0); // 保留两位小数
            response.setQualifiedRate(Math.round(qualifiedRate * 100.0) / 100.0);
        } else {
            response.setDefectRate(0.0);
            response.setQualifiedRate(0.0);
        }

        // 获取返修问题数量（指定时间范围内）
        long repairIssues = dashboardQueryService.countRepairIssuesBetween(startTime, endTime);
        response.setRepairIssues(repairIssues);

        return response;
    }

    /**
     * 根据时间范围计算起始时间
     */
    private LocalDateTime calculateStartTime(String range) {
        LocalDate today = LocalDate.now();

        if ("day".equalsIgnoreCase(range)) {
            // 今日：从今天凌晨开始
            return LocalDateTime.of(today, LocalTime.MIN);
        } else if ("month".equalsIgnoreCase(range)) {
            // 本月：从本月1号开始
            return LocalDateTime.of(today.withDayOfMonth(1), LocalTime.MIN);
        } else {
            // 默认本周：从本周一开始
            LocalDate monday = today.minusDays(today.getDayOfWeek().getValue() - 1);
            return LocalDateTime.of(monday, LocalTime.MIN);
        }
    }

    /**
     * 获取顶部4个核心统计看板数据 - 返回日周月年4个时间维度
     */
    public TopStatsResponse getTopStats(String range) {
        TopStatsResponse response = new TopStatsResponse();
        LocalDateTime endTime = LocalDateTime.now();

        // 计算4个时间维度的起始时间
        LocalDate today = LocalDate.now();
        LocalDateTime dayStart = LocalDateTime.of(today, LocalTime.MIN);
        LocalDate monday = today.minusDays(today.getDayOfWeek().getValue() - 1);
        LocalDateTime weekStart = LocalDateTime.of(monday, LocalTime.MIN);
        LocalDateTime monthStart = LocalDateTime.of(today.withDayOfMonth(1), LocalTime.MIN);
        LocalDateTime yearStart = LocalDateTime.of(today.withDayOfYear(1), LocalTime.MIN);
        // 汇总：全部数据（使用一个足够早的起始时间）
        LocalDateTime totalStart = LocalDateTime.of(2000, 1, 1, 0, 0, 0);

        // 1. 样衣开发数量
        TopStatsResponse.TimeRangeStats sampleStats = new TopStatsResponse.TimeRangeStats();
        sampleStats.setDay((int) dashboardQueryService.countSampleStylesBetween(dayStart, endTime));
        sampleStats.setWeek((int) dashboardQueryService.countSampleStylesBetween(weekStart, endTime));
        sampleStats.setMonth((int) dashboardQueryService.countSampleStylesBetween(monthStart, endTime));
        sampleStats.setYear((int) dashboardQueryService.countSampleStylesBetween(yearStart, endTime));
        sampleStats.setTotal((int) dashboardQueryService.countSampleStylesBetween(totalStart, endTime));
        response.setSampleDevelopment(sampleStats);

        // 2. 大货下单数量（改为统计订单数量总和，与图表一致）
        TopStatsResponse.TimeRangeStats bulkOrderStats = new TopStatsResponse.TimeRangeStats();
        bulkOrderStats.setDay((int) dashboardQueryService.sumOrderQuantityBetween(dayStart, endTime));
        bulkOrderStats.setWeek((int) dashboardQueryService.sumOrderQuantityBetween(weekStart, endTime));
        bulkOrderStats.setMonth((int) dashboardQueryService.sumOrderQuantityBetween(monthStart, endTime));
        bulkOrderStats.setYear((int) dashboardQueryService.sumOrderQuantityBetween(yearStart, endTime));
        bulkOrderStats.setTotal((int) dashboardQueryService.sumOrderQuantityBetween(totalStart, endTime));
        response.setBulkOrder(bulkOrderStats);

        // 3. 裁剪数量
        TopStatsResponse.TimeRangeStats cuttingStats = new TopStatsResponse.TimeRangeStats();
        cuttingStats.setDay((int) dashboardQueryService.sumCuttingQuantityBetween(dayStart, endTime));
        cuttingStats.setWeek((int) dashboardQueryService.sumCuttingQuantityBetween(weekStart, endTime));
        cuttingStats.setMonth((int) dashboardQueryService.sumCuttingQuantityBetween(monthStart, endTime));
        cuttingStats.setYear((int) dashboardQueryService.sumCuttingQuantityBetween(yearStart, endTime));
        cuttingStats.setTotal((int) dashboardQueryService.sumCuttingQuantityBetween(totalStart, endTime));
        response.setCutting(cuttingStats);

        // 4. 出入库数量
        TopStatsResponse.TimeRangeStats warehousingStats = new TopStatsResponse.TimeRangeStats();
        warehousingStats.setDay((int) dashboardQueryService.sumWarehousingQuantityBetween(dayStart, endTime));
        warehousingStats.setWeek((int) dashboardQueryService.sumWarehousingQuantityBetween(weekStart, endTime));
        warehousingStats.setMonth((int) dashboardQueryService.sumWarehousingQuantityBetween(monthStart, endTime));
        warehousingStats.setYear((int) dashboardQueryService.sumWarehousingQuantityBetween(yearStart, endTime));
        warehousingStats.setTotal((int) dashboardQueryService.sumWarehousingQuantityBetween(totalStart, endTime));
        response.setWarehousing(warehousingStats);

        return response;
    }

    /**
     * 获取订单与裁剪数量折线图数据（最近30天）
     */
    public OrderCuttingChartResponse getOrderCuttingChart() {
        // 统计最近30天：从29天前0点到今天23:59:59
        LocalDate today = LocalDate.now();
        LocalDateTime startTime = LocalDateTime.of(today.minusDays(29), LocalTime.MIN);
        LocalDateTime endTime = LocalDateTime.of(today, LocalTime.MAX);

        List<Integer> orderQuantities = dashboardQueryService.getDailyOrderQuantities(startTime, endTime);
        List<Integer> cuttingQuantities = dashboardQueryService.getDailyCuttingQuantities(startTime, endTime);

        log.info("Order quantities size: {}, first 5: {}", orderQuantities.size(),
            orderQuantities.size() > 0 ? orderQuantities.subList(0, Math.min(5, orderQuantities.size())) : "empty");
        log.info("Cutting quantities size: {}, first 5: {}", cuttingQuantities.size(),
            cuttingQuantities.size() > 0 ? cuttingQuantities.subList(0, Math.min(5, cuttingQuantities.size())) : "empty");

        // 生成日期列表
        List<String> dates = new ArrayList<>();
        DateTimeFormatter dateFormatter = DateTimeFormatter.ofPattern("MM-dd");
        for (int i = 0; i < 30; i++) {
            dates.add(startTime.plusDays(i).format(dateFormatter));
        }

        return new OrderCuttingChartResponse(dates, orderQuantities, cuttingQuantities);
    }

    /**
     * 获取扫菲次数折线图数据（最近30天）
     */
    public ScanCountChartResponse getScanCountChart() {
        // 统计最近30天：从29天前0点到今天23:59:59
        LocalDate today = LocalDate.now();
        LocalDateTime startTime = LocalDateTime.of(today.minusDays(29), LocalTime.MIN);
        LocalDateTime endTime = LocalDateTime.of(today, LocalTime.MAX);

        List<Integer> scanCounts = dashboardQueryService.getDailyScanCounts(startTime, endTime);
        List<Integer> scanQuantities = dashboardQueryService.getDailyScanQuantities(startTime, endTime);

        // 生成日期列表
        List<String> dates = new ArrayList<>();
        DateTimeFormatter dateFormatter = DateTimeFormatter.ofPattern("MM-dd");
        for (int i = 0; i < 30; i++) {
            dates.add(startTime.plusDays(i).format(dateFormatter));
        }

        return new ScanCountChartResponse(dates, scanCounts, scanQuantities);
    }

    /**
     * 获取延期订单列表
     */
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
                long days = ChronoUnit.DAYS.between(order.getPlannedEndDate(), now);
                dto.setOverdueDays((int) Math.max(0, days));
            } else {
                dto.setDeliveryDate("");
                dto.setOverdueDays(0);
            }

            // 设置工厂名称
            dto.setFactoryName(order.getFactoryName());

            result.add(dto);
        }

        return result;
    }
}
