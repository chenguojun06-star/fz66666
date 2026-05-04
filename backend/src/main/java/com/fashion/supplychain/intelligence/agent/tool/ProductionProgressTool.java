package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Component
public class ProductionProgressTool extends AbstractAgentTool {

    private static final DateTimeFormatter DTF = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final Set<String> FIXED_NODES = Set.of("采购", "裁剪", "二次工艺", "车缝", "尾部", "入库");

    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private ScanRecordService scanRecordService;
    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Override
    public String getName() {
        return "tool_query_production_progress";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("orderNo", stringProp("订单号，例如 PO2026001"));
        props.put("styleNo", stringProp("款号，例如 D2024001"));
        props.put("bundleNo", intProp("菲号编号，查某个菲号的进度"));
        props.put("action", stringProp("操作: detail(订单详情+进度+预测) | bundle_progress(菲号进度) | worker_stats(工人统计) | 默认detail"));
        props.put("status", stringProp("订单状态过滤: production/completed/delayed等"));
        props.put("startDate", stringProp("创建时间起始(yyyy-MM-dd)"));
        props.put("endDate", stringProp("创建时间结束(yyyy-MM-dd)"));
        props.put("limit", intProp("返回最大条数(默认10，最大50)"));
        return buildToolDef(
                "查询订单生产进度详情。包含：6大工序节点进度、当前扫码数量、裁剪数量、菲号数量、参与工人数量、出货预测（预计达到80-90%可出货的时间）。" +
                        "用户问「某个订单进度」「这单还要多久」「什么时候能出货」「菲号进度」「几个人在做」「裁剪数量」「裁了多少」时必须调用。",
                props, Collections.emptyList());
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String orderNo = optionalString(args, "orderNo");
        String styleNo = optionalString(args, "styleNo");
        Integer bundleNo = optionalInt(args, "bundleNo");
        String action = optionalString(args, "action");
        if (action == null || action.isBlank()) action = "detail";

        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId();

        if ("bundle_progress".equals(action) && (orderNo != null || bundleNo != null)) {
            return queryBundleProgress(orderNo, bundleNo, tenantId, factoryId);
        }

        if ("worker_stats".equals(action) && orderNo != null) {
            return queryWorkerStats(orderNo, tenantId, factoryId);
        }

        return queryOrderDetail(args, tenantId, factoryId);
    }

    private String queryOrderDetail(Map<String, Object> args, Long tenantId, String factoryId) throws Exception {
        String orderNo = optionalString(args, "orderNo");
        String styleNo = optionalString(args, "styleNo");
        String status = optionalString(args, "status");
        String startDate = optionalString(args, "startDate");
        String endDate = optionalString(args, "endDate");
        int limit = Optional.ofNullable(optionalInt(args, "limit")).orElse(10);
        limit = Math.max(1, Math.min(limit, 50));

        QueryWrapper<ProductionOrder> query = new QueryWrapper<>();
        if (orderNo != null) query.eq("order_no", orderNo);
        if (styleNo != null) query.eq("style_no", styleNo);
        if (status != null) query.eq("status", status);
        if (startDate != null) query.ge("create_time", LocalDateTime.of(LocalDate.parse(startDate), LocalTime.MIN));
        if (endDate != null) query.le("create_time", LocalDateTime.of(LocalDate.parse(endDate), LocalTime.MAX));
        if (factoryId != null) query.eq("factory_id", factoryId);
        query.eq("tenant_id", tenantId).eq("delete_flag", 0)
                .orderByDesc("create_time").last("LIMIT " + limit);

        List<ProductionOrder> orders = productionOrderService.list(query);
        if (orders.isEmpty()) {
            return errorJson("未查询到符合条件的生产订单");
        }

        List<Map<String, Object>> resultList = new ArrayList<>();
        for (ProductionOrder order : orders) {
            resultList.add(buildOrderDetail(order, tenantId));
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("total", resultList.size());
        data.put("orders", resultList);
        return successJson("查询成功", data);
    }

    private Map<String, Object> buildOrderDetail(ProductionOrder order, Long tenantId) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("orderNo", order.getOrderNo());
        d.put("styleNo", order.getStyleNo());
        d.put("styleName", order.getStyleName());
        d.put("factoryName", order.getFactoryName());
        d.put("orderQuantity", order.getOrderQuantity());
        d.put("completedQuantity", order.getCompletedQuantity());
        d.put("cuttingQuantity", order.getCuttingQuantity());
        d.put("cuttingBundleCount", order.getCuttingBundleCount());
        if (order.getCuttingQuantity() == null && order.getId() != null) {
            List<CuttingBundle> bundles = cuttingBundleService.lambdaQuery()
                    .select(CuttingBundle::getQuantity)
                    .eq(CuttingBundle::getProductionOrderId, order.getId())
                    .eq(CuttingBundle::getTenantId, tenantId)
                    .list();
            int cuttingQty = bundles.stream().mapToInt(b -> b.getQuantity() != null ? b.getQuantity() : 0).sum();
            d.put("cuttingQuantity", cuttingQty);
            d.put("cuttingBundleCount", bundles.size());
        }
        d.put("overallProgress", order.getProductionProgress() != null ? order.getProductionProgress() + "%" : "0%");
        d.put("status", order.getStatus());
        d.put("urgencyLevel", order.getUrgencyLevel());
        d.put("materialArrivalRate", order.getMaterialArrivalRate() != null ? order.getMaterialArrivalRate() + "%" : "-");
        d.put("merchandiser", order.getMerchandiser());
        d.put("plannedEndDate", order.getPlannedEndDate() != null ? order.getPlannedEndDate().format(DTF) : "-");

        // 单价与成本信息
        d.put("factoryUnitPrice", order.getFactoryUnitPrice());
        d.put("quotationUnitPrice", order.getQuotationUnitPrice());
        if (order.getFactoryUnitPrice() != null && order.getOrderQuantity() > 0) {
            d.put("totalFactoryAmount", order.getFactoryUnitPrice().multiply(java.math.BigDecimal.valueOf(order.getOrderQuantity())));
        }
        if (order.getQuotationUnitPrice() != null && order.getOrderQuantity() > 0) {
            d.put("totalQuotationAmount", order.getQuotationUnitPrice().multiply(java.math.BigDecimal.valueOf(order.getOrderQuantity())));
        }
        d.put("progressNodeUnitPrices", order.getProgressNodeUnitPrices());
        d.put("scatterCuttingUnitPrice", order.getScatterCuttingUnitPrice());

        List<ScanRecord> allScans = scanRecordService.lambdaQuery()
                .eq(ScanRecord::getOrderId, order.getId())
                .eq(ScanRecord::getTenantId, tenantId)
                .ne(ScanRecord::getScanType, "orchestration")
                .eq(ScanRecord::getScanResult, "success")
                .list();

        Map<String, StageProgress> stageMap = buildStageProgress(allScans, order.getOrderQuantity());
        List<Map<String, Object>> stages = new ArrayList<>();
        for (String node : FIXED_NODES) {
            StageProgress sp = stageMap.getOrDefault(node, new StageProgress(node));
            stages.add(sp.toMap());
        }
        d.put("stageProgress", stages);

        Set<String> workers = allScans.stream()
                .filter(s -> s.getOperatorName() != null)
                .map(ScanRecord::getOperatorName)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        d.put("totalWorkers", workers.size());
        d.put("workerNames", workers.stream().limit(20).toList());

        int totalScannedQty = allScans.stream().mapToInt(ScanRecord::getQuantity).sum();
        d.put("totalScannedQuantity", totalScannedQty);

        Map<String, Object> prediction = buildShipmentPrediction(order, allScans, stageMap);
        d.put("shipmentPrediction", prediction);

        return d;
    }

    private Map<String, StageProgress> buildStageProgress(List<ScanRecord> scans, int orderQty) {
        Map<String, StageProgress> map = new LinkedHashMap<>();
        for (String node : FIXED_NODES) {
            map.put(node, new StageProgress(node));
        }

        for (ScanRecord scan : scans) {
            String stage = scan.getProgressStage();
            if (stage == null || stage.isBlank()) continue;
            String normalized = normalizeStage(stage);
            StageProgress sp = map.get(normalized);
            if (sp == null) continue;
            sp.scanQuantity += scan.getQuantity();
            if (scan.getOperatorName() != null) {
                sp.workerNames.add(scan.getOperatorName());
            }
            if (scan.getScanTime() != null && (sp.latestScanTime == null || scan.getScanTime().isAfter(sp.latestScanTime))) {
                sp.latestScanTime = scan.getScanTime();
            }
        }

        for (StageProgress sp : map.values()) {
            if (orderQty > 0) {
                sp.progressPct = Math.min(100, (int) ((double) sp.scanQuantity / orderQty * 100));
            }
        }
        return map;
    }

    private String normalizeStage(String stage) {
        if (FIXED_NODES.contains(stage)) return stage;
        if (stage.contains("采购") || stage.equalsIgnoreCase("procurement")) return "采购";
        if (stage.contains("裁剪") || stage.equalsIgnoreCase("cutting")) return "裁剪";
        if (stage.contains("二次工艺") || stage.contains("印绣") || stage.contains("绣花") || stage.contains("印花")) return "二次工艺";
        if (stage.contains("车缝") || stage.contains("缝纫") || stage.equalsIgnoreCase("sewing")) return "车缝";
        if (stage.contains("尾部") || stage.contains("整烫") || stage.contains("剪线") || stage.contains("包装")) return "尾部";
        if (stage.contains("入库") || stage.equalsIgnoreCase("warehouse")) return "入库";
        return stage;
    }

    private Map<String, Object> buildShipmentPrediction(ProductionOrder order, List<ScanRecord> scans, Map<String, StageProgress> stageMap) {
        Map<String, Object> pred = new LinkedHashMap<>();
        int orderQty = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
        if (orderQty <= 0) {
            pred.put("available", false);
            pred.put("reason", "订单数量为0，无法预测");
            return pred;
        }

        int completedQty = order.getCompletedQuantity() != null ? order.getCompletedQuantity() : 0;
        int currentPct = order.getProductionProgress() != null ? order.getProductionProgress() : 0;
        pred.put("currentProgress", currentPct + "%");
        pred.put("currentCompleted", completedQty);
        pred.put("targetShipment", (int) Math.ceil(orderQty * 0.85));
        pred.put("targetRange", "80%-90%（" + (int) Math.ceil(orderQty * 0.8) + "-" + (int) Math.ceil(orderQty * 0.9) + "件）");

        if (currentPct >= 90) {
            pred.put("status", "✅ 已达出货标准");
            pred.put("estimatedDate", "现在可以出货");
            pred.put("available", true);
            return pred;
        }

        if (currentPct >= 80) {
            pred.put("status", "🟡 接近出货标准（80-90%）");
            pred.put("remainingQuantity", orderQty - completedQty);
            pred.put("available", true);
        }

        LocalDateTime firstScan = scans.stream().map(ScanRecord::getScanTime).filter(Objects::nonNull).min(LocalDateTime::compareTo).orElse(null);
        LocalDateTime lastScan = scans.stream().map(ScanRecord::getScanTime).filter(Objects::nonNull).max(LocalDateTime::compareTo).orElse(null);

        if (firstScan == null || lastScan == null || firstScan.equals(lastScan)) {
            pred.put("status", "⏳ 扫码数据不足，无法预测");
            pred.put("available", false);
            pred.put("reason", "需要至少2条不同时间的扫码记录");
            return pred;
        }

        long elapsedDays = ChronoUnit.DAYS.between(firstScan, lastScan) + 1;
        if (elapsedDays <= 0) elapsedDays = 1;
        double dailyRate = (double) completedQty / elapsedDays;

        int target85 = (int) Math.ceil(orderQty * 0.85);
        int remaining = target85 - completedQty;

        if (dailyRate <= 0) {
            pred.put("status", "⏸️ 生产停滞，无法预测");
            pred.put("available", false);
            return pred;
        }

        long daysToTarget = (long) Math.ceil(remaining / dailyRate);
        LocalDate estimatedDate = LocalDate.now().plusDays(daysToTarget);

        pred.put("dailyProductionRate", String.format("%.1f件/天", dailyRate));
        pred.put("remainingToTarget85", remaining);
        pred.put("estimatedDaysToTarget", daysToTarget + "天");
        pred.put("estimatedShipmentDate", estimatedDate.toString());

        if (order.getPlannedEndDate() != null) {
            LocalDate plannedEnd = order.getPlannedEndDate().toLocalDate();
            boolean onTime = !estimatedDate.isAfter(plannedEnd);
            pred.put("plannedEndDate", plannedEnd.toString());
            pred.put("onSchedule", onTime);
            if (onTime) {
                pred.put("status", "📅 预计" + daysToTarget + "天后可达85%出货标准（按时交付）");
            } else {
                long delayDays = ChronoUnit.DAYS.between(plannedEnd, estimatedDate);
                pred.put("status", "⚠️ 预计延期" + delayDays + "天达到出货标准");
                pred.put("delayDays", delayDays);
            }
        } else {
            pred.put("status", "📅 预计" + daysToTarget + "天后可达85%出货标准");
        }

        List<String> bottlenecks = new ArrayList<>();
        for (String node : FIXED_NODES) {
            StageProgress sp = stageMap.get(node);
            if (sp != null && sp.progressPct < currentPct * 0.6 && sp.scanQuantity > 0) {
                bottlenecks.add(node + "（" + sp.progressPct + "%，落后整体进度）");
            }
        }
        if (!bottlenecks.isEmpty()) {
            pred.put("bottlenecks", bottlenecks);
            pred.put("suggestion", "瓶颈工序：" + String.join("、", bottlenecks) + "，建议加派人手");
        }

        pred.put("available", true);
        return pred;
    }

    private String queryBundleProgress(String orderNo, Integer bundleNo, Long tenantId, String factoryId) throws Exception {
        QueryWrapper<ProductionOrder> orderQuery = new QueryWrapper<>();
        if (orderNo != null) orderQuery.eq("order_no", orderNo);
        if (factoryId != null) orderQuery.eq("factory_id", factoryId);
        orderQuery.eq("tenant_id", tenantId).eq("delete_flag", 0).last("LIMIT 1");
        ProductionOrder order = productionOrderService.getOne(orderQuery, false);
        if (order == null) return errorJson("未找到订单：" + orderNo);

        QueryWrapper<CuttingBundle> bundleQuery = new QueryWrapper<>();
        bundleQuery.eq("production_order_id", order.getId());
        if (bundleNo != null) bundleQuery.eq("bundle_no", bundleNo);
        bundleQuery.eq("tenant_id", tenantId).last("LIMIT 20");
        List<CuttingBundle> bundles = cuttingBundleService.list(bundleQuery);
        if (bundles.isEmpty()) return errorJson("未找到菲号记录");

        List<Map<String, Object>> bundleList = new ArrayList<>();
        for (CuttingBundle b : bundles) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("bundleNo", b.getBundleNo());
            item.put("bundleLabel", b.getBundleLabel());
            item.put("color", b.getColor());
            item.put("size", b.getSize());
            item.put("quantity", b.getQuantity());
            item.put("status", b.getStatus());
            item.put("splitStatus", b.getSplitStatus());
            item.put("qrCode", b.getQrCode());

            List<ScanRecord> bundleScans = scanRecordService.lambdaQuery()
                    .eq(ScanRecord::getCuttingBundleId, b.getId())
                    .eq(ScanRecord::getTenantId, tenantId)
                    .ne(ScanRecord::getScanType, "orchestration")
                    .eq(ScanRecord::getScanResult, "success")
                    .orderByDesc(ScanRecord::getScanTime)
                    .last("LIMIT 10")
                    .list();

            int scannedQty = bundleScans.stream().mapToInt(ScanRecord::getQuantity).sum();
            Set<String> workers = bundleScans.stream().map(ScanRecord::getOperatorName).filter(Objects::nonNull).collect(Collectors.toSet());
            item.put("scannedQuantity", scannedQty);
            item.put("progressPct", b.getQuantity() > 0 ? Math.min(100, scannedQty * 100 / b.getQuantity()) + "%" : "0%");
            item.put("workerCount", workers.size());
            item.put("latestScanTime", bundleScans.isEmpty() ? "-" : bundleScans.get(0).getScanTime().format(DTF));

            List<Map<String, Object>> stageList = bundleScans.stream()
                    .collect(Collectors.groupingBy(s -> s.getProgressStage() != null ? s.getProgressStage() : "未知"))
                    .entrySet().stream().map(e -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("stage", e.getKey());
                        m.put("quantity", e.getValue().stream().mapToInt(ScanRecord::getQuantity).sum());
                        m.put("workers", e.getValue().stream().map(ScanRecord::getOperatorName).filter(Objects::nonNull).distinct().toList());
                        return m;
                    }).toList();
            item.put("stageDetails", stageList);

            bundleList.add(item);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("orderNo", orderNo);
        data.put("styleNo", order.getStyleNo());
        data.put("styleName", order.getStyleName());
        data.put("bundles", bundleList);
        return successJson("菲号进度查询成功", data);
    }

    private String queryWorkerStats(String orderNo, Long tenantId, String factoryId) throws Exception {
        QueryWrapper<ProductionOrder> orderQuery = new QueryWrapper<>();
        orderQuery.eq("order_no", orderNo);
        if (factoryId != null) orderQuery.eq("factory_id", factoryId);
        orderQuery.eq("tenant_id", tenantId).eq("delete_flag", 0).last("LIMIT 1");
        ProductionOrder order = productionOrderService.getOne(orderQuery, false);
        if (order == null) return errorJson("未找到订单：" + orderNo);

        List<ScanRecord> allScans = scanRecordService.lambdaQuery()
                .eq(ScanRecord::getOrderId, order.getId())
                .eq(ScanRecord::getTenantId, tenantId)
                .ne(ScanRecord::getScanType, "orchestration")
                .eq(ScanRecord::getScanResult, "success")
                .list();

        Map<String, Map<String, Object>> workerMap = new LinkedHashMap<>();
        for (ScanRecord scan : allScans) {
            String workerId = scan.getOperatorId();
            if (workerId == null) continue;
            Map<String, Object> w = workerMap.computeIfAbsent(workerId, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("workerId", k);
                m.put("workerName", scan.getOperatorName());
                m.put("totalQuantity", 0);
                m.put("stages", new LinkedHashMap<String, Integer>());
                m.put("latestScanTime", scan.getScanTime());
                return m;
            });
            w.put("totalQuantity", (int) w.get("totalQuantity") + scan.getQuantity());
            @SuppressWarnings("unchecked")
            Map<String, Integer> stages = (Map<String, Integer>) w.get("stages");
            String stage = scan.getProgressStage() != null ? scan.getProgressStage() : "未知";
            stages.merge(stage, scan.getQuantity(), Integer::sum);
            if (scan.getScanTime() != null && scan.getScanTime().isAfter((LocalDateTime) w.get("latestScanTime"))) {
                w.put("latestScanTime", scan.getScanTime());
            }
        }

        List<Map<String, Object>> workers = workerMap.values().stream()
                .sorted((a, b) -> (int) b.get("totalQuantity") - (int) a.get("totalQuantity"))
                .map(w -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("workerName", w.get("workerName"));
                    m.put("totalQuantity", w.get("totalQuantity"));
                    m.put("stages", w.get("stages"));
                    m.put("latestScanTime", ((LocalDateTime) w.get("latestScanTime")).format(DTF));
                    return m;
                })
                .toList();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("orderNo", orderNo);
        data.put("totalWorkers", workers.size());
        data.put("workers", workers);
        return successJson("工人统计查询成功", data);
    }

    private static class StageProgress {
        final String stageName;
        int scanQuantity;
        Set<String> workerNames = new LinkedHashSet<>();
        int progressPct;
        LocalDateTime latestScanTime;

        StageProgress(String name) {
            this.stageName = name;
        }

        Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("stage", stageName);
            m.put("scanQuantity", scanQuantity);
            m.put("workerCount", workerNames.size());
            m.put("progress", progressPct + "%");
            m.put("latestScanTime", latestScanTime != null ? latestScanTime.format(DTF) : "-");
            return m;
        }
    }
}
