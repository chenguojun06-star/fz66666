package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.ProcessSynonymMapping;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.mapper.ProductionProcessTrackingMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class OrderFlowStageFillHelper {

    private boolean isDirectCuttingOrder(ProductionOrder order) {
        if (order == null || !StringUtils.hasText(order.getOrderNo())) {
            return false;
        }
        return order.getOrderNo().trim().toUpperCase().startsWith("CUT");
    }

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private MaterialPurchaseMapper materialPurchaseMapper;

    @Autowired
    private ProductionProcessTrackingMapper processTrackingMapper;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ProcessParentMappingService processParentMappingService;

    private boolean isBaseStageName(String processName) {
        String pn = StringUtils.hasText(processName) ? processName.trim() : null;
        if (!StringUtils.hasText(pn)) {
            return false;
        }
        return templateLibraryService
                .progressStageNameMatches(ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED, pn)
                || templateLibraryService
                        .progressStageNameMatches(ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT, pn);
    }

    public void fillFlowStageFields(List<ProductionOrder> records) {
        if (records == null || records.isEmpty()) return;

        TenantAssert.assertTenantContext();
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();

        List<String> orderIds = records.stream()
                .map(r -> r == null ? null : r.getId())
                .filter(StringUtils::hasText).map(String::trim).distinct()
                .collect(Collectors.toList());
        if (orderIds.isEmpty()) return;

        FlowQueryResult qr = queryFlowData(orderIds, tenantId);

        if (qr.flowSnapshotOk) {
            fillFromFlowSnapshot(records, qr.flowByOrder, qr.procurementByOrder, qr.trackingQtyMap);
        } else {
            fillFromScanRecords(records, qr.scansByOrder, qr.procurementByOrder, qr.procurementSnapshotOk, qr.purchasesByOrder);
        }
    }

    private FlowQueryResult queryFlowData(List<String> orderIds, Long tenantId) {
        FlowQueryResult qr = new FlowQueryResult();

        try {
            qr.flowRows = scanRecordMapper.selectFlowStageSnapshot(orderIds, tenantId);
            qr.flowSnapshotOk = true;
        } catch (Exception e) {
            log.warn("Failed to query flow stage snapshot: orderIdsCount={}", orderIds.size(), e);
        }

        qr.trackingQtyMap = loadTrackingQtyMap(orderIds, tenantId);

        try {
            qr.procurementRows = materialPurchaseMapper.selectProcurementSnapshot(orderIds, tenantId);
            qr.procurementSnapshotOk = true;
        } catch (Exception e) {
            log.warn("Failed to query procurement snapshot: orderIdsCount={}", orderIds.size(), e);
        }

        qr.procurementByOrder = buildMapByOrderId(qr.procurementRows);
        qr.flowByOrder = buildMapByOrderId(qr.flowRows);

        if (!qr.flowSnapshotOk) {
            qr.scansByOrder = loadScansByOrder(orderIds);
            if (!qr.procurementSnapshotOk) {
                qr.purchasesByOrder = loadPurchasesByOrder(orderIds);
            }
        }
        return qr;
    }

    private Map<String, Map<String, Integer>> loadTrackingQtyMap(List<String> orderIds, Long tenantId) {
        Map<String, Map<String, Integer>> trackingQtyMap = new HashMap<>();
        try {
            List<Map<String, Object>> trackingRows = processTrackingMapper.selectScannedQtySummaryByOrderIds(orderIds, tenantId);
            if (trackingRows != null) {
                for (Map<String, Object> row : trackingRows) {
                    String toid = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "productionOrderId"));
                    String pname = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "processName"));
                    String pcode = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "processCode"));
                    int qty = ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(row, "scannedQty"));
                    if (StringUtils.hasText(toid) && qty > 0) {
                        if (StringUtils.hasText(pname)) {
                            trackingQtyMap.computeIfAbsent(toid, k -> new HashMap<>()).merge(pname, qty, Integer::sum);
                        }
                        if (StringUtils.hasText(pcode) && !pcode.equals(pname)) {
                            trackingQtyMap.computeIfAbsent(toid, k -> new HashMap<>()).merge(pcode, qty, Integer::sum);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to query process tracking qty summary: {}", e.getMessage());
        }
        return trackingQtyMap;
    }

    private Map<String, List<ScanRecord>> loadScansByOrder(List<String> orderIds) {
        List<ScanRecord> scans;
        try {
            scans = scanRecordMapper.selectList(new LambdaQueryWrapper<ScanRecord>()
                    .select(ScanRecord::getOrderId, ScanRecord::getScanType, ScanRecord::getProgressStage,
                            ScanRecord::getProcessName, ScanRecord::getProcessCode, ScanRecord::getQuantity,
                            ScanRecord::getScanTime, ScanRecord::getOperatorName, ScanRecord::getCreateTime)
                    .in(ScanRecord::getOrderId, orderIds)
                    .in(ScanRecord::getScanType, java.util.Arrays.asList("production", "cutting", "quality", "warehouse"))
                    .eq(ScanRecord::getScanResult, "success")
                    .orderByAsc(ScanRecord::getScanTime)
                    .orderByAsc(ScanRecord::getCreateTime));
        } catch (Exception e) {
            log.warn("Failed to query scan records for flow stage fields: orderIdsCount={}", orderIds.size(), e);
            scans = new ArrayList<>();
        }
        Map<String, List<ScanRecord>> byOrder = new HashMap<>();
        if (scans != null) {
            for (ScanRecord r : scans) {
                if (r == null || !StringUtils.hasText(r.getOrderId())) continue;
                byOrder.computeIfAbsent(r.getOrderId().trim(), k -> new ArrayList<>()).add(r);
            }
        }
        return byOrder;
    }

    private Map<String, List<MaterialPurchase>> loadPurchasesByOrder(List<String> orderIds) {
        Map<String, List<MaterialPurchase>> result = new HashMap<>();
        try {
            List<MaterialPurchase> purchases = materialPurchaseMapper
                    .selectList(new LambdaQueryWrapper<MaterialPurchase>()
                            .in(MaterialPurchase::getOrderId, orderIds)
                            .eq(MaterialPurchase::getDeleteFlag, 0)
                            .orderByAsc(MaterialPurchase::getReceivedTime)
                            .orderByAsc(MaterialPurchase::getUpdateTime));
            if (purchases != null) {
                for (MaterialPurchase p : purchases) {
                    if (p == null || !StringUtils.hasText(p.getOrderId())) continue;
                    result.computeIfAbsent(p.getOrderId().trim(), k -> new ArrayList<>()).add(p);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to query purchases for flow stage fields: orderIdsCount={}", orderIds.size(), e);
        }
        return result;
    }

    private Map<String, Map<String, Object>> buildMapByOrderId(List<Map<String, Object>> rows) {
        Map<String, Map<String, Object>> result = new HashMap<>();
        if (rows == null) return result;
        for (Map<String, Object> row : rows) {
            if (row == null || row.isEmpty()) continue;
            String oid = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "orderId"));
            if (StringUtils.hasText(oid)) result.put(oid.trim(), row);
        }
        return result;
    }

    private void fillFromFlowSnapshot(List<ProductionOrder> records,
            Map<String, Map<String, Object>> flowByOrder,
            Map<String, Map<String, Object>> procurementByOrder,
            Map<String, Map<String, Integer>> trackingQtyMap) {
        for (ProductionOrder o : records) {
            if (o == null || !StringUtils.hasText(o.getId())) continue;
            String oid = o.getId().trim();
            Map<String, Object> flow = flowByOrder.get(oid);
            Map<String, Object> proc = procurementByOrder.get(oid);
            Map<String, Integer> trackingByProcess = trackingQtyMap.getOrDefault(oid, new HashMap<>());

            FlowStageData d = extractFlowStageData(o, flow, proc, trackingByProcess);
            applyFlowStagesToOrder(o, d);
        }
    }

    private FlowStageData extractFlowStageData(ProductionOrder o, Map<String, Object> flow,
            Map<String, Object> proc, Map<String, Integer> trackingByProcess) {
        FlowStageData d = new FlowStageData();
        d.orderStart = o.getCreateTime();
        d.orderEnd = d.orderStart;
        d.orderOperator = null;
        d.orderRate = 100;
        if (flow != null) {
            LocalDateTime os = toLocalDateTime(ParamUtils.getIgnoreCase(flow, "orderStartTime"));
            LocalDateTime oe = toLocalDateTime(ParamUtils.getIgnoreCase(flow, "orderEndTime"));
            if (os != null) { d.orderStart = os; d.orderEnd = oe == null ? os : oe; d.orderOperator = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "orderOperatorName")); }
        }
        if ((!StringUtils.hasText(d.orderOperator) || "system".equalsIgnoreCase(d.orderOperator)) && StringUtils.hasText(o.getCreatedByName())) {
            d.orderOperator = o.getCreatedByName();
        }

        if (proc != null) {
            d.procurementStart = toLocalDateTime(ParamUtils.getIgnoreCase(proc, "procurementStartTime"));
            d.procurementEnd = toLocalDateTime(ParamUtils.getIgnoreCase(proc, "procurementEndTime"));
            d.procurementOperator = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(proc, "procurementOperatorName"));
            long purchaseQty = toLongSafe(ParamUtils.getIgnoreCase(proc, "purchaseQuantity"));
            long arrivedQty = toLongSafe(ParamUtils.getIgnoreCase(proc, "arrivedQuantity"));
            d.procurementRateFromPurchases = purchaseQty > 0 ? (int) Math.round(Math.max(0L, arrivedQty) * 100.0 / purchaseQty) : 0;
        } else if (flow != null) {
            d.procurementStart = toLocalDateTime(ParamUtils.getIgnoreCase(flow, "procurementScanStartTime"));
            d.procurementEnd = toLocalDateTime(ParamUtils.getIgnoreCase(flow, "procurementScanEndTime"));
            d.procurementOperator = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "procurementScanOperatorName"));
        }

        d.cuttingStart = extractTime(flow, "cuttingStartTime"); d.cuttingEnd = extractTime(flow, "cuttingEndTime");
        d.cuttingOperator = extractStr(flow, "cuttingOperatorName"); d.cuttingQty = extractInt(flow, "cuttingQuantity");
        d.sewingStart = extractTime(flow, "sewingStartTime"); d.sewingEnd = extractTime(flow, "sewingEndTime");
        d.sewingOperator = extractStr(flow, "sewingOperatorName");
        d.carSewingStart = extractTime(flow, "carSewingStartTime"); d.carSewingEnd = extractTime(flow, "carSewingEndTime");
        d.carSewingOperator = extractStr(flow, "carSewingOperatorName"); d.carSewingQty = extractInt(flow, "carSewingQuantity");
        d.ironingStart = extractTime(flow, "ironingStartTime"); d.ironingEnd = extractTime(flow, "ironingEndTime");
        d.ironingOperator = extractStr(flow, "ironingOperatorName"); d.ironingQty = extractInt(flow, "ironingQuantity");
        d.secondaryProcessStart = extractTime(flow, "secondaryProcessStartTime"); d.secondaryProcessEnd = extractTime(flow, "secondaryProcessEndTime");
        d.secondaryProcessOperator = extractStr(flow, "secondaryProcessOperatorName"); d.secondaryProcessQty = extractInt(flow, "secondaryProcessQuantity");
        d.packagingStart = extractTime(flow, "packagingStartTime"); d.packagingEnd = extractTime(flow, "packagingEndTime");
        d.packagingOperator = extractStr(flow, "packagingOperatorName"); d.packagingQty = extractInt(flow, "packagingQuantity");
        d.qualityStart = extractTime(flow, "qualityStartTime"); d.qualityEnd = extractTime(flow, "qualityEndTime");
        d.qualityOperator = extractStr(flow, "qualityOperatorName"); d.qualityQty = extractInt(flow, "qualityQuantity");
        d.wareStart = extractTime(flow, "warehousingStartTime"); d.wareEnd = extractTime(flow, "warehousingEndTime");
        d.wareOperator = extractStr(flow, "warehousingOperatorName"); d.wareQty = extractInt(flow, "warehousingQuantity");

        if (!trackingByProcess.isEmpty()) {
            Map<String, Integer> parentQtyMap = buildParentNodeQtyMap(trackingByProcess);
            d.carSewingQty = Math.max(d.carSewingQty, parentQtyMap.getOrDefault("车缝", 0));
            d.ironingQty = Math.max(d.ironingQty, parentQtyMap.getOrDefault("尾部", 0));
            d.secondaryProcessQty = Math.max(d.secondaryProcessQty, parentQtyMap.getOrDefault("二次工艺", 0));
            d.packagingQty = Math.max(d.packagingQty, parentQtyMap.getOrDefault("包装", 0));
            d.qualityQty = Math.max(d.qualityQty, parentQtyMap.getOrDefault("质检", 0));
        }
        d.trackingByProcess = trackingByProcess;
        return d;
    }

    private LocalDateTime extractTime(Map<String, Object> map, String key) {
        return map == null ? null : toLocalDateTime(ParamUtils.getIgnoreCase(map, key));
    }
    private String extractStr(Map<String, Object> map, String key) {
        return map == null ? null : ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(map, key));
    }
    private int extractInt(Map<String, Object> map, String key) {
        return map == null ? 0 : ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(map, key));
    }

    private void applyFlowStagesToOrder(ProductionOrder o, FlowStageData d) {
        o.setOrderStartTime(d.orderStart); o.setOrderEndTime(d.orderEnd);
        o.setOrderOperatorName(d.orderOperator); o.setOrderCompletionRate(d.orderRate);

        boolean directCuttingOrder = isDirectCuttingOrder(o);
        fillProcurementDisplay(o, d.procurementStart, d.procurementEnd, d.procurementOperator, d.procurementRateFromPurchases, directCuttingOrder);

        o.setCuttingStartTime(d.cuttingStart); o.setCuttingEndTime(d.cuttingEnd); o.setCuttingOperatorName(d.cuttingOperator);
        int cuttingQtyForRate = o.getCuttingQuantity() == null ? d.cuttingQty : o.getCuttingQuantity();
        int orderQtyForRate = o.getOrderQuantity() == null ? 0 : o.getOrderQuantity();
        int baseQtyForRate = orderQtyForRate > 0 ? orderQtyForRate : cuttingQtyForRate;
        int cuttingActualQty = o.getCuttingBundleCount() != null && o.getCuttingBundleCount() > 0 ? d.cuttingQty : 0;
        o.setCuttingCompletionRate(computeRate(cuttingActualQty, orderQtyForRate));

        o.setSewingStartTime(d.sewingStart); o.setSewingEndTime(d.sewingEnd); o.setSewingOperatorName(d.sewingOperator);
        int wareQtyForRate = o.getWarehousingQualifiedQuantity() == null ? d.wareQty : o.getWarehousingQualifiedQuantity();
        o.setSewingCompletionRate(computeRate(wareQtyForRate, cuttingQtyForRate));

        o.setCarSewingStartTime(d.carSewingStart); o.setCarSewingEndTime(d.carSewingEnd); o.setCarSewingOperatorName(d.carSewingOperator);
        o.setCarSewingCompletionRate(computeRate(d.carSewingQty, baseQtyForRate));

        o.setIroningStartTime(d.ironingStart); o.setIroningEndTime(d.ironingEnd); o.setIroningOperatorName(d.ironingOperator);
        o.setIroningCompletionRate(computeRate(d.ironingQty, baseQtyForRate));

        o.setSecondaryProcessStartTime(d.secondaryProcessStart); o.setSecondaryProcessEndTime(d.secondaryProcessEnd);
        o.setSecondaryProcessOperatorName(d.secondaryProcessOperator);
        Integer secondaryProcessRate = computeRate(d.secondaryProcessQty, baseQtyForRate);
        o.setSecondaryProcessCompletionRate(secondaryProcessRate); o.setSecondaryProcessRate(secondaryProcessRate);

        o.setPackagingStartTime(d.packagingStart); o.setPackagingEndTime(d.packagingEnd); o.setPackagingOperatorName(d.packagingOperator);
        Integer packagingRate = computeRate(d.packagingQty, baseQtyForRate);
        o.setPackagingCompletionRate(packagingRate);

        if (d.trackingByProcess != null && !d.trackingByProcess.isEmpty()) {
            Integer tailMinRate = resolveTrackingMinRate(d.trackingByProcess, baseQtyForRate,
                    new String[]{"尾部", "大烫", "整烫", "剪线", "尾工", "ironing", "tailprocess", "tail_process"},
                    new String[]{"包装", "packaging"});
            o.setTailProcessRate(tailMinRate != null ? tailMinRate : packagingRate);
        } else {
            Integer elseIroningRate = computeRate(d.ironingQty, baseQtyForRate);
            o.setTailProcessRate(elseIroningRate != null ? elseIroningRate : packagingRate);
        }

        o.setQualityStartTime(d.qualityStart); o.setQualityEndTime(d.qualityEnd); o.setQualityOperatorName(d.qualityOperator);
        o.setQualityCompletionRate(computeRate(d.qualityQty, baseQtyForRate));

        o.setWarehousingStartTime(d.wareStart); o.setWarehousingEndTime(d.wareEnd); o.setWarehousingOperatorName(d.wareOperator);
        wareQtyForRate = o.getWarehousingQualifiedQuantity() == null ? d.wareQty : o.getWarehousingQualifiedQuantity();
        o.setWarehousingCompletionRate(computeRate(wareQtyForRate, baseQtyForRate));
    }

    private void fillFromScanRecords(List<ProductionOrder> records,
            Map<String, List<ScanRecord>> scansByOrder,
            Map<String, Map<String, Object>> procurementByOrder,
            boolean procurementSnapshotOk,
            Map<String, List<MaterialPurchase>> purchasesByOrder) {
        for (ProductionOrder o : records) {
            if (o == null || !StringUtils.hasText(o.getId())) continue;
            String oid = o.getId().trim();
            List<ScanRecord> list = scansByOrder.getOrDefault(oid, new ArrayList<>());

            FlowStageData d = aggregateScanRecords(list, o);
            resolveProcurementFromScanFallback(o, oid, d, procurementByOrder, procurementSnapshotOk, purchasesByOrder);
            applyFlowStagesToOrder(o, d);
        }
    }

    private FlowStageData aggregateScanRecords(List<ScanRecord> list, ProductionOrder o) {
        FlowStageData d = new FlowStageData();
        d.orderStart = o.getCreateTime(); d.orderEnd = d.orderStart; d.orderOperator = null; d.orderRate = 100;

        for (ScanRecord r : list) {
            String st = r.getScanType() == null ? "" : r.getScanType().trim();
            String pn = r.getProgressStage() == null ? "" : r.getProgressStage().trim();
            if (!StringUtils.hasText(pn)) pn = r.getProcessName() == null ? "" : r.getProcessName().trim();
            String pc = r.getProcessCode() == null ? "" : r.getProcessCode().trim();
            int q = r.getQuantity() == null ? 0 : r.getQuantity();
            LocalDateTime t = r.getScanTime();
            String op = r.getOperatorName();

            if (("production".equals(st) || "orchestration".equals(st)) && templateLibraryService.progressStageNameMatches(ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED, pn)) {
                d.orderStart = t; d.orderEnd = t; d.orderOperator = op; d.orderRate = 100;
            } else if (("production".equals(st) || "orchestration".equals(st)) && templateLibraryService.progressStageNameMatches(ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT, pn)) {
                if (d.procurementStart == null) d.procurementStart = t; d.procurementEnd = t; d.procurementOperator = op;
            } else if ("quality".equals(st) || "quality_warehousing".equals(pc) || ("production".equals(st) && templateLibraryService.isProgressQualityStageName(pn))) {
                if (d.qualityStart == null) d.qualityStart = t; d.qualityEnd = t; d.qualityOperator = op; d.qualityQty += Math.max(0, q);
            } else if ("warehouse".equals(st) && !"warehouse_rollback".equals(pc)) {
                if (d.wareStart == null) d.wareStart = t; d.wareEnd = t; d.wareOperator = op; d.wareQty += Math.max(0, q);
            } else if ("cutting".equals(st) || (("production".equals(st) || "orchestration".equals(st)) && isParentNodeMatch(pn, "裁剪"))) {
                if (d.cuttingStart == null) d.cuttingStart = t; d.cuttingEnd = t; d.cuttingOperator = op; d.cuttingQty += Math.max(0, q);
            } else if ("production".equals(st) && isParentNodeMatch(pn, "车缝")) {
                if (d.carSewingStart == null) d.carSewingStart = t; d.carSewingEnd = t; d.carSewingOperator = op; d.carSewingQty += Math.max(0, q);
            } else if ("production".equals(st) && isParentNodeMatch(pn, "尾部")) {
                if (d.ironingStart == null) d.ironingStart = t; d.ironingEnd = t; d.ironingOperator = op; d.ironingQty += Math.max(0, q);
            } else if ("production".equals(st) && isParentNodeMatch(pn, "二次工艺")) {
                if (d.secondaryProcessStart == null) d.secondaryProcessStart = t; d.secondaryProcessEnd = t; d.secondaryProcessOperator = op; d.secondaryProcessQty += Math.max(0, q);
            } else if ("production".equals(st) && !isBaseStageName(pn) && !"quality_warehousing".equals(pc) && !templateLibraryService.isProgressQualityStageName(pn) && !isAnyRecognizedParentNode(pn)) {
                if (d.sewingStart == null) d.sewingStart = t; d.sewingEnd = t; d.sewingOperator = op;
            }
        }

        if ((!StringUtils.hasText(d.orderOperator) || "system".equalsIgnoreCase(d.orderOperator)) && StringUtils.hasText(o.getCreatedByName())) {
            d.orderOperator = o.getCreatedByName();
        }
        return d;
    }

    private void resolveProcurementFromScanFallback(ProductionOrder o, String oid, FlowStageData d,
            Map<String, Map<String, Object>> procurementByOrder, boolean procurementSnapshotOk,
            Map<String, List<MaterialPurchase>> purchasesByOrder) {
        if (procurementSnapshotOk) {
            Map<String, Object> proc = procurementByOrder.get(oid);
            if (proc != null) {
                d.procurementStart = toLocalDateTime(ParamUtils.getIgnoreCase(proc, "procurementStartTime"));
                d.procurementEnd = toLocalDateTime(ParamUtils.getIgnoreCase(proc, "procurementEndTime"));
                d.procurementOperator = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(proc, "procurementOperatorName"));
                long purchaseQty = toLongSafe(ParamUtils.getIgnoreCase(proc, "purchaseQuantity"));
                long arrivedQty = toLongSafe(ParamUtils.getIgnoreCase(proc, "arrivedQuantity"));
                d.procurementRateFromPurchases = purchaseQty > 0 ? (int) Math.round(Math.max(0L, arrivedQty) * 100.0 / purchaseQty) : 0;
            }
        } else {
            try {
                List<MaterialPurchase> purchases = purchasesByOrder.getOrDefault(oid, new ArrayList<>());
                if (!purchases.isEmpty()) {
                    MaterialPurchaseService.ArrivalStats purchaseStats = materialPurchaseService.computeArrivalStats(purchases);
                    d.procurementRateFromPurchases = purchaseStats == null ? 0 : purchaseStats.getArrivalRate();
                    for (MaterialPurchase p : purchases) {
                        if (p == null) continue;
                        String status = p.getStatus() == null ? "" : p.getStatus().trim();
                        if ("pending".equalsIgnoreCase(status) || "cancelled".equalsIgnoreCase(status)) continue;
                        LocalDateTime s = p.getCreateTime();
                        if (s != null && (d.procurementStart == null || s.isBefore(d.procurementStart))) d.procurementStart = s;
                        LocalDateTime t = p.getReceivedTime() == null ? p.getUpdateTime() : p.getReceivedTime();
                        if (t != null && (d.procurementEnd == null || t.isAfter(d.procurementEnd))) { d.procurementEnd = t; d.procurementOperator = p.getReceiverName(); }
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to compute procurement summary from purchases: orderId={}", oid, e);
            }
        }
    }

    private static class FlowQueryResult {
        boolean flowSnapshotOk;
        List<Map<String, Object>> flowRows;
        Map<String, Map<String, Object>> flowByOrder = new HashMap<>();
        Map<String, Map<String, Integer>> trackingQtyMap = new HashMap<>();
        boolean procurementSnapshotOk;
        List<Map<String, Object>> procurementRows;
        Map<String, Map<String, Object>> procurementByOrder = new HashMap<>();
        Map<String, List<ScanRecord>> scansByOrder = new HashMap<>();
        Map<String, List<MaterialPurchase>> purchasesByOrder = new HashMap<>();
    }

    private static class FlowStageData {
        LocalDateTime orderStart, orderEnd; String orderOperator; Integer orderRate;
        LocalDateTime procurementStart, procurementEnd; String procurementOperator; Integer procurementRateFromPurchases;
        LocalDateTime cuttingStart, cuttingEnd; String cuttingOperator; int cuttingQty;
        LocalDateTime sewingStart, sewingEnd; String sewingOperator;
        LocalDateTime carSewingStart, carSewingEnd; String carSewingOperator; int carSewingQty;
        LocalDateTime ironingStart, ironingEnd; String ironingOperator; int ironingQty;
        LocalDateTime secondaryProcessStart, secondaryProcessEnd; String secondaryProcessOperator; int secondaryProcessQty;
        LocalDateTime packagingStart, packagingEnd; String packagingOperator; int packagingQty;
        LocalDateTime qualityStart, qualityEnd; String qualityOperator; int qualityQty;
        LocalDateTime wareStart, wareEnd; String wareOperator; int wareQty;
        Map<String, Integer> trackingByProcess;
    }

    /**
     * 采购进度显示逻辑（统一处理采购完成率 + 时间/操作人显示规则）。
     * <p>
     * 规则：
     * <ul>
     *   <li>直接裁剪单（CUT-前缀）→ procurementRate = null，时间全清空</li>
     *   <li>优先使用物料到货率 → 采购单到货率 → 0</li>
     *   <li>到货率 &gt; 0 → 显示开始时间</li>
     *   <li>到货率 ≥ 50 且人工确认 → 显示完成时间（使用确认人信息覆盖）</li>
     * </ul>
     */
    private void fillProcurementDisplay(ProductionOrder o,
            LocalDateTime procurementStart, LocalDateTime procurementEnd,
            String procurementOperator, Integer procurementRateFromPurchases,
            boolean directCuttingOrder) {
        Integer procurementRate;
        if (directCuttingOrder) {
            procurementRate = null;
        } else if (o.getMaterialArrivalRate() != null) {
            procurementRate = scanRecordDomainService.clampPercent(o.getMaterialArrivalRate());
        } else if (procurementRateFromPurchases != null) {
            procurementRate = scanRecordDomainService.clampPercent(procurementRateFromPurchases);
        } else {
            procurementRate = 0;
        }

        Integer manuallyCompleted = o.getProcurementManuallyCompleted();
        boolean isManuallyConfirmed = (manuallyCompleted != null && manuallyCompleted == 1);

        if (isManuallyConfirmed && !directCuttingOrder) {
            procurementRate = 100;
        }

        o.setProcurementCompletionRate(procurementRate);

        if (!directCuttingOrder && (isManuallyConfirmed || (procurementRate != null && procurementRate > 0))) {
            o.setProcurementStartTime(procurementStart);
            if (isManuallyConfirmed) {
                if (o.getProcurementConfirmedAt() != null) {
                    procurementEnd = o.getProcurementConfirmedAt();
                }
                if (o.getProcurementConfirmedByName() != null) {
                    procurementOperator = o.getProcurementConfirmedByName();
                }
                o.setProcurementEndTime(procurementEnd);
                o.setProcurementOperatorName(procurementOperator);
            } else {
                o.setProcurementEndTime(procurementEnd);
                o.setProcurementOperatorName(procurementOperator);
            }
        } else {
            o.setProcurementStartTime(null);
            o.setProcurementEndTime(null);
            o.setProcurementOperatorName(null);
        }
    }

    /**
     * 统一比率计算：qty / baseQty → 0~100 之间的百分比（向上 clamp）。
     * baseQty ≤ 0 时返回 0，避免除零。
     */
    private int computeRate(int qty, int baseQty) {
        if (baseQty <= 0) {
            return 0;
        }
        return scanRecordDomainService.clampPercent(
                (int) Math.round(Math.max(0, qty) * 100.0 / baseQty));
    }

    static long toLongSafe(Object v) {
        if (v == null) {
            return 0L;
        }
        if (v instanceof Number number) {
            return number.longValue();
        }
        String s = String.valueOf(v);
        if (!StringUtils.hasText(s)) {
            return 0L;
        }
        try {
            return new java.math.BigDecimal(s.trim()).setScale(0, java.math.RoundingMode.HALF_UP).longValue();
        } catch (Exception e) {
            return 0L;
        }
    }

    static LocalDateTime toLocalDateTime(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof LocalDateTime time) {
            return time;
        }
        if (v instanceof java.sql.Timestamp timestamp) {
            return timestamp.toLocalDateTime();
        }
        return null;
    }

    /**
     * 轻量级完成率 + 时间字段填充（列表查询专用）
     * <p>
     * 完成率：不查视图，直接利用已被 fillCuttingSummary / fillStockSummary 填充好的字段计算。<br>
     * 时间字段：
     * <ul>
     *   <li>采购时间 → 批量查 t_material_purchase（一次 GROUP BY，已有 selectProcurementSnapshot）</li>
     *   <li>裁剪时间 → 从 cuttingTask（已由 fillCuttingSummary 加载）直接提取，零额外查询</li>
     *   <li>车缝/质检/入库时间 → 由前端逐单加载扫码记录后自行计算，后端无需填充</li>
     * </ul>
     * 调用时机：queryPage() 在 fillCuttingSummary / fillStockSummary 完成后调用本方法。
     */
    public void fillCompletionRatesLight(List<ProductionOrder> records) {
        if (records == null || records.isEmpty()) return;
        TenantAssert.assertTenantContext();
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();

        List<String> orderIds = records.stream()
                .filter(o -> o != null && StringUtils.hasText(o.getId()))
                .map(o -> o.getId().trim())
                .distinct()
                .collect(Collectors.toList());

        Map<String, Map<String, Object>> procByOrder = loadProcurementSnapshot(orderIds, tenantId);
        Map<String, Map<String, Integer>> trackingQtyMap = loadTrackingQtySummary(orderIds, tenantId);

        for (ProductionOrder o : records) {
            if (o == null) continue;
            fillProcurementFields(o, procByOrder);
            fillCuttingTimeFields(o);
            fillCompletionRates(o, trackingQtyMap);
        }
    }

    private Map<String, Map<String, Object>> loadProcurementSnapshot(List<String> orderIds, Long tenantId) {
        Map<String, Map<String, Object>> procByOrder = new HashMap<>();
        if (orderIds.isEmpty()) return procByOrder;
        try {
            List<Map<String, Object>> rows = materialPurchaseMapper.selectProcurementSnapshot(orderIds, tenantId);
            if (rows != null) {
                for (Map<String, Object> row : rows) {
                    String oid = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "orderId"));
                    if (StringUtils.hasText(oid)) procByOrder.put(oid.trim(), row);
                }
            }
        } catch (Exception e) {
            log.warn("[fillCompletionRatesLight] procurement snapshot query failed", e);
        }
        return procByOrder;
    }

    private Map<String, Map<String, Integer>> loadTrackingQtySummary(List<String> orderIds, Long tenantId) {
        Map<String, Map<String, Integer>> trackingQtyMap = new HashMap<>();
        if (orderIds.isEmpty()) return trackingQtyMap;
        try {
            List<Map<String, Object>> trackingRows = processTrackingMapper.selectScannedQtySummaryByOrderIds(orderIds, tenantId);
            if (trackingRows != null) {
                for (Map<String, Object> row : trackingRows) {
                    String toid = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "productionOrderId"));
                    String pname = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "processName"));
                    String pcode = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "processCode"));
                    int qty = ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(row, "scannedQty"));
                    if (StringUtils.hasText(toid) && qty > 0) {
                        if (StringUtils.hasText(pname)) {
                            trackingQtyMap.computeIfAbsent(toid, k -> new HashMap<>()).merge(pname, qty, Integer::sum);
                        }
                        if (StringUtils.hasText(pcode) && !pcode.equals(pname)) {
                            trackingQtyMap.computeIfAbsent(toid, k -> new HashMap<>()).merge(pcode, qty, Integer::sum);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[fillCompletionRatesLight] process tracking summary query failed: {}", e.getMessage());
        }
        return trackingQtyMap;
    }

    private void fillProcurementFields(ProductionOrder o, Map<String, Map<String, Object>> procByOrder) {
        boolean directCuttingOrder = isDirectCuttingOrder(o);
        Integer procRate = directCuttingOrder
            ? null
            : ((o.getMaterialArrivalRate() != null)
            ? scanRecordDomainService.clampPercent(o.getMaterialArrivalRate())
            : 0);
        o.setProcurementCompletionRate(procRate);

        String oid = o.getId() == null ? "" : o.getId().trim();
        Map<String, Object> procRow = procByOrder.get(oid);
        if (directCuttingOrder) {
            o.setProcurementStartTime(null);
            o.setProcurementEndTime(null);
            o.setProcurementOperatorName(null);
        } else if (procRow != null) {
            if (o.getProcurementStartTime() == null) {
                o.setProcurementStartTime(toLocalDateTime(ParamUtils.getIgnoreCase(procRow, "procurementStartTime")));
            }
            if (o.getProcurementEndTime() == null) {
                o.setProcurementEndTime(toLocalDateTime(ParamUtils.getIgnoreCase(procRow, "procurementEndTime")));
            }
            if (!StringUtils.hasText(o.getProcurementOperatorName())) {
                o.setProcurementOperatorName(
                        ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(procRow, "procurementOperatorName")));
            }
        }
    }

    private void fillCuttingTimeFields(ProductionOrder o) {
        CuttingTask ct = o.getCuttingTask();
        if (ct != null) {
            if (o.getCuttingStartTime() == null) {
                LocalDateTime csStart = ct.getReceivedTime() != null ? ct.getReceivedTime() : ct.getOrderTime();
                o.setCuttingStartTime(csStart);
            }
            if (o.getCuttingEndTime() == null && ct.getBundledTime() != null) {
                o.setCuttingEndTime(ct.getBundledTime());
            }
            if (!StringUtils.hasText(o.getCuttingOperatorName()) && StringUtils.hasText(ct.getUpdaterName())) {
                o.setCuttingOperatorName(ct.getUpdaterName());
            }
        }
    }

    private void fillCompletionRates(ProductionOrder o, Map<String, Map<String, Integer>> trackingQtyMap) {
        int orderQty    = o.getOrderQuantity() == null ? 0 : o.getOrderQuantity();
        int cuttingQty  = o.getCuttingQuantity() == null ? 0 : o.getCuttingQuantity();
        int wareQty     = o.getWarehousingQualifiedQuantity() == null ? 0 : o.getWarehousingQualifiedQuantity();
        int completedQty = o.getCompletedQuantity() == null ? 0 : o.getCompletedQuantity();
        int baseQty = cuttingQty > 0 ? cuttingQty : orderQty;

        String oid = o.getId() == null ? "" : o.getId().trim();
        Map<String, Integer> trackingByProcess = trackingQtyMap.getOrDefault(oid, java.util.Collections.emptyMap());
        Map<String, Integer> parentQtyMap = buildParentNodeQtyMap(trackingByProcess);

        int cuttingScannedQty = parentQtyMap.getOrDefault("裁剪", 0);
        int cuttingActualQty = o.getCuttingBundleCount() != null && o.getCuttingBundleCount() > 0
                ? Math.max(cuttingScannedQty, 0) : 0;
        o.setCuttingCompletionRate(computeRate(cuttingActualQty, orderQty));

        int sewBase = baseQty > 0 ? baseQty : 1;
        int wareRate = computeRate(wareQty, sewBase);
        int completedRate = computeRate(completedQty, sewBase);

        int carSewingQty = parentQtyMap.getOrDefault("车缝", 0);
        int secondaryProcessQty = parentQtyMap.getOrDefault("二次工艺", 0);
        int tailQty = parentQtyMap.getOrDefault("尾部", 0);
        int qualityQty = parentQtyMap.getOrDefault("质检", 0);

        int carSewingRate = computeRate(carSewingQty, sewBase);
        int secondaryProcessRate = computeRate(secondaryProcessQty, sewBase);
        int tailRate = computeRate(tailQty, sewBase);
        int qualityRate = computeRate(qualityQty, sewBase);

        o.setSewingCompletionRate(carSewingRate);
        o.setCarSewingCompletionRate(carSewingRate);
        o.setIroningCompletionRate(tailRate);
        o.setSecondaryProcessCompletionRate(secondaryProcessRate);
        o.setSecondaryProcessRate(secondaryProcessRate);
        o.setTailProcessRate(tailRate);
        o.setPackagingCompletionRate(tailRate);
        o.setQualityCompletionRate(qualityRate);
        o.setWarehousingCompletionRate(wareRate);
    }


    /**
     * 从 process_tracking 按工序名关键字汇总已扫数量，取视图量和 tracking 量的最大值。
     * 保证列表进度数量不低于弹窗中显示的实际值。
     */
    private Map<String, Integer> buildParentNodeQtyMap(Map<String, Integer> trackingByProcess) {
        Map<String, Integer> result = new HashMap<>();
        if (trackingByProcess == null || trackingByProcess.isEmpty()) {
            return result;
        }
        for (Map.Entry<String, Integer> entry : trackingByProcess.entrySet()) {
            String pname = entry.getKey() == null ? "" : entry.getKey().trim();
            if (pname.isEmpty() || entry.getValue() == null || entry.getValue() <= 0) {
                continue;
            }
            String parentNode = resolveParentForAggregation(pname);
            if (parentNode != null) {
                result.merge(parentNode, entry.getValue(), Integer::sum);
            }
        }
        return result;
    }

    private String resolveParentForAggregation(String processName) {
        if (!StringUtils.hasText(processName)) return null;
        String pn = processName.trim();
        if ("采购".equals(pn) || ProcessSynonymMapping.isEquivalent("采购", pn)) return "采购";
        if ("裁剪".equals(pn) || ProcessSynonymMapping.isEquivalent("裁剪", pn)) return "裁剪";
        if ("车缝".equals(pn) || ProcessSynonymMapping.isEquivalent("车缝", pn)) return "车缝";
        if ("二次工艺".equals(pn) || ProcessSynonymMapping.isEquivalent("二次工艺", pn)) return "二次工艺";
        if ("尾部".equals(pn) || ProcessSynonymMapping.isEquivalent("尾部", pn)) return "尾部";
        if ("入库".equals(pn) || ProcessSynonymMapping.isEquivalent("入库", pn)) return "入库";
        if ("质检".equals(pn) || ProcessSynonymMapping.isEquivalent("质检", pn)) return "质检";
        if ("包装".equals(pn) || ProcessSynonymMapping.isEquivalent("包装", pn)) return "包装";
        String mapped = processParentMappingService.resolveParentNode(pn);
        if (StringUtils.hasText(mapped)) return mapped;
        return null;
    }

    private boolean isParentNodeMatch(String processName, String targetParent) {
        if (!StringUtils.hasText(processName)) return false;
        String pn = processName.trim();
        if (targetParent.equals(pn)) return true;
        if (ProcessSynonymMapping.isEquivalent(targetParent, pn)) return true;
        String mapped = processParentMappingService.resolveParentNode(pn);
        return targetParent.equals(mapped);
    }

    private boolean isAnyRecognizedParentNode(String processName) {
        if (!StringUtils.hasText(processName)) return false;
        String pn = processName.trim();
        if (isParentNodeMatch(pn, "采购")) return true;
        if (isParentNodeMatch(pn, "裁剪")) return true;
        if (isParentNodeMatch(pn, "车缝")) return true;
        if (isParentNodeMatch(pn, "二次工艺")) return true;
        if (isParentNodeMatch(pn, "尾部")) return true;
        if (isParentNodeMatch(pn, "入库")) return true;
        return false;
    }

    private Integer resolveTrackingMinRate(Map<String, Integer> trackingByProcess, int baseQty,
            String[] parentKeywords, String[] subProcessKeywords) {
        if (trackingByProcess.isEmpty() || baseQty <= 0) {
            return null;
        }
        Map<String, Integer> subProcessQtys = new HashMap<>();
        for (Map.Entry<String, Integer> entry : trackingByProcess.entrySet()) {
            String pname = entry.getKey() == null ? "" : entry.getKey().trim();
            if (pname.isEmpty() || entry.getValue() == null || entry.getValue() <= 0) {
                continue;
            }
            boolean isParent = false;
            for (String kw : parentKeywords) {
                if (pname.toLowerCase().contains(kw.toLowerCase())) {
                    isParent = true;
                    break;
                }
            }
            if (isParent) {
                continue;
            }
            boolean isSubProcess = false;
            for (String kw : subProcessKeywords) {
                if (pname.toLowerCase().contains(kw.toLowerCase())) {
                    isSubProcess = true;
                    break;
                }
            }
            if (!isSubProcess) {
                boolean matchesAnyParent = false;
                for (String kw : parentKeywords) {
                    if (pname.toLowerCase().contains(kw.toLowerCase())) {
                        matchesAnyParent = true;
                        break;
                    }
                }
                if (!matchesAnyParent) {
                    continue;
                }
            }
            subProcessQtys.merge(pname, entry.getValue(), Integer::sum);
        }
        if (subProcessQtys.isEmpty()) {
            return null;
        }
        int minRate = 100;
        for (Map.Entry<String, Integer> e : subProcessQtys.entrySet()) {
            int rate = computeRate(e.getValue(), baseQty);
            if (rate < minRate) {
                minRate = rate;
            }
        }
        return minRate;
    }
}
