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
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
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
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class DashboardOrchestrator {

    private final DashboardQueryService dashboardQueryService;
    private final ProductionOrderService productionOrderService;
    private final MaterialStockOrchestrator materialStockOrchestrator;
    private final ScanRecordService scanRecordService;

    public DashboardOrchestrator(
            DashboardQueryService dashboardQueryService,
            ProductionOrderService productionOrderService,
            MaterialStockOrchestrator materialStockOrchestrator,
            ScanRecordService scanRecordService) {
        this.dashboardQueryService = dashboardQueryService;
        this.productionOrderService = productionOrderService;
        this.materialStockOrchestrator = materialStockOrchestrator;
        this.scanRecordService = scanRecordService;
    }

    public DashboardResponse dashboard(String startDate, String endDate, String brand, String factory) {
        // 工厂账号隔离：只看本工厂的订单统计，隐藏供应商/客户/财务数据
        String ctxFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        if (org.springframework.util.StringUtils.hasText(ctxFactoryId)) {
            return buildFactoryDashboard(ctxFactoryId);
        }

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
        // 今日实际扫码次数（排除orchestration系统编排记录，只统计工人真实扫码动作）
        LocalDateTime todayStart = LocalDateTime.of(today, LocalTime.MIN);
        LocalDateTime todayEnd   = LocalDateTime.of(today, LocalTime.MAX);
        data.setTodayScanCount(dashboardQueryService.countScansBetween(todayStart, todayEnd));
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
            log.warn("[Dashboard] 日期解析失败: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 工厂账号专属仪表板：只统计本工厂关联的生产订单，隐藏财务/供应商/仓库等敏感数据
     */
    private DashboardResponse buildFactoryDashboard(String factoryId) {
        DashboardResponse data = new DashboardResponse();
        // 查询本工厂的生产订单
        List<ProductionOrder> factoryOrders = productionOrderService.lambdaQuery()
            .select(
                ProductionOrder::getOrderQuantity,
                ProductionOrder::getStatus,
                ProductionOrder::getPlannedEndDate
            )
                .eq(ProductionOrder::getFactoryId, factoryId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .last("LIMIT 5000")
                .list();

        data.setProductionOrderCount(factoryOrders.size());
        long totalQty = factoryOrders.stream()
                .mapToLong(o -> o.getOrderQuantity() == null ? 0 : o.getOrderQuantity())
                .sum();
        data.setOrderQuantityTotal(totalQty);

        LocalDateTime now = LocalDateTime.now();
        long overdueCount = factoryOrders.stream()
                .filter(o -> !"completed".equals(o.getStatus()) && !"cancelled".equals(o.getStatus())
                        && !"scrapped".equals(o.getStatus()) && !"closed".equals(o.getStatus())
                        && !"archived".equals(o.getStatus()))
                .filter(o -> o.getPlannedEndDate() != null && o.getPlannedEndDate().isBefore(now))
                .count();
        data.setOverdueOrderCount(overdueCount);

        // 工厂不可见的指标置零
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

    /**
     * 工厂账号 TopStats：仅统计本工厂生产订单，样衣/裁剪/出入库置零
     */
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

        // 工厂不可见样衣开发统计
        response.setSampleDevelopment(new TopStatsResponse.TimeRangeStats());

        // 大货下单：仅统计本工厂订单
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

        // 裁剪/出入库无factory_id字段，不安全过滤，置零
        response.setCutting(new TopStatsResponse.TimeRangeStats());
        response.setWarehousing(new TopStatsResponse.TimeRangeStats());
        response.setWarehousingInbound(new TopStatsResponse.TimeRangeStats());
        response.setWarehousingOutbound(new TopStatsResponse.TimeRangeStats());
        return response;
    }

    private long sumFactoryOrderQty(List<ProductionOrder> orders, LocalDateTime start, LocalDateTime end) {
        return orders.stream()
                .filter(o -> o.getCreateTime() != null
                        && !o.getCreateTime().isBefore(start)
                        && !o.getCreateTime().isAfter(end))
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
    public List<Map<String, Object>> getUrgentEvents() {
        List<Map<String, Object>> events = new ArrayList<>();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

        // 获取延期订单
        List<ProductionOrder> overdueOrders = dashboardQueryService.listOverdueOrders(10);
        for (ProductionOrder order : overdueOrders) {
            events.add(buildUrgentEvent(
                    order.getId(),
                    "overdue",
                    "订单延期：" + order.getOrderNo(),
                    order.getOrderNo(),
                    order.getPlannedEndDate() == null ? "" : order.getPlannedEndDate().format(formatter)));
        }

        try {
            Map<String, Object> params = new java.util.HashMap<>();
            params.put("onlyNeed", "true");
            params.put("limit", 5);
            List<MaterialStockAlertDto> alerts = materialStockOrchestrator.listAlerts(params);
            for (MaterialStockAlertDto alert : alerts) {
                events.add(buildUrgentEvent(
                        alert.getStockId(),
                        "material",
                        "库存预警：" + (alert.getMaterialName() == null ? "物料" : alert.getMaterialName()),
                        alert.getMaterialCode(),
                        alert.getLastOutTime() == null ? "" : alert.getLastOutTime().format(formatter)));
            }
        } catch (Exception e) {
            log.warn("[Dashboard] 库存预警查询失败: {}", e.getMessage());
        }

        // 注意：当前未实现紧急事件追踪
        // 未来可添加：次品数超标、付款审批超时等紧急事件
        // 这里可以根据实际业务需求添加更多事件类型

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

        // 仅查询有效的、非终态的生产订单（排除报废/已完成/已取消/已关闭/已归档）
        TenantAssert.assertTenantContext();
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        String factoryId = com.fashion.supplychain.common.UserContext.factoryId();
        List<ProductionOrder> allOrders = productionOrderService.lambdaQuery()
            .select(
                ProductionOrder::getId,
                ProductionOrder::getOrderNo,
                ProductionOrder::getStyleNo,
                ProductionOrder::getStyleName,
                ProductionOrder::getFactoryName,
                ProductionOrder::getOrderQuantity,
                ProductionOrder::getCompletedQuantity,
                ProductionOrder::getProductionProgress,
                ProductionOrder::getStatus,
                ProductionOrder::getPlannedEndDate
            )
            .eq(ProductionOrder::getDeleteFlag, 0)
            .eq(ProductionOrder::getTenantId, tenantId)
            .eq(org.springframework.util.StringUtils.hasText(factoryId), ProductionOrder::getFactoryId, factoryId)
            .notIn(ProductionOrder::getStatus, "completed", "cancelled", "scrapped", "closed", "archived")
            .last("LIMIT 5000")
            .list();

        // 如果没有订单，直接返回空结果
        if (allOrders == null || allOrders.isEmpty()) {
            response.setUrgentOrders(new ArrayList<>());
            response.setWarningOrders(new ArrayList<>());
            return response;
        }

        List<DeliveryAlertOrderDto> urgentOrders = new ArrayList<>();
        List<DeliveryAlertOrderDto> warningOrders = new ArrayList<>();

        for (ProductionOrder order : allOrders) {
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

        // 获取合格品和次品数量（指定时间范围内）
        long qualifiedCount = dashboardQueryService.sumQualifiedQuantityBetween(startTime, endTime);
        long defectiveCount = dashboardQueryService.sumUnqualifiedQuantityBetween(startTime, endTime);
        response.setDefectiveCount(defectiveCount);

        // 入库总件数 = 合格件数 + 次品件数（与次品率/合格率口径一致）
        long totalQuantity = qualifiedCount + defectiveCount;
        response.setTotalWarehousing(totalQuantity);
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
        // 工厂账号隔离：只看本工厂的订单统计
        String ctxFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        if (org.springframework.util.StringUtils.hasText(ctxFactoryId)) {
            return buildFactoryTopStats(ctxFactoryId);
        }

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

        // 4. 入库数量
        TopStatsResponse.TimeRangeStats warehousingInboundStats = new TopStatsResponse.TimeRangeStats();
        warehousingInboundStats.setDay((int) dashboardQueryService.sumWarehousingQuantityBetween(dayStart, endTime));
        warehousingInboundStats.setWeek((int) dashboardQueryService.sumWarehousingQuantityBetween(weekStart, endTime));
        warehousingInboundStats.setMonth((int) dashboardQueryService.sumWarehousingQuantityBetween(monthStart, endTime));
        warehousingInboundStats.setYear((int) dashboardQueryService.sumWarehousingQuantityBetween(yearStart, endTime));
        warehousingInboundStats.setTotal((int) dashboardQueryService.sumWarehousingQuantityBetween(totalStart, endTime));
        response.setWarehousingInbound(warehousingInboundStats);

        // 5. 出库数量
        TopStatsResponse.TimeRangeStats warehousingOutboundStats = new TopStatsResponse.TimeRangeStats();
        warehousingOutboundStats.setDay((int) dashboardQueryService.sumOutstockQuantityBetween(dayStart, endTime));
        warehousingOutboundStats.setWeek((int) dashboardQueryService.sumOutstockQuantityBetween(weekStart, endTime));
        warehousingOutboundStats.setMonth((int) dashboardQueryService.sumOutstockQuantityBetween(monthStart, endTime));
        warehousingOutboundStats.setYear((int) dashboardQueryService.sumOutstockQuantityBetween(yearStart, endTime));
        warehousingOutboundStats.setTotal((int) dashboardQueryService.sumOutstockQuantityBetween(totalStart, endTime));
        response.setWarehousingOutbound(warehousingOutboundStats);

        TopStatsResponse.TimeRangeStats warehousingStats = new TopStatsResponse.TimeRangeStats();
        warehousingStats.setDay(warehousingInboundStats.getDay() + warehousingOutboundStats.getDay());
        warehousingStats.setWeek(warehousingInboundStats.getWeek() + warehousingOutboundStats.getWeek());
        warehousingStats.setMonth(warehousingInboundStats.getMonth() + warehousingOutboundStats.getMonth());
        warehousingStats.setYear(warehousingInboundStats.getYear() + warehousingOutboundStats.getYear());
        warehousingStats.setTotal(warehousingInboundStats.getTotal() + warehousingOutboundStats.getTotal());
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

    public Map<String, Object> getOverdueFactoryStats() {
        List<ProductionOrder> allOverdues = dashboardQueryService.listAllOverdueOrders();
        LocalDateTime now = LocalDateTime.now();

        Map<String, List<ProductionOrder>> byFactory = new HashMap<>();
        for (ProductionOrder o : allOverdues) {
            String fName = o.getFactoryName() != null ? o.getFactoryName() : "未指定";
            byFactory.computeIfAbsent(fName, k -> new ArrayList<>()).add(o);
        }

        List<Map<String, Object>> factoryGroups = new ArrayList<>();
        int totalQuantity = 0;
        int totalProgress = 0;
        int totalOverdueDays = 0;

        for (Map.Entry<String, List<ProductionOrder>> entry : byFactory.entrySet()) {
            String fName = entry.getKey();
            List<ProductionOrder> orders = entry.getValue();
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

            int fActiveWorkers = 0;
            try {
                Set<String> factoryIds = orders.stream()
                        .map(ProductionOrder::getFactoryId)
                        .filter(Objects::nonNull)
                        .collect(Collectors.toSet());
                if (!factoryIds.isEmpty()) {
                    QueryWrapper<ScanRecord> aqw = new QueryWrapper<>();
                    aqw.eq("tenant_id", com.fashion.supplychain.common.UserContext.tenantId())
                       .in("factory_id", factoryIds)
                       .eq("scan_result", "success")
                       .ne("scan_type", "orchestration")
                       .ge("scan_time", now.minusDays(30))
                       .select("DISTINCT operator_id");
                    fActiveWorkers = (int) scanRecordService.list(aqw).stream()
                            .map(ScanRecord::getOperatorId).filter(Objects::nonNull).distinct().count();
                }
            } catch (Exception e) {
                log.warn("[Dashboard] 查询工厂活跃工人失败: factory={}, error={}", fName, e.getMessage());
            }

            Map<String, Object> group = new HashMap<>();
            group.put("factoryName", fName);
            group.put("totalOrders", fOrderCount);
            group.put("totalQuantity", fTotalQty);
            group.put("avgProgress", fAvgProgress);
            group.put("avgOverdueDays", fAvgOverdueDays);
            group.put("activeWorkers", fActiveWorkers);
            group.put("estimatedCompletionDays", fEstDays);
            group.put("orders", orderItems);
            factoryGroups.add(group);

            totalQuantity += fTotalQty;
            totalProgress += fProgressSum;
            totalOverdueDays += fOverdueDaysSum;
        }

        int totalCount = allOverdues.size();
        int overallAvgProgress = totalCount > 0 ? totalProgress / totalCount : 0;
        int overallAvgOverdueDays = totalCount > 0 ? totalOverdueDays / totalCount : 0;

        factoryGroups.sort((a, b) -> {
            int oa = (int) a.get("totalOrders");
            int ob = (int) b.get("totalOrders");
            return ob - oa;
        });

        Map<String, Object> result = new HashMap<>();
        result.put("overdueCount", totalCount);
        result.put("totalQuantity", totalQuantity);
        result.put("avgProgress", overallAvgProgress);
        result.put("avgOverdueDays", overallAvgOverdueDays);
        result.put("factoryGroupCount", byFactory.size());
        result.put("factoryGroups", factoryGroups);
        return result;
    }

    // ─────────────────────────────────────────────────────────────
    // 实时扫码动态流（太空舱模块）
    // ─────────────────────────────────────────────────────────────

}
