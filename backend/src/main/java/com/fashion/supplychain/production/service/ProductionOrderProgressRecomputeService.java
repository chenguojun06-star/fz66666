package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.ProcessSynonymMapping;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
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
import org.springframework.scheduling.annotation.Async;
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

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProcessParentMappingService processParentMappingService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Async
    public void recomputeProgressAsync(String orderId) {
        try {
            recomputeProgressFromRecords(orderId);
        } catch (Exception e) {
            log.error("Async recompute progress failed: orderId={}", orderId, e);
            try {
                ProductionOrder order = productionOrderMapper.selectById(orderId);
                if (order != null) {
                    scanRecordDomainService.insertOrchestrationFailure(
                            order,
                            "recomputeProgressAsync",
                            "Async recompute failed: " + e.getMessage(),
                            LocalDateTime.now());
                }
            } catch (Exception ex) {
                log.error("Failed to record orchestration failure", ex);
            }
        }
    }

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

    public ProductionOrder recomputeProgressFromRecords(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) return null;

        ProductionOrder order = productionOrderMapper.selectById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) return null;

        try { ensureBaseStageRecordsIfAbsent(order); } catch (Exception e) { log.warn("Failed to ensure base stage scan records: orderId={}", oid, e); }

        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) return null;

        int actualCuttingQty = queryActualCuttingQty(oid);
        ScanAggregationResult agg = aggregateScanRecords(oid);
        boolean procurementStarted = materialPurchaseService.existsActivePurchaseForOrder(oid);

        LinkedHashMap<String, Long> doneByProcess = mergeDoneByProcess(agg.prodDoneByProcess, agg.qualityDoneByProcess);
        int packagingDone = scanRecordDomainService.computePackagingDoneQuantityFromDoneByProcess(agg.prodDoneByProcess);

        ProgressWeights weights = loadProgressWeights(order, doneByProcess, procurementStarted, orderQty);
        int newProgress = computeWeightedProgress(weights.processOrder, weights.weights, orderQty, actualCuttingQty, agg.prodDoneByProcess, agg.qualityDoneByProcess);

        int coreStageProgress = computeCoreStageProgress(orderQty, actualCuttingQty, agg.prodDoneByProcess, agg.qualityDoneByProcess, procurementStarted);
        if (coreStageProgress > newProgress) { log.info("核心阶段进度({})覆盖加权进度({}): orderId={}", coreStageProgress, newProgress, oid); newProgress = coreStageProgress; }

        newProgress = adjustWithManualProgress(oid, order, newProgress);
        int lastDoneQty = resolveCompletedQuantity(oid, order, orderQty, packagingDone);

        if (!agg.realProductionStarted) newProgress = 0;

        String newStatus = resolveNewStatus(order, procurementStarted, agg.realProductionStarted, agg.stageStarted, newProgress);
        if ("completed".equals(newStatus)) { newProgress = 100; int cur = order.getCompletedQuantity() == null ? 0 : order.getCompletedQuantity(); if (cur > 0) lastDoneQty = cur; }

        return persistProgressUpdate(oid, lastDoneQty, newProgress, newStatus);
    }

    private int queryActualCuttingQty(String oid) {
        int actualCuttingQty = 0;
        try {
            List<CuttingBundle> bundles = cuttingBundleService.list(
                    new LambdaQueryWrapper<CuttingBundle>().select(CuttingBundle::getQuantity).eq(CuttingBundle::getProductionOrderId, oid));
            if (bundles != null) { for (CuttingBundle b : bundles) { actualCuttingQty += b.getQuantity() == null ? 0 : b.getQuantity(); } }
        } catch (Exception e) { log.warn("Failed to get actual cutting quantity: orderId={}", oid, e); }
        return actualCuttingQty;
    }

    private static class ScanAggregationResult {
        LinkedHashMap<String, Long> prodDoneByProcess = new LinkedHashMap<>();
        LinkedHashMap<String, Long> qualityDoneByProcess = new LinkedHashMap<>();
        boolean realProductionStarted = false;
        boolean stageStarted = false;
    }

    private ScanAggregationResult aggregateScanRecords(String oid) {
        ScanAggregationResult result = new ScanAggregationResult();
        LinkedHashMap<String, java.util.Map<String, Integer>> prodByStageBundle = new LinkedHashMap<>();
        LinkedHashMap<String, java.util.Map<String, Integer>> qualityByStageBundle = new LinkedHashMap<>();

        List<ScanRecord> records = scanRecordMapper.selectList(new LambdaQueryWrapper<ScanRecord>()
                .eq(ScanRecord::getOrderId, oid)
                .in(ScanRecord::getScanType, java.util.Arrays.asList("production", "cutting", "quality", "warehouse"))
                .eq(ScanRecord::getScanResult, "success"));

        if (records != null) {
            for (ScanRecord r : records) {
                if (r == null) continue;
                String pn = r.getProgressStage() == null ? "" : r.getProgressStage().trim();
                if (!StringUtils.hasText(pn)) pn = r.getProcessName() == null ? "" : r.getProcessName().trim();
                if (!StringUtils.hasText(pn)) continue;
                String st = r.getScanType() == null ? "" : r.getScanType().trim();
                int q = r.getQuantity() == null ? 0 : r.getQuantity();
                if (q <= 0) continue;
                String bid = r.getCuttingBundleId() == null ? null : r.getCuttingBundleId().trim();
                if ("quality".equals(st)) {
                    if (StringUtils.hasText(bid)) { java.util.Map<String, Integer> byBundle = qualityByStageBundle.computeIfAbsent(pn, k -> new LinkedHashMap<>()); byBundle.put(bid, Math.max(byBundle.getOrDefault(bid, 0), q)); }
                    else { result.qualityDoneByProcess.put(pn, result.qualityDoneByProcess.getOrDefault(pn, 0L) + q); }
                } else {
                    if (StringUtils.hasText(bid)) { java.util.Map<String, Integer> byBundle = prodByStageBundle.computeIfAbsent(pn, k -> new LinkedHashMap<>()); byBundle.put(bid, Math.max(byBundle.getOrDefault(bid, 0), q)); }
                    else { result.prodDoneByProcess.put(pn, result.prodDoneByProcess.getOrDefault(pn, 0L) + q); }
                    if (!result.stageStarted && isBaseStageName(pn)) result.stageStarted = true;
                    if (!result.realProductionStarted && !isBaseStageName(pn)) result.realProductionStarted = true;
                }
            }
        }

        mergeBundleAggregations(prodByStageBundle, result.prodDoneByProcess);
        mergeBundleAggregations(qualityByStageBundle, result.qualityDoneByProcess);
        return result;
    }

    private void mergeBundleAggregations(LinkedHashMap<String, java.util.Map<String, Integer>> byStageBundle, LinkedHashMap<String, Long> target) {
        for (Map.Entry<String, java.util.Map<String, Integer>> e : byStageBundle.entrySet()) {
            if (e == null || !StringUtils.hasText(e.getKey())) continue;
            long sum = 0L;
            if (e.getValue() != null) { for (Integer v : e.getValue().values()) { if (v != null && v > 0) sum += v; } }
            if (sum > 0) target.put(e.getKey(), target.getOrDefault(e.getKey(), 0L) + sum);
        }
    }

    private LinkedHashMap<String, Long> mergeDoneByProcess(LinkedHashMap<String, Long> prod, LinkedHashMap<String, Long> quality) {
        LinkedHashMap<String, Long> doneByProcess = new LinkedHashMap<>();
        for (Map.Entry<String, Long> e : prod.entrySet()) { if (e != null && StringUtils.hasText(e.getKey()) && (e.getValue() != null && e.getValue() > 0)) doneByProcess.put(e.getKey(), e.getValue()); }
        for (Map.Entry<String, Long> e : quality.entrySet()) {
            if (e == null || !StringUtils.hasText(e.getKey()) || e.getValue() == null || e.getValue() <= 0) continue;
            Long existed = doneByProcess.get(e.getKey());
            doneByProcess.put(e.getKey(), existed == null ? e.getValue() : Math.max(existed, e.getValue()));
        }
        return doneByProcess;
    }

    private static class ProgressWeights {
        Map<String, BigDecimal> weights = new LinkedHashMap<>();
        List<String> processOrder = new ArrayList<>();
    }

    private ProgressWeights loadProgressWeights(ProductionOrder order, LinkedHashMap<String, Long> doneByProcess, boolean procurementStarted, int orderQty) {
        ProgressWeights pw = new ProgressWeights();
        try { templateLibraryService.loadProgressWeights(order.getStyleNo(), pw.weights, pw.processOrder); } catch (Exception e) { log.warn("Failed to load progress weights: orderId={}", order.getId(), e); }

        int productionCount = 0;
        for (String n : pw.processOrder) { if (StringUtils.hasText(n) && !isBaseStageName(n.trim())) productionCount++; }

        if (productionCount <= 0) {
            List<String> derived = new ArrayList<>();
            for (String k : doneByProcess.keySet()) { String pn = StringUtils.hasText(k) ? k.trim() : null; if (StringUtils.hasText(pn) && !isBaseStageName(pn)) derived.add(pn); }
            pw.weights.clear(); pw.processOrder.clear();
            pw.processOrder.add(ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED);
            pw.processOrder.add(ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT);
            pw.weights.put(ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED, new BigDecimal("5"));
            pw.weights.put(ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT, new BigDecimal("15"));
            doneByProcess.putIfAbsent(ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED, (long) orderQty);
            if (procurementStarted) doneByProcess.putIfAbsent(ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT, (long) orderQty);
            if (!derived.isEmpty()) { pw.processOrder.addAll(derived); BigDecimal per = new BigDecimal("80").divide(BigDecimal.valueOf(derived.size()), 6, RoundingMode.HALF_UP); for (String pn : derived) pw.weights.put(pn, per); }
        }
        return pw;
    }

    private int computeWeightedProgress(List<String> processOrder, Map<String, BigDecimal> weights, int orderQty, int actualCuttingQty, LinkedHashMap<String, Long> prodDoneByProcess, LinkedHashMap<String, Long> qualityDoneByProcess) {
        BigDecimal progressAcc = BigDecimal.ZERO;
        for (String pnRaw : processOrder) {
            String pn = StringUtils.hasText(pnRaw) ? pnRaw.trim() : null;
            if (!StringUtils.hasText(pn)) continue;
            BigDecimal w = weights.get(pn);
            if (w == null) continue;
            int baseQty = (actualCuttingQty > 0 && templateLibraryService.progressStageNameMatches("裁剪", pn)) ? actualCuttingQty : orderQty;
            List<Long> childDone = collectChildDone(pn, prodDoneByProcess, baseQty);
            List<Long> qualityChildDone = templateLibraryService.isProgressQualityStageName(pn) ? collectChildDone(pn, qualityDoneByProcess, baseQty) : java.util.Collections.emptyList();
            BigDecimal ratio = computeStageRatio(childDone, qualityChildDone, baseQty);
            progressAcc = progressAcc.add(w.multiply(ratio));
        }
        return scanRecordDomainService.clampPercent(progressAcc.setScale(0, RoundingMode.HALF_UP).intValue());
    }

    private List<Long> collectChildDone(String pn, LinkedHashMap<String, Long> doneByProcess, int baseQty) {
        List<Long> result = new ArrayList<>();
        for (Map.Entry<String, Long> e : doneByProcess.entrySet()) {
            if (e == null || !templateLibraryService.progressStageNameMatches(pn, e.getKey())) continue;
            long v = e.getValue() == null ? 0L : e.getValue();
            if (v > 0) result.add(v);
        }
        return result;
    }

    private BigDecimal computeStageRatio(List<Long> childDone, List<Long> qualityChildDone, int baseQty) {
        if (baseQty <= 0) return BigDecimal.ZERO;
        BigDecimal ratio = BigDecimal.ZERO;
        if (!childDone.isEmpty()) {
            if (childDone.size() == 1) { ratio = BigDecimal.valueOf(Math.min(childDone.get(0), baseQty)).divide(BigDecimal.valueOf(baseQty), 6, RoundingMode.HALF_UP); }
            else { BigDecimal minRatio = BigDecimal.ONE; for (Long d : childDone) { BigDecimal r = BigDecimal.valueOf(Math.min(d, baseQty)).divide(BigDecimal.valueOf(baseQty), 6, RoundingMode.HALF_UP); if (r.compareTo(minRatio) < 0) minRatio = r; } ratio = minRatio; }
            if (!qualityChildDone.isEmpty()) { BigDecimal qRatio = childDone.size() == 1 ? BigDecimal.valueOf(Math.min(qualityChildDone.get(0), baseQty)).divide(BigDecimal.valueOf(baseQty), 6, RoundingMode.HALF_UP) : computeMinRatio(qualityChildDone, baseQty); ratio = ratio.max(qRatio); }
        }
        return ratio.compareTo(BigDecimal.ONE) > 0 ? BigDecimal.ONE : ratio;
    }

    private BigDecimal computeMinRatio(List<Long> doneList, int baseQty) {
        BigDecimal minRatio = BigDecimal.ONE;
        for (Long d : doneList) { BigDecimal r = BigDecimal.valueOf(Math.min(d, baseQty)).divide(BigDecimal.valueOf(baseQty), 6, RoundingMode.HALF_UP); if (r.compareTo(minRatio) < 0) minRatio = r; }
        return minRatio;
    }

    private int adjustWithManualProgress(String oid, ProductionOrder order, int newProgress) {
        try {
            ScanRecord manual = scanRecordMapper.selectOne(new LambdaQueryWrapper<ScanRecord>()
                    .select(ScanRecord::getRequestId, ScanRecord::getProgressStage, ScanRecord::getProcessName)
                    .eq(ScanRecord::getOrderId, oid).eq(ScanRecord::getScanType, "production")
                    .eq(ScanRecord::getScanResult, "success").eq(ScanRecord::getQuantity, 0)
                    .and(w -> w.like(ScanRecord::getRequestId, "ORDER_ADVANCE:%").or().like(ScanRecord::getRequestId, "ORDER_ROLLBACK:%"))
                    .orderByDesc(ScanRecord::getScanTime).orderByDesc(ScanRecord::getCreateTime).last("limit 1"));
            if (manual != null && StringUtils.hasText(manual.getRequestId())) {
                List<String> nodes = scanRecordDomainService.resolveProgressNodes(order.getStyleNo());
                if (nodes != null && !nodes.isEmpty()) {
                    String target = StringUtils.hasText(manual.getProgressStage()) ? manual.getProgressStage().trim() : (StringUtils.hasText(manual.getProcessName()) ? manual.getProcessName().trim() : null);
                    if (StringUtils.hasText(target)) {
                        for (int i = 0; i < nodes.size(); i++) { if (templateLibraryService.progressStageNameMatches(nodes.get(i), target)) { int pct = nodes.size() <= 1 ? 0 : scanRecordDomainService.clampPercent((int) Math.round(i * 100.0 / (nodes.size() - 1))); String rid = manual.getRequestId().trim(); if (rid.startsWith("ORDER_ADVANCE:")) newProgress = Math.max(newProgress, pct); if (rid.startsWith("ORDER_ROLLBACK:")) newProgress = Math.min(newProgress, pct); break; } }
                    }
                }
            }
        } catch (Exception e) { log.warn("Failed to adjust progress with manual records: orderId={}", oid, e); }
        return newProgress;
    }

    private int resolveCompletedQuantity(String oid, ProductionOrder order, int orderQty, int packagingDone) {
        int lastDoneQty = packagingDone;
        if (lastDoneQty <= 0) { int cur = order.getCompletedQuantity() == null ? 0 : order.getCompletedQuantity(); if (cur > 0) lastDoneQty = cur; }
        if (lastDoneQty <= 0) { try { int wq = productWarehousingService.sumQualifiedByOrderId(oid); if (wq > 0) lastDoneQty = wq; } catch (Exception e) { log.warn("[ProgressRecompute] 获取入库合格数量失败: orderId={}", oid, e); } }
        return Math.max(0, Math.min(lastDoneQty, orderQty));
    }

    private String resolveNewStatus(ProductionOrder order, boolean procurementStarted, boolean realProductionStarted, boolean stageStarted, int newProgress) {
        String curStatus = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("completed".equals(curStatus) || "scrapped".equals(curStatus) || "cancelled".equals(curStatus) || "archived".equals(curStatus) || "closed".equals(curStatus)) return curStatus;
        if (procurementStarted || realProductionStarted || stageStarted) return "production";
        return newProgress <= 0 ? "pending" : "production";
    }

    private ProductionOrder persistProgressUpdate(String oid, int lastDoneQty, int newProgress, String newStatus) {
        LocalDateTime now = LocalDateTime.now();
        int maxRetries = 3;
        int updated = 0;
        for (int attempt = 0; attempt < maxRetries; attempt++) {
            ProductionOrder latestOrder = productionOrderMapper.selectById(oid);
            if (latestOrder == null) return null;
            latestOrder.setCompletedQuantity(lastDoneQty);
            latestOrder.setProductionProgress(newProgress);
            latestOrder.setStatus(newStatus);
            latestOrder.setUpdateTime(now);
            updated = productionOrderMapper.updateById(latestOrder);
            if (updated > 0) break;
            log.warn("乐观锁冲突，重试进度更新: orderId={}, attempt={}/{}", oid, attempt + 1, maxRetries);
        }
        if (updated <= 0) { log.error("进度更新失败（乐观锁冲突耗尽重试次数）: orderId={}", oid); return null; }
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

        // 【下单人修复】必须使用订单存储的创建人，而非回落到 UserContext
        // ProductionDataConsistencyJob 通过 AsyncConfig.contextCopyingDecorator 把
        // "SYSTEM_TASK:进度一致性检查" 注入到异步线程的 UserContext，若此处传 "system"，
        // resolveOperatorName 会把 "system" 视为保留词并继续读 UserContext，
        // 导致 t_scan_record.operator_name 被污染为系统任务标识，进而通过视图
        // v_production_order_flow_stage_snapshot 把 order_operator_name 传给前端"下单人"列。
        String creatorId   = order.getCreatedById()   != null ? String.valueOf(order.getCreatedById()) : null;
        String creatorName = StringUtils.hasText(order.getCreatedByName()) ? order.getCreatedByName().trim() : null;
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
                creatorId,
                creatorName);

        int r = order.getMaterialArrivalRate() == null ? 0 : order.getMaterialArrivalRate();
        r = scanRecordDomainService.clampPercent(r);
        int qty = (int) Math.round(orderQty * (r / 100.0));
        if (qty < 0) {
            qty = 0;
        }
        if (qty > orderQty) {
            qty = orderQty;
        }
        if (qty > 0) {
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

    private static final String[] CORE_PRODUCTION_STAGES = {"采购", "裁剪", "二次工艺", "车缝", "尾部", "入库"};

    private String resolveToCoreStage(String processName) {
        if (!StringUtils.hasText(processName)) {
            return null;
        }
        String pn = processName.trim();
        for (String core : CORE_PRODUCTION_STAGES) {
            if (core.equals(pn)) {
                return core;
            }
        }
        if (ProcessSynonymMapping.isEquivalent("采购", pn)) {
            return "采购";
        }
        if (ProcessSynonymMapping.isEquivalent("裁剪", pn)) {
            return "裁剪";
        }
        if (ProcessSynonymMapping.isEquivalent("二次工艺", pn)) {
            return "二次工艺";
        }
        if (ProcessSynonymMapping.isEquivalent("车缝", pn)) {
            return "车缝";
        }
        if (ProcessSynonymMapping.isEquivalent("尾部", pn)) {
            return "尾部";
        }
        if (ProcessSynonymMapping.isEquivalent("入库", pn)) {
            return "入库";
        }
        String mapped = processParentMappingService.resolveParentNode(pn);
        if (StringUtils.hasText(mapped)) {
            return mapped;
        }
        return null;
    }

    private int computeCoreStageProgress(int orderQty, int actualCuttingQty,
            LinkedHashMap<String, Long> prodDoneByProcess,
            LinkedHashMap<String, Long> qualityDoneByProcess,
            boolean procurementStarted) {
        if (orderQty <= 0) {
            return 0;
        }

        LinkedHashMap<String, Long> coreDone = new LinkedHashMap<>();
        for (Map.Entry<String, Long> e : prodDoneByProcess.entrySet()) {
            if (e == null || !StringUtils.hasText(e.getKey())) {
                continue;
            }
            String core = resolveToCoreStage(e.getKey());
            if (core != null) {
                long v = e.getValue() == null ? 0L : e.getValue();
                coreDone.merge(core, v, Math::max);
            }
        }
        for (Map.Entry<String, Long> e : qualityDoneByProcess.entrySet()) {
            if (e == null || !StringUtils.hasText(e.getKey())) {
                continue;
            }
            String core = resolveToCoreStage(e.getKey());
            if (core != null) {
                long v = e.getValue() == null ? 0L : e.getValue();
                coreDone.merge(core, v, Math::max);
            }
        }

        int baseQty = actualCuttingQty > 0 ? actualCuttingQty : orderQty;

        LinkedHashMap<String, Double> stageRates = new LinkedHashMap<>();
        for (String stage : CORE_PRODUCTION_STAGES) {
            double rate = 0.0;
            if ("采购".equals(stage)) {
                rate = procurementStarted ? 1.0 : 0.0;
            } else {
                long done = coreDone.getOrDefault(stage, 0L);
                int stageBase = "裁剪".equals(stage) ? orderQty : baseQty;
                rate = stageBase > 0 ? Math.min(1.0, (double) done / stageBase) : 0.0;
            }
            stageRates.put(stage, rate);
        }

        boolean hasSecondaryProcess = stageRates.getOrDefault("二次工艺", 0.0) > 0;

        java.util.List<String> activeStages = new ArrayList<>();
        for (String stage : CORE_PRODUCTION_STAGES) {
            if ("采购".equals(stage)) {
                continue;
            }
            if ("二次工艺".equals(stage) && !hasSecondaryProcess) {
                continue;
            }
            activeStages.add(stage);
        }

        int productionCount = activeStages.size();
        if (productionCount <= 0) {
            return procurementStarted ? 20 : 5;
        }

        double perWeight = 80.0 / productionCount;
        double progress = 5.0;
        progress += 15.0 * stageRates.getOrDefault("采购", 0.0);

        for (String stage : activeStages) {
            progress += perWeight * stageRates.getOrDefault(stage, 0.0);
        }

        boolean allComplete = procurementStarted;
        for (String stage : CORE_PRODUCTION_STAGES) {
            if ("采购".equals(stage)) {
                continue;
            }
            if ("二次工艺".equals(stage) && !hasSecondaryProcess) {
                continue;
            }
            if (stageRates.getOrDefault(stage, 0.0) < 0.999) {
                allComplete = false;
                break;
            }
        }
        if (allComplete) {
            progress = 100.0;
        }

        return scanRecordDomainService.clampPercent((int) Math.round(progress));
    }
}
