package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.mapper.ProductionProcessTrackingMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
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
        if (records == null || records.isEmpty()) {
            return;
        }

        List<String> orderIds = records.stream()
                .map(r -> r == null ? null : r.getId())
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());
        if (orderIds.isEmpty()) {
            return;
        }

        boolean flowSnapshotOk = false;
        List<Map<String, Object>> flowRows = null;
        try {
            flowRows = scanRecordMapper.selectFlowStageSnapshot(orderIds);
            flowSnapshotOk = true;
        } catch (Exception e) {
            log.warn("Failed to query flow stage snapshot: orderIdsCount={}", orderIds.size(), e);
        }

        // 从 process_tracking 加载各工序实际已扫数量（与弹窗同源，修正视图匹配遗漏问题）
        Map<String, Map<String, Integer>> trackingQtyMap = new HashMap<>();
        try {
            List<Map<String, Object>> trackingRows = processTrackingMapper.selectScannedQtySummaryByOrderIds(orderIds);
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
                        // processCode 单独也作为 key，避免 process_name 为空时漏掉
                        if (StringUtils.hasText(pcode) && !pcode.equals(pname)) {
                            trackingQtyMap.computeIfAbsent(toid, k -> new HashMap<>()).merge(pcode, qty, Integer::sum);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to query process tracking qty summary: {}", e.getMessage());
        }

        boolean procurementSnapshotOk = false;
        List<Map<String, Object>> procurementRows = null;
        try {
            procurementRows = materialPurchaseMapper.selectProcurementSnapshot(orderIds);
            procurementSnapshotOk = true;
        } catch (Exception e) {
            log.warn("Failed to query procurement snapshot: orderIdsCount={}", orderIds.size(), e);
        }

        Map<String, Map<String, Object>> procurementByOrder = new HashMap<>();
        if (procurementRows != null) {
            for (Map<String, Object> row : procurementRows) {
                if (row == null || row.isEmpty()) {
                    continue;
                }
                String oid = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "orderId"));
                if (!StringUtils.hasText(oid)) {
                    continue;
                }
                procurementByOrder.put(oid.trim(), row);
            }
        }

        if (flowSnapshotOk) {
            Map<String, Map<String, Object>> flowByOrder = new HashMap<>();
            if (flowRows != null) {
                for (Map<String, Object> row : flowRows) {
                    if (row == null || row.isEmpty()) {
                        continue;
                    }
                    String oid = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "orderId"));
                    if (!StringUtils.hasText(oid)) {
                        continue;
                    }
                    flowByOrder.put(oid.trim(), row);
                }
            }

            for (ProductionOrder o : records) {
                if (o == null || !StringUtils.hasText(o.getId())) {
                    continue;
                }
                String oid = o.getId().trim();

                Map<String, Object> flow = flowByOrder.get(oid);
                Map<String, Object> proc = procurementByOrder.get(oid);

                LocalDateTime orderStart = o.getCreateTime();
                LocalDateTime orderEnd = orderStart;
                String orderOperator = null;
                Integer orderRate = 100;
                if (flow != null) {
                    LocalDateTime os = toLocalDateTime(ParamUtils.getIgnoreCase(flow, "orderStartTime"));
                    LocalDateTime oe = toLocalDateTime(ParamUtils.getIgnoreCase(flow, "orderEndTime"));
                    if (os != null) {
                        orderStart = os;
                        orderEnd = oe == null ? os : oe;
                        orderOperator = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "orderOperatorName"));
                    }
                }
                // 如果workflow中没有操作人或操作人是system，使用数据库的创建人
                if ((!StringUtils.hasText(orderOperator) || "system".equalsIgnoreCase(orderOperator))
                        && StringUtils.hasText(o.getCreatedByName())) {
                    orderOperator = o.getCreatedByName();
                }

                LocalDateTime procurementStart = null;
                LocalDateTime procurementEnd = null;
                String procurementOperator = null;
                Integer procurementRateFromPurchases = null;
                if (proc != null) {
                    procurementStart = toLocalDateTime(ParamUtils.getIgnoreCase(proc, "procurementStartTime"));
                    procurementEnd = toLocalDateTime(ParamUtils.getIgnoreCase(proc, "procurementEndTime"));
                    procurementOperator = ParamUtils
                            .toTrimmedString(ParamUtils.getIgnoreCase(proc, "procurementOperatorName"));
                    long purchaseQty = toLongSafe(ParamUtils.getIgnoreCase(proc, "purchaseQuantity"));
                    long arrivedQty = toLongSafe(ParamUtils.getIgnoreCase(proc, "arrivedQuantity"));
                    if (purchaseQty > 0) {
                        procurementRateFromPurchases = (int) Math.round(Math.max(0L, arrivedQty) * 100.0 / purchaseQty);
                    } else {
                        procurementRateFromPurchases = 0;
                    }
                } else if (flow != null) {
                    procurementEnd = toLocalDateTime(ParamUtils.getIgnoreCase(flow, "procurementScanEndTime"));
                    procurementOperator = ParamUtils
                            .toTrimmedString(ParamUtils.getIgnoreCase(flow, "procurementScanOperatorName"));
                }

                LocalDateTime cuttingStart = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "cuttingStartTime"));
                LocalDateTime cuttingEnd = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "cuttingEndTime"));
                String cuttingOperator = flow == null ? null
                        : ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "cuttingOperatorName"));
                int cuttingQty = flow == null ? 0
                        : ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(flow, "cuttingQuantity"));

                LocalDateTime sewingStart = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "sewingStartTime"));
                LocalDateTime sewingEnd = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "sewingEndTime"));
                String sewingOperator = flow == null ? null
                        : ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "sewingOperatorName"));

                // 车缝环节（新增）
                LocalDateTime carSewingStart = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "carSewingStartTime"));
                LocalDateTime carSewingEnd = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "carSewingEndTime"));
                String carSewingOperator = flow == null ? null
                        : ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "carSewingOperatorName"));

                // 大烫环节（新增）
                LocalDateTime ironingStart = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "ironingStartTime"));
                LocalDateTime ironingEnd = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "ironingEndTime"));
                String ironingOperator = flow == null ? null
                        : ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "ironingOperatorName"));

                // 二次工艺环节（新增）
                LocalDateTime secondaryProcessStart = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "secondaryProcessStartTime"));
                LocalDateTime secondaryProcessEnd = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "secondaryProcessEndTime"));
                String secondaryProcessOperator = flow == null ? null
                        : ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "secondaryProcessOperatorName"));

                // 包装环节（新增）
                LocalDateTime packagingStart = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "packagingStartTime"));
                LocalDateTime packagingEnd = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "packagingEndTime"));
                String packagingOperator = flow == null ? null
                        : ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "packagingOperatorName"));
                int carSewingQty = flow == null ? 0
                        : ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(flow, "carSewingQuantity"));
                int ironingQty = flow == null ? 0
                        : ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(flow, "ironingQuantity"));
                int secondaryProcessQty = flow == null ? 0
                        : ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(flow, "secondaryProcessQuantity"));
                int packagingQty = flow == null ? 0
                        : ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(flow, "packagingQuantity"));

                // 用 process_tracking 实际扫码量覆盖（取两者最大值，避免视图条件遗漏）
                Map<String, Integer> trackingByProcess = trackingQtyMap.getOrDefault(oid, new HashMap<>());
                if (!trackingByProcess.isEmpty()) {
                    carSewingQty = resolveTrackingQty(trackingByProcess, carSewingQty, "车缝", "carsewing", "car_sewing", "carSewing");
                    ironingQty = resolveTrackingQty(trackingByProcess, ironingQty, "尾部", "大烫", "整烫", "剪线", "尾工", "ironing", "tailprocess", "tail_process");
                    secondaryProcessQty = resolveTrackingQty(trackingByProcess, secondaryProcessQty, "二次工艺", "secondary", "secondaryprocess", "secondary_process");
                    packagingQty = resolveTrackingQty(trackingByProcess, packagingQty, "包装", "packaging");
                }

                LocalDateTime qualityStart = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "qualityStartTime"));
                LocalDateTime qualityEnd = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "qualityEndTime"));
                String qualityOperator = flow == null ? null
                        : ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "qualityOperatorName"));
                int qualityQty = flow == null ? 0
                        : ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(flow, "qualityQuantity"));
                if (!trackingByProcess.isEmpty()) {
                    qualityQty = resolveTrackingQty(trackingByProcess, qualityQty, "质检", "检验", "品检", "验货", "quality");
                }

                LocalDateTime wareStart = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "warehousingStartTime"));
                LocalDateTime wareEnd = flow == null ? null
                        : toLocalDateTime(ParamUtils.getIgnoreCase(flow, "warehousingEndTime"));
                String wareOperator = flow == null ? null
                        : ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(flow, "warehousingOperatorName"));
                int wareQty = flow == null ? 0
                        : ParamUtils.toIntSafe(ParamUtils.getIgnoreCase(flow, "warehousingQuantity"));

                o.setOrderStartTime(orderStart);
                o.setOrderEndTime(orderEnd);
                o.setOrderOperatorName(orderOperator);
                o.setOrderCompletionRate(orderRate);

                // 采购完成率：优先使用物料到货率
                Integer procurementRate;
                if (o.getMaterialArrivalRate() != null) {
                    procurementRate = scanRecordDomainService.clampPercent(o.getMaterialArrivalRate());
                } else if (procurementRateFromPurchases != null) {
                    procurementRate = scanRecordDomainService.clampPercent(procurementRateFromPurchases);
                } else {
                    procurementRate = 0;
                }
                o.setProcurementCompletionRate(procurementRate);

                // 检查是否人工确认完成
                Integer manuallyCompleted = o.getProcurementManuallyCompleted();
                boolean isManuallyConfirmed = (manuallyCompleted != null && manuallyCompleted == 1);

                // 采购时间显示逻辑：
                // 1. 物料到货率>0%：显示采购开始时间
                // 2. 物料到货率=100% 或 (物料到货率≥50%且已人工确认)：显示采购完成时间
                if (procurementRate != null && procurementRate > 0) {
                    o.setProcurementStartTime(procurementStart);

                    boolean showCompleted = false;
                    if (procurementRate >= 100) {
                        showCompleted = true;
                    } else if (procurementRate >= 50 && isManuallyConfirmed) {
                        showCompleted = true;
                        // 人工确认时，使用确认时间和确认人
                        if (o.getProcurementConfirmedAt() != null) {
                            procurementEnd = o.getProcurementConfirmedAt();
                        }
                        if (o.getProcurementConfirmedByName() != null) {
                            procurementOperator = o.getProcurementConfirmedByName();
                        }
                    }

                    if (showCompleted) {
                        o.setProcurementEndTime(procurementEnd);
                        o.setProcurementOperatorName(procurementOperator);
                    } else {
                        o.setProcurementEndTime(null);
                        o.setProcurementOperatorName(null);
                    }
                } else {
                    o.setProcurementStartTime(null);
                    o.setProcurementEndTime(null);
                    o.setProcurementOperatorName(null);
                }

                o.setCuttingStartTime(cuttingStart);
                o.setCuttingEndTime(cuttingEnd);
                o.setCuttingOperatorName(cuttingOperator);
                int cuttingQtyForRate = o.getCuttingQuantity() == null ? cuttingQty : o.getCuttingQuantity();
                int orderQtyForRate = o.getOrderQuantity() == null ? 0 : o.getOrderQuantity();
                int baseQtyForRate = cuttingQtyForRate > 0 ? cuttingQtyForRate : orderQtyForRate;
                Integer cuttingRate = baseQtyForRate <= 0 ? 0
                        : scanRecordDomainService.clampPercent(
                                (int) Math.round(Math.max(0, cuttingQtyForRate) * 100.0 / baseQtyForRate));
                o.setCuttingCompletionRate(cuttingRate);

                o.setSewingStartTime(sewingStart);
                o.setSewingEndTime(sewingEnd);
                o.setSewingOperatorName(sewingOperator);
                int wareQtyForRate = o.getWarehousingQualifiedQuantity() == null ? wareQty
                        : o.getWarehousingQualifiedQuantity();
                Integer sewingRate = (cuttingQtyForRate <= 0) ? 0
                        : scanRecordDomainService.clampPercent(
                                (int) Math.round(Math.max(0, wareQtyForRate) * 100.0 / Math.max(1, cuttingQtyForRate)));
                o.setSewingCompletionRate(sewingRate);

                // 设置车缝环节（新增）
                o.setCarSewingStartTime(carSewingStart);
                o.setCarSewingEndTime(carSewingEnd);
                o.setCarSewingOperatorName(carSewingOperator);
                Integer carSewingRate = baseQtyForRate <= 0 ? 0
                        : scanRecordDomainService.clampPercent(
                                (int) Math.round(Math.max(0, carSewingQty) * 100.0 / baseQtyForRate));
                o.setCarSewingCompletionRate(carSewingRate);

                // 设置大烫环节（新增）
                o.setIroningStartTime(ironingStart);
                o.setIroningEndTime(ironingEnd);
                o.setIroningOperatorName(ironingOperator);
                Integer ironingRate = baseQtyForRate <= 0 ? 0
                        : scanRecordDomainService.clampPercent(
                                (int) Math.round(Math.max(0, ironingQty) * 100.0 / baseQtyForRate));
                o.setIroningCompletionRate(ironingRate);

                // 设置二次工艺环节（新增）
                o.setSecondaryProcessStartTime(secondaryProcessStart);
                o.setSecondaryProcessEndTime(secondaryProcessEnd);
                o.setSecondaryProcessOperatorName(secondaryProcessOperator);
                Integer secondaryProcessRate = baseQtyForRate <= 0 ? 0
                        : scanRecordDomainService.clampPercent(
                                (int) Math.round(Math.max(0, secondaryProcessQty) * 100.0 / baseQtyForRate));
                o.setSecondaryProcessCompletionRate(secondaryProcessRate);
                o.setSecondaryProcessRate(secondaryProcessRate); // 前端 alias

                // 设置包装环节（新增）
                o.setPackagingStartTime(packagingStart);
                o.setPackagingEndTime(packagingEnd);
                o.setPackagingOperatorName(packagingOperator);
                Integer packagingRate = baseQtyForRate <= 0 ? 0
                        : scanRecordDomainService.clampPercent(
                                (int) Math.round(Math.max(0, packagingQty) * 100.0 / baseQtyForRate));
                o.setPackagingCompletionRate(packagingRate);

                // 尾部工序：使用包装完成率作为近似（剪线等尾部工序与包装阶段对齐）
                o.setTailProcessRate(packagingRate);

                o.setQualityStartTime(qualityStart);
                o.setQualityEndTime(qualityEnd);
                o.setQualityOperatorName(qualityOperator);
                Integer qualityRate = baseQtyForRate <= 0 ? 0
                        : scanRecordDomainService
                                .clampPercent((int) Math.round(qualityQty * 100.0 / baseQtyForRate));
                o.setQualityCompletionRate(qualityRate);

                o.setWarehousingStartTime(wareStart);
                o.setWarehousingEndTime(wareEnd);
                o.setWarehousingOperatorName(wareOperator);
                wareQtyForRate = o.getWarehousingQualifiedQuantity() == null ? wareQty
                        : o.getWarehousingQualifiedQuantity();
                Integer wareRate = baseQtyForRate <= 0 ? 0
                        : scanRecordDomainService.clampPercent(
                                (int) Math.round(Math.max(0, wareQtyForRate) * 100.0 / baseQtyForRate));
                o.setWarehousingCompletionRate(wareRate);
            }
            return;
        }

        List<ScanRecord> scans;
        try {
            scans = scanRecordMapper.selectList(new LambdaQueryWrapper<ScanRecord>()
                    .select(ScanRecord::getOrderId, ScanRecord::getScanType, ScanRecord::getProgressStage,
                            ScanRecord::getProcessName, ScanRecord::getProcessCode, ScanRecord::getQuantity,
                            ScanRecord::getScanTime, ScanRecord::getOperatorName, ScanRecord::getCreateTime)
                    .in(ScanRecord::getOrderId, orderIds)
                    .in(ScanRecord::getScanType,
                            java.util.Arrays.asList("production", "cutting", "quality", "warehouse"))
                    .eq(ScanRecord::getScanResult, "success")
                    .orderByAsc(ScanRecord::getScanTime)
                    .orderByAsc(ScanRecord::getCreateTime));
        } catch (Exception e) {
            log.warn("Failed to query scan records for flow stage fields: orderIdsCount={}",
                    orderIds == null ? 0 : orderIds.size(),
                    e);
            scans = new ArrayList<>();
        }

        Map<String, List<ScanRecord>> byOrder = new HashMap<>();
        if (scans != null) {
            for (ScanRecord r : scans) {
                if (r == null || !StringUtils.hasText(r.getOrderId())) {
                    continue;
                }
                String oid = r.getOrderId().trim();
                byOrder.computeIfAbsent(oid, k -> new ArrayList<>()).add(r);
            }
        }

        Map<String, List<MaterialPurchase>> purchasesByOrder = new HashMap<>();
        if (!procurementSnapshotOk) {
            try {
                List<MaterialPurchase> purchases = materialPurchaseMapper
                        .selectList(new LambdaQueryWrapper<MaterialPurchase>()
                                .in(MaterialPurchase::getOrderId, orderIds)
                                .eq(MaterialPurchase::getDeleteFlag, 0)
                                .orderByAsc(MaterialPurchase::getReceivedTime)
                                .orderByAsc(MaterialPurchase::getUpdateTime));
                if (purchases != null) {
                    for (MaterialPurchase p : purchases) {
                        if (p == null || !StringUtils.hasText(p.getOrderId())) {
                            continue;
                        }
                        purchasesByOrder.computeIfAbsent(p.getOrderId().trim(), k -> new ArrayList<>()).add(p);
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to query purchases for flow stage fields: orderIdsCount={}", orderIds.size(), e);
            }
        }

        for (ProductionOrder o : records) {
            if (o == null || !StringUtils.hasText(o.getId())) {
                continue;
            }
            String oid = o.getId().trim();
            List<ScanRecord> list = byOrder.getOrDefault(oid, new ArrayList<>());

            LocalDateTime orderStart = o.getCreateTime();
            LocalDateTime orderEnd = orderStart;
            String orderOperator = null;
            Integer orderRate = 100;

            LocalDateTime procurementStart = null, procurementEnd = null;
            String procurementOperator = null;
            int procurementStageQty = 0;
            Integer procurementRateFromPurchases = null;

            LocalDateTime cuttingStart = null, cuttingEnd = null;
            String cuttingOperator = null;
            int cuttingQty = 0;

            LocalDateTime sewingStart = null, sewingEnd = null;
            String sewingOperator = null;

            LocalDateTime carSewingStart = null, carSewingEnd = null;
            String carSewingOperator = null;
            int carSewingQty = 0;

            // 尾部（合并：大烫/整烫/剪线/质检/包装等，凡模板中 progressStage=尾部 的子工序均归此桶）
            LocalDateTime tailStart = null, tailEnd = null;
            String tailOperator = null;
            int tailQty = 0;

            LocalDateTime secondaryProcessStart = null, secondaryProcessEnd = null;
            String secondaryProcessOperator = null;
            int secondaryProcessQty = 0;

            LocalDateTime qualityStart = null, qualityEnd = null;
            String qualityOperator = null;
            int qualityQty = 0;

            LocalDateTime wareStart = null, wareEnd = null;
            String wareOperator = null;
            int wareQty = 0;

            for (ScanRecord r : list) {
                String st = r.getScanType() == null ? "" : r.getScanType().trim();
                String pn = r.getProgressStage() == null ? "" : r.getProgressStage().trim();
                if (!StringUtils.hasText(pn)) {
                    pn = r.getProcessName() == null ? "" : r.getProcessName().trim();
                }
                String pc = r.getProcessCode() == null ? "" : r.getProcessCode().trim();
                int q = r.getQuantity() == null ? 0 : r.getQuantity();
                LocalDateTime t = r.getScanTime();
                String op = r.getOperatorName();

                if ("production".equals(st)
                        && templateLibraryService.progressStageNameMatches(
                                ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED,
                                pn)) {
                    orderStart = t;
                    orderEnd = t;
                    orderOperator = op;
                    orderRate = 100;
                } else if ("production".equals(st)
                        && templateLibraryService.progressStageNameMatches(
                                ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT,
                                pn)) {
                    procurementEnd = t;
                    procurementOperator = op;
                    procurementStageQty = Math.max(procurementStageQty, Math.max(0, q));
                } else if ("quality".equals(st)
                        || "quality_warehousing".equals(pc)
                        || ("production".equals(st) && templateLibraryService.isProgressQualityStageName(pn))) {
                    if (qualityStart == null) {
                        qualityStart = t;
                    }
                    qualityEnd = t;
                    qualityOperator = op;
                    qualityQty += Math.max(0, q);
                } else if ("warehouse".equals(st) && !"warehouse_rollback".equals(pc)) {
                    if (wareStart == null) {
                        wareStart = t;
                    }
                    wareEnd = t;
                    wareOperator = op;
                    wareQty += Math.max(0, q);
                } else if ("cutting".equals(st)) {
                    if (cuttingStart == null) {
                        cuttingStart = t;
                    }
                    cuttingEnd = t;
                    cuttingOperator = op;
                    cuttingQty += Math.max(0, q);
                } else if ("production".equals(st)
                        && ("carSewing".equals(pn) || "car_sewing".equals(pn) || "车缝".equals(pn))) {
                    // ★ 父进度节点「车缝」：包含所有 progressStage=车缝 的子工序（上领/埋夹/做领等）
                    if (carSewingStart == null) {
                        carSewingStart = t;
                    }
                    carSewingEnd = t;
                    carSewingOperator = op;
                    carSewingQty += Math.max(0, q);
                } else if ("production".equals(st)
                        && ("尾部".equals(pn) || "tailProcess".equals(pn) || "tail_process".equals(pn)
                            || "packaging".equals(pn) || "ironing".equals(pn)
                            || pn.contains("尾部") || pn.contains("尾工")
                            || pn.contains("包装") || pn.contains("大烫")
                            || pn.contains("整烫") || pn.contains("剪线"))) {
                    // ★ 父进度节点「尾部」：包含所有 progressStage=尾部 的子工序（大烫/整烫/质检/剪线/包装等）
                    if (tailStart == null) {
                        tailStart = t;
                    }
                    tailEnd = t;
                    tailOperator = op;
                    tailQty += Math.max(0, q);
                } else if ("production".equals(st)
                        && ("secondaryProcess".equals(pn) || "secondary_process".equals(pn)
                            || "二次工艺".equals(pn) || pn.contains("二次"))) {
                    // ★ 父进度节点「二次工艺」：包含所有 progressStage=二次工艺 的子工序（绣花/印花等）
                    if (secondaryProcessStart == null) {
                        secondaryProcessStart = t;
                    }
                    secondaryProcessEnd = t;
                    secondaryProcessOperator = op;
                    secondaryProcessQty += Math.max(0, q);
                } else if ("production".equals(st)
                        && !isBaseStageName(pn)
                        && !"quality_warehousing".equals(pc)
                        && !templateLibraryService.isProgressQualityStageName(pn)
                        && !"车缝".equals(pn) && !"carSewing".equals(pn) && !"car_sewing".equals(pn)
                        && !"二次工艺".equals(pn) && !"secondaryProcess".equals(pn) && !"secondary_process".equals(pn)
                        && !"尾部".equals(pn) && !"tailProcess".equals(pn) && !"tail_process".equals(pn)
                        && !"packaging".equals(pn) && !"ironing".equals(pn)) {
                    // 兜底：未归类的生产扫码记录（sewing fallback）
                    if (sewingStart == null) {
                        sewingStart = t;
                    }
                    sewingEnd = t;
                    sewingOperator = op;
                }
            }

            if (procurementSnapshotOk) {
                Map<String, Object> proc = procurementByOrder.get(oid);
                if (proc != null) {
                    procurementStart = toLocalDateTime(ParamUtils.getIgnoreCase(proc, "procurementStartTime"));
                    procurementEnd = toLocalDateTime(ParamUtils.getIgnoreCase(proc, "procurementEndTime"));
                    procurementOperator = ParamUtils
                            .toTrimmedString(ParamUtils.getIgnoreCase(proc, "procurementOperatorName"));
                    long purchaseQty = toLongSafe(ParamUtils.getIgnoreCase(proc, "purchaseQuantity"));
                    long arrivedQty = toLongSafe(ParamUtils.getIgnoreCase(proc, "arrivedQuantity"));
                    if (purchaseQty > 0) {
                        procurementRateFromPurchases = (int) Math
                                .round(Math.max(0L, arrivedQty) * 100.0 / purchaseQty);
                    } else {
                        procurementRateFromPurchases = 0;
                    }
                }
            } else {
                try {
                    List<MaterialPurchase> purchases = purchasesByOrder.getOrDefault(oid, new ArrayList<>());
                    if (!purchases.isEmpty()) {
                        MaterialPurchaseService.ArrivalStats purchaseStats = materialPurchaseService
                                .computeArrivalStats(purchases);
                        procurementRateFromPurchases = purchaseStats == null ? 0 : purchaseStats.getArrivalRate();

                        for (MaterialPurchase p : purchases) {
                            if (p == null) {
                                continue;
                            }
                            String status = p.getStatus() == null ? "" : p.getStatus().trim();
                            if ("pending".equalsIgnoreCase(status) || "cancelled".equalsIgnoreCase(status)) {
                                continue;
                            }

                            LocalDateTime s = p.getCreateTime();
                            if (s != null && (procurementStart == null || s.isBefore(procurementStart))) {
                                procurementStart = s;
                            }

                            LocalDateTime t = p.getReceivedTime() == null ? p.getUpdateTime() : p.getReceivedTime();
                            if (t != null && (procurementEnd == null || t.isAfter(procurementEnd))) {
                                procurementEnd = t;
                                procurementOperator = p.getReceiverName();
                            }
                        }
                    }
                } catch (Exception e) {
                    log.warn("Failed to compute procurement summary from purchases: orderId={}", oid, e);
                }
            }

            o.setOrderStartTime(orderStart);
            o.setOrderEndTime(orderEnd);
            // 如果没有操作人或操作人是system，使用数据库的创建人
            String finalOrderOperator = orderOperator;
            if ((!StringUtils.hasText(finalOrderOperator) || "system".equalsIgnoreCase(finalOrderOperator))
                    && StringUtils.hasText(o.getCreatedByName())) {
                finalOrderOperator = o.getCreatedByName();
            }
            o.setOrderOperatorName(finalOrderOperator);
            o.setOrderCompletionRate(orderRate);

            // 采购完成率：优先使用物料到货率
            Integer procurementRate;
            if (o.getMaterialArrivalRate() != null) {
                procurementRate = scanRecordDomainService.clampPercent(o.getMaterialArrivalRate());
            } else if (procurementRateFromPurchases != null) {
                procurementRate = scanRecordDomainService.clampPercent(procurementRateFromPurchases);
            } else {
                procurementRate = 0;
            }
            o.setProcurementCompletionRate(procurementRate);

            // 检查是否人工确认完成
            Integer manuallyCompleted = o.getProcurementManuallyCompleted();
            boolean isManuallyConfirmed = (manuallyCompleted != null && manuallyCompleted == 1);

            // 采购时间显示逻辑：
            // 1. 物料到货率>0%：显示采购开始时间
            // 2. 物料到货率=100% 或 (物料到货率≥50%且已人工确认)：显示采购完成时间
            if (procurementRate != null && procurementRate > 0) {
                o.setProcurementStartTime(procurementStart);

                boolean showCompleted = false;
                if (procurementRate >= 100) {
                    showCompleted = true;
                } else if (procurementRate >= 50 && isManuallyConfirmed) {
                    showCompleted = true;
                    // 人工确认时，使用确认时间和确认人
                    if (o.getProcurementConfirmedAt() != null) {
                        procurementEnd = o.getProcurementConfirmedAt();
                    }
                    if (o.getProcurementConfirmedByName() != null) {
                        procurementOperator = o.getProcurementConfirmedByName();
                    }
                }

                if (showCompleted) {
                    o.setProcurementEndTime(procurementEnd);
                    o.setProcurementOperatorName(procurementOperator);
                } else {
                    o.setProcurementEndTime(null);
                    o.setProcurementOperatorName(null);
                }
            } else {
                o.setProcurementStartTime(null);
                o.setProcurementEndTime(null);
                o.setProcurementOperatorName(null);
            }

            o.setCuttingStartTime(cuttingStart);
            o.setCuttingEndTime(cuttingEnd);
            o.setCuttingOperatorName(cuttingOperator);
            int cuttingQtyForRate = o.getCuttingQuantity() == null ? cuttingQty : o.getCuttingQuantity();
            Integer cuttingRate = (o.getOrderQuantity() == null || o.getOrderQuantity() <= 0) ? 0
                    : scanRecordDomainService.clampPercent(
                            (int) Math.round(Math.max(0, cuttingQtyForRate) * 100.0 / o.getOrderQuantity()));
            o.setCuttingCompletionRate(cuttingRate);

            o.setSewingStartTime(sewingStart);
            o.setSewingEndTime(sewingEnd);
            o.setSewingOperatorName(sewingOperator);
            int wareQtyForRate = o.getWarehousingQualifiedQuantity() == null ? wareQty
                    : o.getWarehousingQualifiedQuantity();
            Integer sewingRate = (cuttingQtyForRate <= 0) ? 0
                    : scanRecordDomainService.clampPercent(
                            (int) Math.round(Math.max(0, wareQtyForRate) * 100.0 / Math.max(1, cuttingQtyForRate)));
            o.setSewingCompletionRate(sewingRate);

            // 设置车缝环节（新增 - 兜底分支）
            o.setCarSewingStartTime(carSewingStart);
            o.setCarSewingEndTime(carSewingEnd);
            o.setCarSewingOperatorName(carSewingOperator);
            Integer carSewingRate = (o.getOrderQuantity() == null || o.getOrderQuantity() <= 0) ? 0
                    : scanRecordDomainService.clampPercent(
                            (int) Math.round(Math.max(0, carSewingQty) * 100.0 / o.getOrderQuantity()));
            o.setCarSewingCompletionRate(carSewingRate);

            // 设置大烫环节 → 实际写入「尾部」聚合数据（向前兼容 ironing 字段名）
            o.setIroningStartTime(tailStart);
            o.setIroningEndTime(tailEnd);
            o.setIroningOperatorName(tailOperator);
            Integer tailRate = (o.getOrderQuantity() == null || o.getOrderQuantity() <= 0) ? 0
                    : scanRecordDomainService.clampPercent(
                            (int) Math.round(Math.max(0, tailQty) * 100.0 / o.getOrderQuantity()));
            o.setIroningCompletionRate(tailRate);

            // 设置二次工艺环节（新增 - 兜底分支）
            o.setSecondaryProcessStartTime(secondaryProcessStart);
            o.setSecondaryProcessEndTime(secondaryProcessEnd);
            o.setSecondaryProcessOperatorName(secondaryProcessOperator);
            Integer secondaryProcessRate = (o.getOrderQuantity() == null || o.getOrderQuantity() <= 0) ? 0
                    : scanRecordDomainService.clampPercent(
                            (int) Math.round(Math.max(0, secondaryProcessQty) * 100.0 / o.getOrderQuantity()));
            o.setSecondaryProcessCompletionRate(secondaryProcessRate);
            o.setSecondaryProcessRate(secondaryProcessRate); // 前端 alias

            // 设置包装环节 → 实际写入「尾部」聚合数据（向前兼容 packaging 字段名）
            o.setPackagingStartTime(tailStart);
            o.setPackagingEndTime(tailEnd);
            o.setPackagingOperatorName(tailOperator);
            o.setPackagingCompletionRate(tailRate);
            o.setTailProcessRate(tailRate);  // 前端 tailProcessRate 别名

            o.setQualityStartTime(qualityStart);
            o.setQualityEndTime(qualityEnd);
            o.setQualityOperatorName(qualityOperator);
            Integer qualityRate = (o.getOrderQuantity() == null || o.getOrderQuantity() <= 0) ? 0
                    : scanRecordDomainService.clampPercent((int) Math.round(qualityQty * 100.0 / o.getOrderQuantity()));
            o.setQualityCompletionRate(qualityRate);

            o.setWarehousingStartTime(wareStart);
            o.setWarehousingEndTime(wareEnd);
            o.setWarehousingOperatorName(wareOperator);
            wareQtyForRate = o.getWarehousingQualifiedQuantity() == null ? wareQty
                    : o.getWarehousingQualifiedQuantity();
            Integer wareRate = (o.getOrderQuantity() == null || o.getOrderQuantity() <= 0) ? 0
                    : scanRecordDomainService.clampPercent(
                            (int) Math.round(Math.max(0, wareQtyForRate) * 100.0 / o.getOrderQuantity()));
            o.setWarehousingCompletionRate(wareRate);
        }
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
        if (records == null || records.isEmpty()) {
            return;
        }

        List<String> orderIds = records.stream()
                .filter(o -> o != null && StringUtils.hasText(o.getId()))
                .map(o -> o.getId().trim())
                .distinct()
                .collect(Collectors.toList());

        // ── 采购时间：一次批量查询 ────────────────────────────────────────
        Map<String, Map<String, Object>> procByOrder = new HashMap<>();
        if (!orderIds.isEmpty()) {
            try {
                List<Map<String, Object>> rows = materialPurchaseMapper.selectProcurementSnapshot(orderIds);
                if (rows != null) {
                    for (Map<String, Object> row : rows) {
                        String oid = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(row, "orderId"));
                        if (StringUtils.hasText(oid)) {
                            procByOrder.put(oid.trim(), row);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("[fillCompletionRatesLight] procurement snapshot query failed", e);
            }
        }

        for (ProductionOrder o : records) {
            if (o == null) {
                continue;
            }

            // ── 采购完成率 ──────────────────────────────────────────────
            int procRate = (o.getMaterialArrivalRate() != null)
                    ? scanRecordDomainService.clampPercent(o.getMaterialArrivalRate())
                    : 0;
            o.setProcurementCompletionRate(procRate);

            // ── 采购时间字段 ────────────────────────────────────────────
            String oid = o.getId() == null ? "" : o.getId().trim();
            Map<String, Object> procRow = procByOrder.get(oid);
            if (procRow != null) {
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

            // ── 裁剪时间字段（直接读 CuttingTask，零额外查询）────────────
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

            // ── 基础数量 ────────────────────────────────────────────────
            int orderQty    = o.getOrderQuantity() == null ? 0 : o.getOrderQuantity();
            int cuttingQty  = o.getCuttingQuantity() == null ? 0 : o.getCuttingQuantity();
            int wareQty     = o.getWarehousingQualifiedQuantity() == null ? 0 : o.getWarehousingQualifiedQuantity();
            // 裁剪完成率分母：裁剪量 > 0 时以裁剪量为基准，否则以订单量
            int baseQty = cuttingQty > 0 ? cuttingQty : orderQty;

            // ── 裁剪完成率 ──────────────────────────────────────────────
            int cuttingRate = baseQty <= 0 ? 0
                    : scanRecordDomainService.clampPercent(
                            (int) Math.round((double) cuttingQty * 100 / baseQty));
            o.setCuttingCompletionRate(cuttingRate);

            // ── 成衣各工序完成率（用入库量 / 裁剪或订单量近似）────────────
            int sewBase = baseQty > 0 ? baseQty : 1;
            int sewRate = wareQty <= 0 ? 0
                    : scanRecordDomainService.clampPercent(
                            (int) Math.round((double) wareQty * 100 / sewBase));

            o.setSewingCompletionRate(sewRate);
            o.setCarSewingCompletionRate(sewRate);
            o.setIroningCompletionRate(sewRate);
            o.setSecondaryProcessCompletionRate(sewRate);
            o.setSecondaryProcessRate(sewRate);   // 前端 secondaryProcessRate 别名
            o.setTailProcessRate(sewRate);         // 前端 tailProcessRate（剪线等尾部工序）
            o.setPackagingCompletionRate(sewRate);
            o.setQualityCompletionRate(sewRate);
            o.setWarehousingCompletionRate(sewRate);
        }
    }

    /**
     * 从 process_tracking 按工序名关键字汇总已扫数量。
     * 有 tracking 数据时直接用 tracking（撤回后准确减少），无 tracking 数据才 fallback 到视图值。
     */
    private int resolveTrackingQty(Map<String, Integer> trackingByProcess, int viewQty, String... keywords) {
        int trackingTotal = 0;
        boolean hit = false;
        for (Map.Entry<String, Integer> entry : trackingByProcess.entrySet()) {
            String pname = entry.getKey() == null ? "" : entry.getKey().toLowerCase();
            for (String kw : keywords) {
                if (pname.contains(kw.toLowerCase())) {
                    trackingTotal += entry.getValue();
                    hit = true;
                    break;
                }
            }
        }
        // hit=true 说明 tracking 有此工序数据（撤回后正确减少），直接使用
        // hit=false 说明 tracking 没有此工序记录（如尚未初始化），fallback 到视图值
        return hit ? trackingTotal : viewQty;
    }
}
