package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.entity.CuttingBundle;
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

        // 获取实际裁剪数量（从裁剪菲号汇总）— 仅查询 quantity 列，防止 schema 漂移导致全字段映射失败
        int actualCuttingQty = 0;
        try {
            List<CuttingBundle> bundles = cuttingBundleService.list(
                    new LambdaQueryWrapper<CuttingBundle>()
                            .select(CuttingBundle::getQuantity)
                            .eq(CuttingBundle::getProductionOrderId, oid));
            if (bundles != null && !bundles.isEmpty()) {
                for (CuttingBundle bundle : bundles) {
                    actualCuttingQty += bundle.getQuantity() == null ? 0 : bundle.getQuantity();
                }
                log.info("订单实际裁剪数量: orderId={}, actualCuttingQty={}, orderQty={}",
                        oid, actualCuttingQty, orderQty);
            }
        } catch (Exception e) {
            log.warn("Failed to get actual cutting quantity: orderId={}", oid, e);
        }

        List<ScanRecord> records = scanRecordMapper.selectList(new LambdaQueryWrapper<ScanRecord>()
                .eq(ScanRecord::getOrderId, oid)
                .in(ScanRecord::getScanType, java.util.Arrays.asList("production", "cutting", "quality", "warehouse"))
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
                    if (!stageStarted && isBaseStageName(pn)) {
                        stageStarted = true;
                    }
                    if (!realProductionStarted && !isBaseStageName(pn)) {
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
            if (!isBaseStageName(pn)) {
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
                if (isBaseStageName(pn)) {
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
                int baseQty = orderQty;
                if (actualCuttingQty > 0 && templateLibraryService.progressStageNameMatches("裁剪", pn)) {
                    baseQty = actualCuttingQty;
                }

                List<Long> childDoneQuantities = new ArrayList<>();
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
                        childDoneQuantities.add(v);
                    }
                }

                List<Long> qualityChildDoneQuantities = new ArrayList<>();
                if (templateLibraryService.isProgressQualityStageName(pn) && !qualityDoneByProcess.isEmpty()) {
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
                            qualityChildDoneQuantities.add(v);
                        }
                    }
                }

                BigDecimal ratio = BigDecimal.ZERO;
                if (baseQty > 0) {
                    if (!childDoneQuantities.isEmpty()) {
                        if (childDoneQuantities.size() == 1) {
                            long done = Math.min(childDoneQuantities.get(0), baseQty);
                            ratio = BigDecimal.valueOf(done).divide(BigDecimal.valueOf(baseQty), 6, RoundingMode.HALF_UP);
                        } else {
                            BigDecimal minChildRatio = BigDecimal.ONE;
                            for (Long childDone : childDoneQuantities) {
                                long capped = Math.min(childDone, baseQty);
                                BigDecimal childRatio = BigDecimal.valueOf(capped).divide(BigDecimal.valueOf(baseQty), 6, RoundingMode.HALF_UP);
                                if (childRatio.compareTo(minChildRatio) < 0) {
                                    minChildRatio = childRatio;
                                }
                            }
                            ratio = minChildRatio;
                        }
                        if (!qualityChildDoneQuantities.isEmpty()) {
                            BigDecimal qualityRatio;
                            if (qualityChildDoneQuantities.size() == 1) {
                                long qDone = Math.min(qualityChildDoneQuantities.get(0), baseQty);
                                qualityRatio = BigDecimal.valueOf(qDone).divide(BigDecimal.valueOf(baseQty), 6, RoundingMode.HALF_UP);
                            } else {
                                BigDecimal minQRatio = BigDecimal.ONE;
                                for (Long qDone : qualityChildDoneQuantities) {
                                    long capped = Math.min(qDone, baseQty);
                                    BigDecimal qRatio = BigDecimal.valueOf(capped).divide(BigDecimal.valueOf(baseQty), 6, RoundingMode.HALF_UP);
                                    if (qRatio.compareTo(minQRatio) < 0) {
                                        minQRatio = qRatio;
                                    }
                                }
                                qualityRatio = minQRatio;
                            }
                            ratio = ratio.max(qualityRatio);
                        }
                    }
                    if (ratio.compareTo(BigDecimal.ONE) > 0) {
                        ratio = BigDecimal.ONE;
                    }
                }
                progressAcc = progressAcc.add(w.multiply(ratio));
            }
        }

        int newProgress = scanRecordDomainService
                .clampPercent(progressAcc.setScale(0, RoundingMode.HALF_UP).intValue());

        int coreStageProgress = computeCoreStageProgress(orderQty, actualCuttingQty,
                prodDoneByProcess, qualityDoneByProcess, procurementStarted);
        if (coreStageProgress > newProgress) {
            log.info("核心阶段进度({})覆盖加权进度({}): orderId={}", coreStageProgress, newProgress, oid);
            newProgress = coreStageProgress;
        }

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

        // 用户需求：下单不计算进度，只有实际产线（车缝/裁剪/质检/入库）扫码才开始计算进度
        // 下单(STAGE_ORDER_CREATED)和采购(STAGE_PROCUREMENT)均不属于"真实产线动作"
        if (!realProductionStarted) {
            newProgress = 0;
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
        int maxRetries = 3;
        int updated = 0;
        for (int attempt = 0; attempt < maxRetries; attempt++) {
            ProductionOrder latestOrder = productionOrderMapper.selectById(oid);
            if (latestOrder == null) {
                return null;
            }
            latestOrder.setCompletedQuantity(lastDoneQty);
            latestOrder.setProductionProgress(newProgress);
            latestOrder.setStatus(newStatus);
            latestOrder.setUpdateTime(now);
            updated = productionOrderMapper.updateById(latestOrder);
            if (updated > 0) {
                break;
            }
            log.warn("乐观锁冲突，重试进度更新: orderId={}, attempt={}/{}", oid, attempt + 1, maxRetries);
        }
        if (updated <= 0) {
            log.error("进度更新失败（乐观锁冲突耗尽重试次数）: orderId={}", oid);
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
            if (templateLibraryService.progressStageNameMatches(core, pn)) {
                return core;
            }
        }
        if (pn.contains("车缝") || pn.contains("缝制") || pn.contains("缝纫") || pn.contains("车工")
                || pn.contains("上领") || pn.contains("上袖") || pn.contains("埋夹") || pn.contains("做领")
                || pn.contains("拼缝") || pn.contains("合缝") || pn.contains("缝合") || pn.contains("整件")) {
            return "车缝";
        }
        if (pn.contains("大烫") || pn.contains("整烫") || pn.contains("剪线") || pn.contains("蒸烫")
                || pn.contains("尾工") || pn.contains("包装") || pn.contains("打包") || pn.contains("后整")) {
            return "尾部";
        }
        if (pn.contains("绣花") || pn.contains("印花") || pn.contains("水洗") || pn.contains("压花")
                || pn.contains("二次") || pn.contains("特殊工艺")) {
            return "二次工艺";
        }
        if (pn.contains("裁剪") || pn.contains("裁床") || pn.contains("剪裁") || pn.contains("开裁")) {
            return "裁剪";
        }
        if (pn.contains("入库") || pn.contains("入仓") || pn.contains("进仓")) {
            return "入库";
        }
        if (pn.contains("质检") || pn.contains("品检") || pn.contains("验货") || pn.contains("检验")) {
            return "尾部";
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
