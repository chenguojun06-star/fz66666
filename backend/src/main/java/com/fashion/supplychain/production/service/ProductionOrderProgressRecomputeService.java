package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ProductionOrderProgressRecomputeService {
    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    public ProductionOrder recomputeProgressFromRecords(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            return null;
        }

        ProductionOrder order = productionOrderMapper.selectById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            return null;
        }

        try {
            ensureBaseStageRecordsIfAbsent(order);
        } catch (Exception e) {
            log.warn("Failed to ensure base stage scan records: orderId={}", oid, e);
        }

        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) {
            return null;
        }

        List<ScanRecord> records = scanRecordMapper.selectList(new LambdaQueryWrapper<ScanRecord>()
                .eq(ScanRecord::getOrderId, oid)
                .in(ScanRecord::getScanType, java.util.Arrays.asList("production", "cutting", "quality"))
                .eq(ScanRecord::getScanResult, "success"));

        LinkedHashMap<String, Long> prodDoneByProcess = new LinkedHashMap<>();
        LinkedHashMap<String, Long> qualityDoneByProcess = new LinkedHashMap<>();
        LinkedHashMap<String, java.util.Map<String, Integer>> prodByStageBundle = new LinkedHashMap<>();
        LinkedHashMap<String, java.util.Map<String, Integer>> qualityByStageBundle = new LinkedHashMap<>();
        boolean realProductionStarted = false;
        boolean stageStarted = false;
        if (records != null) {
            for (ScanRecord r : records) {
                if (r == null) {
                    continue;
                }
                String pn = r.getProgressStage() == null ? "" : r.getProgressStage().trim();
                if (!StringUtils.hasText(pn)) {
                    pn = r.getProcessName() == null ? "" : r.getProcessName().trim();
                }
                if (!StringUtils.hasText(pn)) {
                    continue;
                }
                String st = r.getScanType() == null ? "" : r.getScanType().trim();
                int q = r.getQuantity() == null ? 0 : r.getQuantity();
                if (q <= 0) {
                    continue;
                }
                String bid = r.getCuttingBundleId() == null ? null : r.getCuttingBundleId().trim();
                if ("quality".equals(st)) {
                    if (StringUtils.hasText(bid)) {
                        java.util.Map<String, Integer> byBundle = qualityByStageBundle
                                .computeIfAbsent(pn, k -> new LinkedHashMap<>());
                        Integer existed = byBundle.get(bid);
                        int next = existed == null ? q : Math.max(existed, q);
                        byBundle.put(bid, next);
                    } else {
                        qualityDoneByProcess.put(pn, qualityDoneByProcess.getOrDefault(pn, 0L) + q);
                    }
                } else {
                    if (StringUtils.hasText(bid)) {
                        java.util.Map<String, Integer> byBundle = prodByStageBundle
                                .computeIfAbsent(pn, k -> new LinkedHashMap<>());
                        Integer existed = byBundle.get(bid);
                        int next = existed == null ? q : Math.max(existed, q);
                        byBundle.put(bid, next);
                    } else {
                        prodDoneByProcess.put(pn, prodDoneByProcess.getOrDefault(pn, 0L) + q);
                    }
                    if (!stageStarted
                            && (ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED.equals(pn)
                                    || ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT.equals(pn))) {
                        stageStarted = true;
                    }
                    if (!realProductionStarted
                            && !ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED.equals(pn)
                            && !ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT.equals(pn)) {
                        realProductionStarted = true;
                    }
                }
            }
        }

        if (!prodByStageBundle.isEmpty()) {
            for (Map.Entry<String, java.util.Map<String, Integer>> e : prodByStageBundle.entrySet()) {
                if (e == null) {
                    continue;
                }
                String k = e.getKey();
                if (!StringUtils.hasText(k)) {
                    continue;
                }
                long sum = 0L;
                java.util.Map<String, Integer> byBundle = e.getValue();
                if (byBundle != null) {
                    for (Integer v : byBundle.values()) {
                        int q = v == null ? 0 : v;
                        if (q > 0) {
                            sum += q;
                        }
                    }
                }
                if (sum > 0) {
                    prodDoneByProcess.put(k, prodDoneByProcess.getOrDefault(k, 0L) + sum);
                }
            }
        }

        if (!qualityByStageBundle.isEmpty()) {
            for (Map.Entry<String, java.util.Map<String, Integer>> e : qualityByStageBundle.entrySet()) {
                if (e == null) {
                    continue;
                }
                String k = e.getKey();
                if (!StringUtils.hasText(k)) {
                    continue;
                }
                long sum = 0L;
                java.util.Map<String, Integer> byBundle = e.getValue();
                if (byBundle != null) {
                    for (Integer v : byBundle.values()) {
                        int q = v == null ? 0 : v;
                        if (q > 0) {
                            sum += q;
                        }
                    }
                }
                if (sum > 0) {
                    qualityDoneByProcess.put(k, qualityDoneByProcess.getOrDefault(k, 0L) + sum);
                }
            }
        }

        int packagingDone = scanRecordDomainService.computePackagingDoneQuantityFromDoneByProcess(prodDoneByProcess);

        boolean procurementStarted = materialPurchaseService.existsActivePurchaseForOrder(oid);

        LinkedHashMap<String, Long> doneByProcess = new LinkedHashMap<>();
        for (Map.Entry<String, Long> e : prodDoneByProcess.entrySet()) {
            if (e == null) {
                continue;
            }
            String k = e.getKey();
            if (!StringUtils.hasText(k)) {
                continue;
            }
            long v = e.getValue() == null ? 0L : e.getValue();
            if (v > 0) {
                doneByProcess.put(k, v);
            }
        }
        for (Map.Entry<String, Long> e : qualityDoneByProcess.entrySet()) {
            if (e == null) {
                continue;
            }
            String k = e.getKey();
            if (!StringUtils.hasText(k)) {
                continue;
            }
            long v = e.getValue() == null ? 0L : e.getValue();
            if (v <= 0) {
                continue;
            }
            Long existed = doneByProcess.get(k);
            if (existed == null) {
                doneByProcess.put(k, v);
            } else {
                doneByProcess.put(k, Math.max(existed, v));
            }
        }

        Map<String, BigDecimal> weights = new LinkedHashMap<>();
        List<String> processOrder = new ArrayList<>();
        try {
            templateLibraryService.loadProgressWeights(order.getStyleNo(), weights, processOrder);
        } catch (Exception e) {
            log.warn("Failed to load progress weights from template: orderId={}, styleNo={}", oid, order.getStyleNo(),
                    e);
        }

        int productionCount = 0;
        for (String n : processOrder) {
            if (!StringUtils.hasText(n)) {
                continue;
            }
            String pn = n.trim();
            if (!ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED.equals(pn)
                    && !ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT.equals(pn)) {
                productionCount += 1;
            }
        }

        if (productionCount <= 0) {
            List<String> derived = new ArrayList<>();
            for (String k : doneByProcess.keySet()) {
                String pn = StringUtils.hasText(k) ? k.trim() : null;
                if (!StringUtils.hasText(pn)) {
                    continue;
                }
                if (ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED.equals(pn)
                        || ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT.equals(pn)) {
                    continue;
                }
                derived.add(pn);
            }
            weights.clear();
            processOrder.clear();
            processOrder.add(ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED);
            processOrder.add(ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT);
            weights.put(ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED, new BigDecimal("5"));
            weights.put(ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT, new BigDecimal("15"));

            doneByProcess.putIfAbsent(ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED, (long) orderQty);
            if (procurementStarted) {
                doneByProcess.put(ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT, (long) orderQty);
            }

            if (!derived.isEmpty()) {
                processOrder.addAll(derived);
                BigDecimal per = new BigDecimal("80").divide(BigDecimal.valueOf(derived.size()), 6,
                        RoundingMode.HALF_UP);
                for (String pn : derived) {
                    weights.put(pn, per);
                }
            }
        }

        BigDecimal progressAcc = BigDecimal.ZERO;
        if (!weights.isEmpty()) {
            for (String pnRaw : processOrder) {
                String pn = StringUtils.hasText(pnRaw) ? pnRaw.trim() : null;
                if (!StringUtils.hasText(pn)) {
                    continue;
                }
                BigDecimal w = weights.get(pn);
                if (w == null) {
                    continue;
                }
                long prodDone = 0L;
                for (Map.Entry<String, Long> e : prodDoneByProcess.entrySet()) {
                    if (e == null) {
                        continue;
                    }
                    String k = e.getKey();
                    if (!templateLibraryService.progressStageNameMatches(pn, k)) {
                        continue;
                    }
                    long v = e.getValue() == null ? 0L : e.getValue();
                    if (v > 0) {
                        prodDone += v;
                    }
                }

                long done = prodDone;
                if (templateLibraryService.isProgressQualityStageName(pn) && !qualityDoneByProcess.isEmpty()) {
                    long qualityDone = 0L;
                    for (Map.Entry<String, Long> e : qualityDoneByProcess.entrySet()) {
                        if (e == null) {
                            continue;
                        }
                        String k = e.getKey();
                        if (!templateLibraryService.progressStageNameMatches(pn, k)) {
                            continue;
                        }
                        long v = e.getValue() == null ? 0L : e.getValue();
                        if (v > 0) {
                            qualityDone += v;
                        }
                    }
                    done = Math.max(prodDone, qualityDone);
                }
                if (done < 0) {
                    done = 0;
                }
                if (done > orderQty) {
                    done = orderQty;
                }
                BigDecimal ratio = BigDecimal.ZERO;
                if (orderQty > 0 && done > 0) {
                    ratio = BigDecimal.valueOf(done).divide(BigDecimal.valueOf(orderQty), 6, RoundingMode.HALF_UP);
                    if (ratio.compareTo(BigDecimal.ONE) > 0) {
                        ratio = BigDecimal.ONE;
                    }
                }
                progressAcc = progressAcc.add(w.multiply(ratio));
            }
        }

        int newProgress = scanRecordDomainService
                .clampPercent(progressAcc.setScale(0, RoundingMode.HALF_UP).intValue());

        try {
            ScanRecord manual = scanRecordMapper.selectOne(new LambdaQueryWrapper<ScanRecord>()
                    .select(ScanRecord::getRequestId, ScanRecord::getProgressStage, ScanRecord::getProcessName)
                    .eq(ScanRecord::getOrderId, oid)
                    .eq(ScanRecord::getScanType, "production")
                    .eq(ScanRecord::getScanResult, "success")
                    .eq(ScanRecord::getQuantity, 0)
                    .and(w -> w.like(ScanRecord::getRequestId, "ORDER_ADVANCE:%")
                            .or()
                            .like(ScanRecord::getRequestId, "ORDER_ROLLBACK:%"))
                    .orderByDesc(ScanRecord::getScanTime)
                    .orderByDesc(ScanRecord::getCreateTime)
                    .last("limit 1"));
            if (manual != null && StringUtils.hasText(manual.getRequestId())
                    && (StringUtils.hasText(manual.getProgressStage())
                            || StringUtils.hasText(manual.getProcessName()))) {
                List<String> nodes = scanRecordDomainService.resolveProgressNodes(order.getStyleNo());
                if (nodes != null && !nodes.isEmpty()) {
                    int idx = -1;
                    String target = StringUtils.hasText(manual.getProgressStage()) ? manual.getProgressStage().trim()
                            : manual.getProcessName().trim();
                    for (int i = 0; i < nodes.size(); i++) {
                        String n = nodes.get(i);
                        if (templateLibraryService.progressStageNameMatches(n, target)) {
                            idx = i;
                            break;
                        }
                    }
                    if (idx >= 0) {
                        int manualPercent;
                        if (nodes.size() <= 1) {
                            manualPercent = 0;
                        } else {
                            manualPercent = scanRecordDomainService.clampPercent(
                                    (int) Math.round(idx * 100.0 / (nodes.size() - 1)));
                        }
                        String rid = manual.getRequestId().trim();
                        if (rid.startsWith("ORDER_ADVANCE:")) {
                            newProgress = Math.max(newProgress, manualPercent);
                        }
                        if (rid.startsWith("ORDER_ROLLBACK:")) {
                            newProgress = Math.min(newProgress, manualPercent);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to adjust progress with manual records: orderId={}", oid, e);
        }

        int lastDoneQty = packagingDone;
        if (lastDoneQty < 0) {
            lastDoneQty = 0;
        }
        if (lastDoneQty > orderQty) {
            lastDoneQty = orderQty;
        }

        String curStatus = order.getStatus() == null ? "" : order.getStatus().trim();
        String newStatus;
        if ("completed".equals(curStatus)) {
            newStatus = "completed";
            newProgress = 100;
            int currentCompletedQty = order.getCompletedQuantity() == null ? 0 : order.getCompletedQuantity();
            if (currentCompletedQty > 0) {
                lastDoneQty = currentCompletedQty;
            }
        } else if (procurementStarted || realProductionStarted || stageStarted) {
            newStatus = "production";
        } else {
            newStatus = newProgress <= 0 ? "pending" : "production";
        }

        LocalDateTime now = LocalDateTime.now();
        int updated = productionOrderMapper.update(null, new LambdaUpdateWrapper<ProductionOrder>()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getCompletedQuantity, lastDoneQty)
                .set(ProductionOrder::getProductionProgress, newProgress)
                .set(ProductionOrder::getStatus, newStatus)
                .set(ProductionOrder::getUpdateTime, now));
        if (updated <= 0) {
            return null;
        }
        return productionOrderMapper.selectById(oid);
    }

    private void ensureBaseStageRecordsIfAbsent(ProductionOrder order) {
        if (order == null || !StringUtils.hasText(order.getId())) {
            return;
        }
        String oid = order.getId().trim();
        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) {
            return;
        }

        LocalDateTime createdTime = order.getCreateTime();
        if (createdTime == null) {
            createdTime = LocalDateTime.now();
        }

        scanRecordDomainService.upsertStageScanRecord(
                ProductionOrderScanRecordDomainService.REQUEST_PREFIX_ORDER_CREATED + oid,
                oid,
                order.getOrderNo(),
                order.getStyleId(),
                order.getStyleNo(),
                order.getColor(),
                order.getSize(),
                orderQty,
                ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED,
                createdTime,
                null,
                "system");

        int r = order.getMaterialArrivalRate() == null ? 0 : order.getMaterialArrivalRate();
        r = scanRecordDomainService.clampPercent(r);
        int qty = (int) Math.round(orderQty * (r / 100.0));
        if (qty < 0) {
            qty = 0;
        }
        if (qty > orderQty) {
            qty = orderQty;
        }
        scanRecordDomainService.upsertStageScanRecord(
                ProductionOrderScanRecordDomainService.REQUEST_PREFIX_PROCUREMENT + oid,
                oid,
                order.getOrderNo(),
                order.getStyleId(),
                order.getStyleNo(),
                order.getColor(),
                order.getSize(),
                qty,
                ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT,
                order.getUpdateTime() == null ? createdTime : order.getUpdateTime(),
                null,
                "system");
    }
}
