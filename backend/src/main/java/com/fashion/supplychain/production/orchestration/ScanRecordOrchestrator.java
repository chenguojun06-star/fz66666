package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
public class ScanRecordOrchestrator {

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionCleanupOrchestrator productionCleanupOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> execute(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : new HashMap<>(params);
        String operatorId = safeParams.get("operatorId") == null ? null : String.valueOf(safeParams.get("operatorId"));
        String operatorName = safeParams.get("operatorName") == null ? null
                : String.valueOf(safeParams.get("operatorName"));

        UserContext ctx = UserContext.get();
        String ctxUserId = ctx == null ? null : ctx.getUserId();
        String ctxUsername = ctx == null ? null : ctx.getUsername();
        if (hasText(ctxUserId) && hasText(ctxUsername)) {
            operatorId = ctxUserId;
            operatorName = ctxUsername;
            safeParams.put("operatorId", operatorId);
            safeParams.put("operatorName", operatorName);
        }

        String scanCode = safeParams.get("scanCode") == null ? null : String.valueOf(safeParams.get("scanCode"));
        String orderNo = safeParams.get("orderNo") == null ? null : String.valueOf(safeParams.get("orderNo"));
        String orderId = safeParams.get("orderId") == null ? null : String.valueOf(safeParams.get("orderId"));

        if (!hasText(operatorId) || !hasText(operatorName)
                || (!hasText(scanCode) && !hasText(orderNo) && !hasText(orderId))) {
            throw new IllegalArgumentException("参数错误");
        }

        String requestId = trimToNull(safeParams.get("requestId"));
        if (!hasText(requestId)) {
            requestId = UUID.randomUUID().toString().replace("-", "");
            safeParams.put("requestId", requestId);
        }
        if (requestId != null && requestId.length() > 64) {
            throw new IllegalArgumentException("requestId过长（最多64字符）");
        }

        ScanRecord existed = findByRequestId(requestId);
        if (existed != null) {
            Map<String, Object> dup = new HashMap<>();
            dup.put("message", "已扫码忽略");
            return dup;
        }

        String scanType = trimToNull(safeParams.get("scanType"));
        if (!hasText(scanType)) {
            scanType = "production";
        }
        scanType = scanType.trim().toLowerCase();
        if (scanType.length() > 20) {
            throw new IllegalArgumentException("scanType过长（最多20字符）");
        }

        if ("warehouse".equals(scanType)) {
            return executeWarehouseScan(safeParams, requestId, operatorId, operatorName);
        }

        boolean autoProcess = false;
        Integer qty = parseInt(safeParams.get("quantity"));
        if ("sewing".equals(scanType)) {
            scanType = "production";
            autoProcess = true;
            qty = 1;
        }

        return executeProductionScan(safeParams, requestId, operatorId, operatorName, scanType, qty, autoProcess);
    }

    private Map<String, Object> executeWarehouseScan(Map<String, Object> params, String requestId, String operatorId,
            String operatorName) {
        String warehouse = trimToNull(params.get("warehouse"));
        if (!hasText(warehouse)) {
            throw new IllegalArgumentException("请选择仓库");
        }

        Integer qty = parseInt(params.get("quantity"));
        if (qty == null || qty <= 0) {
            throw new IllegalArgumentException("入库数量必须大于0");
        }

        String scanCode = trimToNull(params.get("scanCode"));
        String orderId = trimToNull(params.get("orderId"));
        String orderNo = trimToNull(params.get("orderNo"));

        CuttingBundle bundle = hasText(scanCode) ? cuttingBundleService.getByQrCode(scanCode) : null;
        if (!hasText(orderId) && bundle != null && hasText(bundle.getProductionOrderId())) {
            orderId = bundle.getProductionOrderId().trim();
        }

        ProductionOrder order = resolveOrder(orderId, orderNo);
        if (order == null) {
            throw new IllegalStateException("未匹配到订单");
        }

        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("completed".equalsIgnoreCase(st)) {
            throw new IllegalStateException("订单已关单，已停止入库");
        }

        ProductWarehousing w = new ProductWarehousing();
        w.setOrderId(order.getId());
        w.setWarehouse(warehouse);
        w.setWarehousingType("scan");
        w.setCuttingBundleQrCode(scanCode);
        w.setWarehousingQuantity(qty);
        w.setQualifiedQuantity(qty);
        w.setUnqualifiedQuantity(0);
        w.setQualityStatus("qualified");
        boolean ok = productWarehousingService.saveWarehousingAndUpdateOrder(w);
        if (!ok) {
            throw new IllegalStateException("入库失败");
        }

        ScanRecord sr = new ScanRecord();
        sr.setRequestId(requestId);
        sr.setScanCode(scanCode);
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setColor(resolveColor(params, bundle, order));
        sr.setSize(resolveSize(params, bundle, order));
        sr.setQuantity(qty);
        sr.setUnitPrice(parseBigDecimal(params.get("unitPrice")));
        sr.setTotalAmount(computeTotalAmount(sr.getUnitPrice(), qty));
        sr.setProcessCode(trimToNull(params.get("processCode")));
        sr.setProgressStage("入库");
        sr.setProcessName("入库");
        sr.setOperatorId(operatorId);
        sr.setOperatorName(operatorName);
        sr.setScanTime(LocalDateTime.now());
        sr.setScanType("warehouse");
        sr.setScanResult("success");
        sr.setRemark(trimToNull(params.get("remark")));
        if (bundle != null && hasText(bundle.getId())) {
            sr.setCuttingBundleId(bundle.getId());
            sr.setCuttingBundleNo(bundle.getBundleNo());
            sr.setCuttingBundleQrCode(bundle.getQrCode());
        }

        validateScanRecordForSave(sr);

        try {
            scanRecordService.saveScanRecord(sr);
        } catch (DuplicateKeyException e) {
            log.info("Warehouse scan record duplicated ignored: orderId={}, requestId={}",
                    order == null ? null : order.getId(),
                    requestId);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("message", "入库成功");
        if (bundle != null) {
            result.put("cuttingBundle", bundle);
        }
        return result;
    }

    private Map<String, Object> executeProductionScan(Map<String, Object> params, String requestId, String operatorId,
            String operatorName, String scanType, Integer quantity, boolean autoProcess) {
        String scanCode = trimToNull(params.get("scanCode"));
        String orderId = trimToNull(params.get("orderId"));
        String orderNo = trimToNull(params.get("orderNo"));

        CuttingBundle bundle = hasText(scanCode) ? cuttingBundleService.getByQrCode(scanCode) : null;
        if (!hasText(orderId) && bundle != null && hasText(bundle.getProductionOrderId())) {
            orderId = bundle.getProductionOrderId().trim();
        }

        ProductionOrder order = resolveOrder(orderId, orderNo);
        if (order == null) {
            throw new IllegalStateException("未匹配到订单");
        }

        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("completed".equalsIgnoreCase(st)) {
            throw new IllegalStateException("订单已关单，已停止扫码");
        }

        String progressStage = trimToNull(params.get("progressStage"));
        String processName = trimToNull(params.get("processName"));

        String stageName = hasText(progressStage) ? progressStage.trim() : null;
        String pricingProcessName = hasText(processName) ? processName.trim() : null;

        if (!hasText(stageName) || autoProcess) {
            String auto = resolveAutoProcessName(order);
            if (hasText(auto)) {
                stageName = auto.trim();
            }
        }
        if (!hasText(stageName)) {
            stageName = hasText(pricingProcessName) ? pricingProcessName : null;
        }
        if (!hasText(pricingProcessName)) {
            pricingProcessName = hasText(stageName) ? stageName : null;
        }

        if (!hasText(stageName) || !hasText(pricingProcessName)) {
            throw new IllegalArgumentException("请选择或填写生产环节");
        }

        final String stageNameFinal = Objects.requireNonNull(stageName);
        final String pricingProcessNameFinal = Objects.requireNonNull(pricingProcessName);

        boolean isCutting = "cutting".equals(scanType);
        if (!isCutting && bundle != null) {
            String pn = stageNameFinal;
            if (pn.contains("裁剪") || pn.equals("裁剪")) {
                isCutting = true;
            }
        }
        String finalScanType = isCutting ? "cutting" : scanType;

        Integer qty = quantity;
        if (qty == null) {
            qty = parseInt(params.get("quantity"));
        }
        if (qty == null || qty <= 0) {
            throw new IllegalArgumentException("数量必须大于0");
        }

        ScanRecord sr = new ScanRecord();
        sr.setRequestId(requestId);
        sr.setScanCode(scanCode);
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setColor(resolveColor(params, bundle, order));
        sr.setSize(resolveSize(params, bundle, order));
        sr.setQuantity(qty);
        BigDecimal unitPrice = parseBigDecimal(params.get("unitPrice"));
        if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            BigDecimal resolved = resolveUnitPriceFromTemplate(order.getStyleNo(), pricingProcessNameFinal);
            if (resolved != null && resolved.compareTo(BigDecimal.ZERO) > 0) {
                unitPrice = resolved;
            }
        }
        sr.setUnitPrice(unitPrice);
        sr.setTotalAmount(computeTotalAmount(unitPrice, qty));
        sr.setProcessCode(trimToNull(params.get("processCode")));
        sr.setProgressStage(stageNameFinal);
        sr.setProcessName(pricingProcessNameFinal);
        sr.setOperatorId(operatorId);
        sr.setOperatorName(operatorName);
        sr.setScanTime(LocalDateTime.now());
        sr.setScanType(finalScanType);
        sr.setScanResult("success");
        sr.setRemark(trimToNull(params.get("remark")));
        if (bundle != null && hasText(bundle.getId())) {
            sr.setCuttingBundleId(bundle.getId());
            sr.setCuttingBundleNo(bundle.getBundleNo());
            sr.setCuttingBundleQrCode(bundle.getQrCode());
        }

        validateScanRecordForSave(sr);

        if (bundle != null && hasText(bundle.getId())) {
            Map<String, Object> updated = tryUpdateExistingBundleScanRecord(bundle, order, requestId, scanCode,
                    finalScanType, stageNameFinal, pricingProcessNameFinal, qty, unitPrice, operatorId, operatorName,
                    sr.getColor(), sr.getSize(), sr.getProcessCode(), sr.getRemark(), isCutting);
            if (updated != null) {
                return updated;
            }
        }

        try {
            scanRecordService.saveScanRecord(sr);
        } catch (DuplicateKeyException e) {
            Map<String, Object> updatedAfterDup = tryUpdateExistingBundleScanRecord(bundle, order, requestId, scanCode,
                    finalScanType, stageNameFinal, pricingProcessNameFinal, qty, unitPrice, operatorId, operatorName,
                    sr.getColor(), sr.getSize(), sr.getProcessCode(), sr.getRemark(), isCutting);
            if (updatedAfterDup != null) {
                return updatedAfterDup;
            }
            Map<String, Object> dup = new HashMap<>();
            dup.put("message", "已扫码忽略");
            if (bundle != null && isCutting) {
                dup.put("cuttingBundle", bundle);
            }
            return dup;
        }

        try {
            productionOrderService.recomputeProgressFromRecords(order.getId());
        } catch (Exception e) {
            log.warn("Failed to recompute progress after scan: orderId={}", order.getId(), e);
            scanRecordDomainService.insertOrchestrationFailure(
                    order,
                    "recomputeProgressFromRecords",
                    e == null ? "recomputeProgressFromRecords failed"
                            : ("recomputeProgressFromRecords failed: " + e.getMessage()),
                    LocalDateTime.now());
        }

        Map<String, Object> result = new HashMap<>();
        result.put("message", "扫码成功");
        if (bundle != null && isCutting) {
            result.put("cuttingBundle", bundle);
        }
        return result;
    }

    private Map<String, Object> tryUpdateExistingBundleScanRecord(CuttingBundle bundle, ProductionOrder order,
            String requestId, String scanCode, String scanType, String progressStage, String processName, int quantity,
            BigDecimal unitPrice, String operatorId, String operatorName, String color, String size, String processCode,
            String remark, boolean includeBundle) {
        if (bundle == null || !hasText(bundle.getId()) || order == null || !hasText(order.getId())) {
            return null;
        }

        try {
            ScanRecord existing = scanRecordService.getOne(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getCuttingBundleId, bundle.getId())
                    .eq(ScanRecord::getScanType, scanType)
                    .eq(ScanRecord::getScanResult, "success")
                    .gt(ScanRecord::getQuantity, 0)
                    .eq(ScanRecord::getProgressStage, progressStage)
                    .last("limit 1"));
            if (existing == null || !hasText(existing.getId())) {
                return null;
            }

            int existedQty = existing.getQuantity() == null ? 0 : existing.getQuantity();
            int nextQty = Math.max(existedQty, quantity);

            ScanRecord patch = new ScanRecord();
            patch.setId(existing.getId());
            patch.setScanCode(scanCode);
            patch.setOrderId(order.getId());
            patch.setOrderNo(order.getOrderNo());
            patch.setStyleId(order.getStyleId());
            patch.setStyleNo(order.getStyleNo());
            patch.setColor(color);
            patch.setSize(size);
            patch.setQuantity(nextQty);
            patch.setUnitPrice(unitPrice);
            patch.setTotalAmount(computeTotalAmount(unitPrice, nextQty));
            patch.setProcessCode(processCode);
            patch.setProgressStage(progressStage);
            patch.setProcessName(processName);
            patch.setOperatorId(operatorId);
            patch.setOperatorName(operatorName);
            patch.setScanTime(LocalDateTime.now());
            patch.setScanType(scanType);
            patch.setScanResult("success");
            patch.setRemark(remark);
            patch.setCuttingBundleId(bundle.getId());
            patch.setCuttingBundleNo(bundle.getBundleNo());
            patch.setCuttingBundleQrCode(bundle.getQrCode());
            patch.setUpdateTime(LocalDateTime.now());
            validateScanRecordForSave(patch);
            scanRecordService.updateById(patch);

            try {
                productionOrderService.recomputeProgressFromRecords(order.getId());
            } catch (Exception e) {
                log.warn("Failed to recompute progress after scan update: orderId={}", order.getId(), e);
                scanRecordDomainService.insertOrchestrationFailure(
                        order,
                        "recomputeProgressFromRecords",
                        e == null ? "recomputeProgressFromRecords failed"
                                : ("recomputeProgressFromRecords failed: " + e.getMessage()),
                        LocalDateTime.now());
            }

            Map<String, Object> result = new HashMap<>();
            result.put("message", "已扫码更新");
            if (includeBundle) {
                result.put("cuttingBundle", bundle);
            }
            return result;
        } catch (Exception e) {
            log.warn("Failed to try update existing scan record: orderId={}, requestId={}, scanCode={}",
                    order == null ? null : order.getId(),
                    requestId,
                    scanCode,
                    e);
            return null;
        }
    }

    private void validateScanRecordForSave(ScanRecord sr) {
        if (sr == null) {
            return;
        }
        ensureMaxLen("扫码内容", sr.getScanCode(), 200);
        ensureMaxLen("备注", sr.getRemark(), 255);
        ensureMaxLen("进度环节", sr.getProgressStage(), 100);
        ensureMaxLen("工序名称", sr.getProcessName(), 100);
        ensureMaxLen("工序编码", sr.getProcessCode(), 50);
        ensureMaxLen("操作员名称", sr.getOperatorName(), 50);
        ensureMaxLen("扫码类型", sr.getScanType(), 20);
        ensureMaxLen("扫码结果", sr.getScanResult(), 20);
        ensureMaxLen("裁剪扎号二维码", sr.getCuttingBundleQrCode(), 200);
        ensureMaxLen("订单号", sr.getOrderNo(), 50);
        ensureMaxLen("款号", sr.getStyleNo(), 50);
        ensureMaxLen("颜色", sr.getColor(), 50);
        ensureMaxLen("尺码", sr.getSize(), 50);
        ensureMaxLen("requestId", sr.getRequestId(), 64);
    }

    private void ensureMaxLen(String fieldName, String value, int maxLen) {
        if (!hasText(value) || maxLen <= 0) {
            return;
        }
        String v = value.trim();
        if (v.length() > maxLen) {
            throw new IllegalArgumentException(fieldName + "过长（最多" + maxLen + "字符）");
        }
    }

    private BigDecimal resolveUnitPriceFromTemplate(String styleNo, String processName) {
        String sn = hasText(styleNo) ? styleNo.trim() : null;
        String pn = hasText(processName) ? processName.trim() : null;
        if (!hasText(sn) || !hasText(pn)) {
            return null;
        }

        try {
            Map<String, BigDecimal> prices = templateLibraryService.resolveProcessUnitPrices(sn);
            if (prices == null || prices.isEmpty()) {
                return null;
            }

            BigDecimal exact = prices.get(pn);
            if (exact != null && exact.compareTo(BigDecimal.ZERO) > 0) {
                return exact;
            }

            for (Map.Entry<String, BigDecimal> e : prices.entrySet()) {
                if (e == null) {
                    continue;
                }
                String k = e.getKey();
                if (!hasText(k)) {
                    continue;
                }
                if (templateLibraryService.progressStageNameMatches(k, pn)) {
                    BigDecimal v = e.getValue();
                    return v == null ? null : v;
                }
            }
        } catch (Exception e) {
            log.warn("Failed to resolve unit price from template: styleNo={}, processName={}", sn, pn, e);
        }

        return null;
    }

    private ProductionOrder resolveOrder(String orderId, String orderNo) {
        String oid = hasText(orderId) ? orderId.trim() : null;
        if (hasText(oid)) {
            ProductionOrder o = productionOrderService.getById(oid);
            if (o == null || o.getDeleteFlag() == null || o.getDeleteFlag() != 0) {
                return null;
            }
            return o;
        }

        String on = hasText(orderNo) ? orderNo.trim() : null;
        if (!hasText(on)) {
            return null;
        }
        return productionOrderService.getOne(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getOrderNo, on)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .last("limit 1"));
    }

    private ScanRecord findByRequestId(String requestId) {
        String rid = hasText(requestId) ? requestId.trim() : null;
        if (!hasText(rid)) {
            return null;
        }
        try {
            return scanRecordService.getOne(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getRequestId, rid)
                    .last("limit 1"));
        } catch (Exception e) {
            return null;
        }
    }

    private String resolveAutoProcessName(ProductionOrder order) {
        if (order == null || !hasText(order.getId())) {
            return null;
        }

        List<String> nodes = templateLibraryService.resolveProgressNodes(order.getStyleNo());
        if (nodes == null || nodes.isEmpty()) {
            return null;
        }

        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) {
            for (String n : nodes) {
                String pn = n == null ? "" : n.trim();
                if (hasText(pn) && !"下单".equals(pn) && !"采购".equals(pn)
                        && !templateLibraryService.isProgressQualityStageName(pn)) {
                    return pn;
                }
            }
            return null;
        }

        List<ScanRecord> records;
        try {
            records = scanRecordService.list(new LambdaQueryWrapper<ScanRecord>()
                    .select(ScanRecord::getProgressStage, ScanRecord::getProcessName, ScanRecord::getQuantity,
                            ScanRecord::getScanType,
                            ScanRecord::getScanResult, ScanRecord::getProcessCode, ScanRecord::getCuttingBundleId)
                    .eq(ScanRecord::getOrderId, order.getId().trim())
                    .in(ScanRecord::getScanType, java.util.Arrays.asList("production", "cutting"))
                    .eq(ScanRecord::getScanResult, "success")
                    .gt(ScanRecord::getQuantity, 0));
        } catch (Exception e) {
            return null;
        }

        LinkedHashMap<String, java.util.Map<String, Integer>> doneByStageBundle = new LinkedHashMap<>();
        LinkedHashMap<String, Long> done = new LinkedHashMap<>();
        if (records != null) {
            for (ScanRecord r : records) {
                if (r == null) {
                    continue;
                }
                String pn = r.getProgressStage() == null ? "" : r.getProgressStage().trim();
                if (!hasText(pn)) {
                    pn = r.getProcessName() == null ? "" : r.getProcessName().trim();
                }
                if (!hasText(pn)) {
                    continue;
                }
                if ("下单".equals(pn) || "采购".equals(pn)) {
                    continue;
                }
                String pc = r.getProcessCode() == null ? "" : r.getProcessCode().trim();
                if ("quality_warehousing".equals(pc) || templateLibraryService.isProgressQualityStageName(pn)) {
                    continue;
                }
                int q = r.getQuantity() == null ? 0 : r.getQuantity();
                if (q <= 0) {
                    continue;
                }
                String bid = r.getCuttingBundleId() == null ? null : r.getCuttingBundleId().trim();
                if (hasText(bid)) {
                    java.util.Map<String, Integer> byBundle = doneByStageBundle.computeIfAbsent(pn,
                            k -> new java.util.LinkedHashMap<>());
                    Integer existed = byBundle.get(bid);
                    int next = existed == null ? q : Math.max(existed, q);
                    byBundle.put(bid, next);
                } else {
                    done.put(pn, done.getOrDefault(pn, 0L) + q);
                }
            }
        }

        if (!doneByStageBundle.isEmpty()) {
            for (java.util.Map.Entry<String, java.util.Map<String, Integer>> e : doneByStageBundle.entrySet()) {
                if (e == null) {
                    continue;
                }
                String k = e.getKey();
                if (!hasText(k)) {
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
                    done.put(k, done.getOrDefault(k, 0L) + sum);
                }
            }
        }

        String lastCandidate = null;
        for (String n : nodes) {
            String pn = n == null ? "" : n.trim();
            if (!hasText(pn)) {
                continue;
            }
            if ("下单".equals(pn) || "采购".equals(pn)) {
                continue;
            }
            if (templateLibraryService.isProgressQualityStageName(pn)) {
                continue;
            }
            lastCandidate = pn;
            long v = done.getOrDefault(pn, 0L);
            if (v < orderQty) {
                return pn;
            }
        }
        return lastCandidate;
    }

    private String resolveColor(Map<String, Object> params, CuttingBundle bundle, ProductionOrder order) {
        String v = trimToNull(params == null ? null : params.get("color"));
        if (hasText(v)) {
            return v;
        }
        String b = bundle == null ? null : trimToNull(bundle.getColor());
        if (hasText(b)) {
            return b;
        }
        return order == null ? null : trimToNull(order.getColor());
    }

    private String resolveSize(Map<String, Object> params, CuttingBundle bundle, ProductionOrder order) {
        String v = trimToNull(params == null ? null : params.get("size"));
        if (hasText(v)) {
            return v;
        }
        String b = bundle == null ? null : trimToNull(bundle.getSize());
        if (hasText(b)) {
            return b;
        }
        return order == null ? null : trimToNull(order.getSize());
    }

    private Integer parseInt(Object v) {
        if (v instanceof Number) {
            return ((Number) v).intValue();
        }
        if (v == null) {
            return null;
        }
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception e) {
            return null;
        }
    }

    private BigDecimal parseBigDecimal(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof BigDecimal) {
            return (BigDecimal) v;
        }
        if (v instanceof Number) {
            return BigDecimal.valueOf(((Number) v).doubleValue());
        }
        try {
            String s = String.valueOf(v).trim();
            if (!hasText(s)) {
                return null;
            }
            return new BigDecimal(s);
        } catch (Exception e) {
            return null;
        }
    }

    private BigDecimal computeTotalAmount(BigDecimal unitPrice, int quantity) {
        BigDecimal up = unitPrice == null ? BigDecimal.ZERO : unitPrice;
        int q = Math.max(0, quantity);
        return up.multiply(BigDecimal.valueOf(q)).setScale(2, RoundingMode.HALF_UP);
    }

    private String trimToNull(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return hasText(s) ? s : null;
    }

    public IPage<ScanRecord> list(Map<String, Object> params) {
        return scanRecordService.queryPage(params);
    }

    public IPage<ScanRecord> getByOrderId(String orderId, int page, int pageSize) {
        return scanRecordService.queryByOrderId(orderId, page, pageSize);
    }

    public IPage<ScanRecord> getByStyleNo(String styleNo, int page, int pageSize) {
        return scanRecordService.queryByStyleNo(styleNo, page, pageSize);
    }

    public IPage<ScanRecord> getHistory(int page, int pageSize) {
        Map<String, Object> params = Map.of("page", page, "pageSize", pageSize);
        return scanRecordService.queryPage(params);
    }

    public Map<String, Object> cleanup(String from) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        LocalDateTime cutoff = parseCutoffOrDefault(from);
        return productionCleanupOrchestrator.cleanupSince(cutoff);
    }

    public Map<String, Object> deleteFullLinkByOrderId(String orderId) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        String key = orderId == null ? null : orderId.trim();
        if (!hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        return productionCleanupOrchestrator.deleteFullLinkByOrderKey(key);
    }

    private LocalDateTime parseCutoffOrDefault(String from) {
        if (!hasText(from)) {
            return LocalDate.now().atTime(LocalTime.of(18, 0));
        }
        String v = from.trim();
        List<DateTimeFormatter> fmts = List.of(
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"),
                DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        for (DateTimeFormatter f : fmts) {
            try {
                return LocalDateTime.parse(v, f);
            } catch (DateTimeParseException e) {
                log.warn("Failed to parse cutoff datetime with formatter: from={}, formatter={}", v, f, e);
            }
        }
        try {
            return LocalDateTime.parse(v);
        } catch (DateTimeParseException e) {
            log.warn("Failed to parse cutoff datetime: from={}", v, e);
        }
        return LocalDate.now().atTime(LocalTime.of(18, 0));
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
