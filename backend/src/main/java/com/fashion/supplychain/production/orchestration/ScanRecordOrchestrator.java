package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.NumberUtils;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.helper.DuplicateScanPreventer;
import com.fashion.supplychain.production.helper.InventoryValidator;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.SKUService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 扫码记录编排器
 * 职责：
 * 1. 扫码业务编排（生产、质检、入库）
 * 2. 协调辅助类完成复杂逻辑
 * 3. 事务管理
 *
 * 重构记录：2026-02-03
 * - 提取 ProcessStageDetector（工序识别）
 * - 提取 DuplicateScanPreventer（防重复）
 * - 提取 InventoryValidator（库存验证）
 * - 从 1892 行优化到 ~1200 行
 *
 * @author GitHub Copilot
 */
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
    private ProductWarehousingOrchestrator productWarehousingOrchestrator;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private SKUService skuService;

    @Autowired
    private com.fashion.supplychain.style.service.StyleAttachmentService styleAttachmentService;

    // ========== 新增：辅助类注入 ==========
    @Autowired
    private DuplicateScanPreventer duplicateScanPreventer;

    @Autowired
    private InventoryValidator inventoryValidator;

    // ========== 新增：执行器注入（第2轮重构）==========
    @Autowired
    private com.fashion.supplychain.production.executor.QualityScanExecutor qualityScanExecutor;

    @Autowired
    private com.fashion.supplychain.production.executor.WarehouseScanExecutor warehouseScanExecutor;

    @Autowired
    private com.fashion.supplychain.production.executor.ProductionScanExecutor productionScanExecutor;

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
        String styleNo = safeParams.get("styleNo") == null ? null : String.valueOf(safeParams.get("styleNo"));

        boolean unitPriceOnly = isTruthy(safeParams.get("unitPriceOnly"))
                || isTruthy(safeParams.get("priceOnly"))
                || isTruthy(safeParams.get("queryPriceOnly"));

        if (unitPriceOnly) {
            if ((!hasText(scanCode) && !hasText(orderNo) && !hasText(orderId) && !hasText(styleNo))) {
                throw new IllegalArgumentException("参数错误");
            }
            return resolveUnitPrice(safeParams);
        }

        if (!hasText(operatorId) || !hasText(operatorName)
                || (!hasText(scanCode) && !hasText(orderNo) && !hasText(orderId))) {
            throw new IllegalArgumentException("参数错误");
        }

        String requestId = TextUtils.safeText(safeParams.get("requestId"));
        if (!hasText(requestId)) {
            requestId = duplicateScanPreventer.generateRequestId();
            safeParams.put("requestId", requestId);
        }
        duplicateScanPreventer.validateRequestId(requestId);

        ScanRecord existed = duplicateScanPreventer.findByRequestId(requestId);
        if (existed != null) {
            Map<String, Object> dup = new HashMap<>();
            dup.put("message", "已扫码忽略");
            return dup;
        }

        String scanType = TextUtils.safeText(safeParams.get("scanType"));
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

        if ("quality".equals(scanType)) {
            return executeQualityScan(safeParams, requestId, operatorId, operatorName);
        }

        boolean autoProcess = false;
        Integer qty = NumberUtils.toInt(safeParams.get("quantity"));
        if ("sewing".equals(scanType)) {
            scanType = "production";
            autoProcess = true;
        }

        return executeProductionScan(safeParams, requestId, operatorId, operatorName, scanType, qty, autoProcess);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> undo(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : new HashMap<>(params);
        String requestId = TextUtils.safeText(safeParams.get("requestId"));
        String scanCode = TextUtils.safeText(safeParams.get("scanCode"));
        String scanType = TextUtils.safeText(safeParams.get("scanType"));
        String progressStage = TextUtils.safeText(safeParams.get("progressStage"));
        String processCode = TextUtils.safeText(safeParams.get("processCode"));
        Integer qtyParam = NumberUtils.toInt(safeParams.get("quantity"));

        if (!hasText(requestId) && !hasText(scanCode)) {
            throw new IllegalArgumentException("参数错误");
        }

        ScanRecord target = null;
        if (hasText(requestId)) {
            target = duplicateScanPreventer.findByRequestId(requestId);
        }
        if (target == null && hasText(scanCode)) {
            UserContext ctx = UserContext.get();
            String operatorId = ctx == null ? null : ctx.getUserId();
            LambdaQueryWrapper<ScanRecord> qw = new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getScanResult, "success")
                    .eq(ScanRecord::getScanCode, scanCode)
                    .orderByDesc(ScanRecord::getScanTime)
                    .orderByDesc(ScanRecord::getCreateTime)
                    .last("limit 1");
            if (hasText(scanType)) {
                qw.eq(ScanRecord::getScanType, scanType);
            }
            if (hasText(operatorId)) {
                qw.eq(ScanRecord::getOperatorId, operatorId);
            }
            if (hasText(progressStage)) {
                qw.eq(ScanRecord::getProgressStage, progressStage);
            }
            if (hasText(processCode)) {
                qw.eq(ScanRecord::getProcessCode, processCode);
            }
            try {
                target = scanRecordService.getOne(qw);
            } catch (Exception e) {
                target = null;
            }
        }

        if (target == null) {
            String st = hasText(scanType) ? scanType.trim().toLowerCase() : "";
            if (("warehouse".equals(st) || "quality".equals(st)) && hasText(scanCode)
                    && qtyParam != null && qtyParam > 0) {
                Map<String, Object> body = new HashMap<>();
                body.put("orderId", TextUtils.safeText(safeParams.get("orderId")));
                body.put("cuttingBundleQrCode", scanCode);
                body.put("rollbackQuantity", qtyParam);
                body.put("rollbackRemark", "撤销扫码");
                boolean ok = productWarehousingOrchestrator.rollbackByBundle(body);
                Map<String, Object> resp = new HashMap<>();
                resp.put("success", ok);
                resp.put("message", "已撤销");
                return resp;
            }
            throw new IllegalStateException("未找到可撤销记录");
        }

        if (!"success".equalsIgnoreCase(target.getScanResult())) {
            throw new IllegalStateException("记录已失效");
        }

        String targetType = hasText(target.getScanType()) ? target.getScanType().trim().toLowerCase()
                : (hasText(scanType) ? scanType.trim().toLowerCase() : "");
        boolean warehousingLike = "warehouse".equals(targetType) || "quality".equals(targetType)
                || "quality_warehousing".equalsIgnoreCase(target.getProcessCode());

        if (warehousingLike) {
            String qr = hasText(target.getCuttingBundleQrCode()) ? target.getCuttingBundleQrCode()
                    : (hasText(target.getScanCode()) ? target.getScanCode() : scanCode);
            int qty = target.getQuantity() == null ? 0 : target.getQuantity();
            if (qty <= 0 && qtyParam != null) {
                qty = qtyParam;
            }
            if (!hasText(qr) || qty <= 0) {
                throw new IllegalArgumentException("撤销参数错误");
            }
            Map<String, Object> body = new HashMap<>();
            body.put("orderId", target.getOrderId());
            body.put("cuttingBundleQrCode", qr);
            body.put("rollbackQuantity", qty);
            body.put("rollbackRemark", "撤销扫码");
            boolean ok = productWarehousingOrchestrator.rollbackByBundle(body);
            Map<String, Object> resp = new HashMap<>();
            resp.put("success", ok);
            resp.put("message", "已撤销");
            return resp;
        }

        ScanRecord patch = new ScanRecord();
        patch.setId(target.getId());
        patch.setScanResult("failure");
        patch.setRemark("已撤销");
        patch.setUpdateTime(LocalDateTime.now());
        scanRecordService.updateById(patch);

        String oid = TextUtils.safeText(target.getOrderId());
        if (hasText(oid)) {
            productionOrderService.recomputeProgressAsync(oid);
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("success", true);
        resp.put("message", "已撤销");
        return resp;
    }

    /**
     * 执行质检扫码（委托给QualityScanExecutor）
     * 已迁移逻辑：领取/验收/确认/返修流程
     */
    private Map<String, Object> executeQualityScan(Map<String, Object> params, String requestId, String operatorId,
            String operatorName) {
        // 解析基础参数
        String scanCode = TextUtils.safeText(params.get("scanCode"));
        final CuttingBundle bundle = cuttingBundleService.getByQrCode(scanCode);

        String orderId = TextUtils.safeText(params.get("orderId"));
        String orderNo = TextUtils.safeText(params.get("orderNo"));
        if (!hasText(orderId) && bundle != null && hasText(bundle.getProductionOrderId())) {
            orderId = bundle.getProductionOrderId().trim();
        }

        ProductionOrder order = resolveOrder(orderId, orderNo);
        if (order == null && !hasText(orderId) && !hasText(orderNo) && hasText(scanCode)) {
            order = resolveOrder(null, scanCode);
        }
        final ProductionOrder finalOrder = order;

        // 委托给Executor执行
        return qualityScanExecutor.execute(
                params, requestId, operatorId, operatorName, finalOrder,
                (unused) -> resolveColor(params, bundle, finalOrder),
                (unused) -> resolveSize(params, bundle, finalOrder)
        );
    }

    private String parseQualityResultFromParams(Map<String, Object> params) {
        if (params == null) {
            return "qualified";
        }
        String v = TextUtils.safeText(params.get("qualityResult"));
        if (hasText(v)) {
            return v.trim();
        }
        String remark = TextUtils.safeText(params.get("remark"));
        if (!hasText(remark)) {
            return "qualified";
        }
        String s = remark.trim();
        int idx = s.indexOf("qualityResult=");
        if (idx < 0) {
            return "qualified";
        }
        String tail = s.substring(idx + "qualityResult=".length());
        int end = tail.indexOf('&');
        String raw = end >= 0 ? tail.substring(0, end) : tail;
        String out = raw == null ? null : raw.trim();
        return hasText(out) ? out : "qualified";
    }

    private String parseQualityStageFromParams(Map<String, Object> params) {
        if (params == null) {
            return "confirm";
        }
        String v = TextUtils.safeText(params.get("qualityStage"));
        if (!hasText(v)) {
            v = TextUtils.safeText(params.get("qualityAction"));
        }
        if (!hasText(v)) {
            return "confirm";
        }
        String raw = v.trim();
        String s = raw.toLowerCase();
        if ("receive".equals(s) || "received".equals(s) || "领取".equals(raw)) {
            return "receive";
        }
        if ("inspect".equals(s) || "inspection".equals(s) || "验收".equals(raw)) {
            return "inspect";
        }
        return "confirm";
    }

    private ScanRecord findQualityStageRecord(String orderId, String bundleId, String stageCode) {
        if (!hasText(orderId) || !hasText(bundleId) || !hasText(stageCode)) {
            return null;
        }
        try {
            return scanRecordService.getOne(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId)
                    .eq(ScanRecord::getCuttingBundleId, bundleId)
                    .eq(ScanRecord::getScanType, "quality")
                    .eq(ScanRecord::getScanResult, "success")
                    .eq(ScanRecord::getProcessCode, stageCode)
                    .last("limit 1"));
        } catch (Exception e) {
            return null;
        }
    }

    private int computeRemainingRepairQuantity(String orderId, String cuttingBundleId, String excludeWarehousingId) {
        String oid = hasText(orderId) ? orderId.trim() : null;
        String bid = hasText(cuttingBundleId) ? cuttingBundleId.trim() : null;
        String ex = hasText(excludeWarehousingId) ? excludeWarehousingId.trim() : null;
        if (!hasText(oid) || !hasText(bid)) {
            return 0;
        }

        List<ProductWarehousing> list;
        try {
            LambdaQueryWrapper<ProductWarehousing> qw = new LambdaQueryWrapper<ProductWarehousing>()
                    .select(ProductWarehousing::getId, ProductWarehousing::getUnqualifiedQuantity,
                            ProductWarehousing::getQualifiedQuantity, ProductWarehousing::getRepairRemark)
                    .eq(ProductWarehousing::getDeleteFlag, 0)
                    .eq(ProductWarehousing::getOrderId, oid)
                    .eq(ProductWarehousing::getCuttingBundleId, bid);
            if (hasText(ex)) {
                qw.ne(ProductWarehousing::getId, ex);
            }
            list = productWarehousingService.list(qw);
        } catch (Exception e) {
            return 0;
        }

        long repairPool = 0;
        long repairedOut = 0;
        if (list != null) {
            for (ProductWarehousing w : list) {
                if (w == null) {
                    continue;
                }
                int uq = w.getUnqualifiedQuantity() == null ? 0 : w.getUnqualifiedQuantity();
                if (uq > 0) {
                    repairPool += uq;
                }
                String rr = TextUtils.safeText(w.getRepairRemark());
                if (rr != null) {
                    int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
                    if (q > 0) {
                        repairedOut += q;
                    }
                }
            }
        }

        long remaining = repairPool - repairedOut;
        if (remaining <= 0) {
            return 0;
        }
        return (int) Math.min(Integer.MAX_VALUE, remaining);
    }

    /**
     * 执行仓库入库扫码（委托给WarehouseScanExecutor）
     * 已迁移逻辑：成品入库/次品阻止
     */
    private Map<String, Object> executeWarehouseScan(Map<String, Object> params, String requestId, String operatorId,
            String operatorName) {
        // 解析基础参数
        String scanCode = TextUtils.safeText(params.get("scanCode"));
        String orderId = TextUtils.safeText(params.get("orderId"));
        String orderNo = TextUtils.safeText(params.get("orderNo"));

        final CuttingBundle bundle = hasText(scanCode) ? cuttingBundleService.getByQrCode(scanCode) : null;
        if (!hasText(orderId) && bundle != null && hasText(bundle.getProductionOrderId())) {
            orderId = bundle.getProductionOrderId().trim();
        }

        ProductionOrder order = resolveOrder(orderId, orderNo);
        if (order == null && !hasText(orderId) && !hasText(orderNo) && hasText(scanCode)) {
            order = resolveOrder(null, scanCode);
        }
        final ProductionOrder finalOrder = order;

        // 委托给Executor执行
        return warehouseScanExecutor.execute(
                params, requestId, operatorId, operatorName, finalOrder,
                (unused) -> resolveColor(params, bundle, finalOrder),
                (unused) -> resolveSize(params, bundle, finalOrder)
        );
    }

    private boolean isBundleBlockedForWarehousingStatus(String rawStatus) {
        String status = rawStatus == null ? "" : rawStatus.trim();
        if (!hasText(status)) {
            return false;
        }
        String s = status.toLowerCase();
        boolean isRepaired = "repaired".equals(s) || "返修完成".equals(status) || "已返修".equals(status)
                || "返修合格".equals(status) || "已修复".equals(status);
        if (isRepaired) {
            return false;
        }
        return "unqualified".equals(s) || "不合格".equals(status) || "次品".equals(status) || "次品待返修".equals(status)
                || "待返修".equals(status);
    }

    /**
     * 执行生产扫码（委托给ProductionScanExecutor）
     * 已迁移逻辑：裁剪/车缝/大烫等生产工序
     */
    private Map<String, Object> executeProductionScan(Map<String, Object> params, String requestId, String operatorId,
            String operatorName, String scanType, Integer quantity, boolean autoProcess) {
        // 委托给Executor执行
        return productionScanExecutor.execute(
                params, requestId, operatorId, operatorName, scanType,
                quantity != null ? quantity : NumberUtils.toInt(params.get("quantity")),
                autoProcess,
                (unused) -> resolveColor(params, null, null),
                (unused) -> resolveSize(params, null, null)
        );
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

            // 检查是否是同一个操作人（领取锁定规则）
            String existingOperatorId = existing.getOperatorId() == null ? null : existing.getOperatorId().trim();
            String existingOperatorName = existing.getOperatorName() == null ? null : existing.getOperatorName().trim();
            boolean isSameOperator = false;
            if (hasText(operatorId) && hasText(existingOperatorId)) {
                isSameOperator = operatorId.equals(existingOperatorId);
            } else if (hasText(operatorName) && hasText(existingOperatorName)) {
                isSameOperator = operatorName.equals(existingOperatorName);
            }
            if (!isSameOperator) {
                String otherName = hasText(existingOperatorName) ? existingOperatorName : "他人";
                throw new IllegalStateException("该菲号「" + progressStage + "」环节已被「" + otherName + "」领取，无法重复操作");
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

            if (skuService != null) {
                skuService.attachProcessUnitPrice(patch);
            }
            validateScanRecordForSave(patch);
            scanRecordService.updateById(patch);

            productionOrderService.recomputeProgressAsync(order.getId());

            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("message", "已扫码更新");

            ScanRecord returned = new ScanRecord();
            returned.setId(existing.getId());
            returned.setScanCode(scanCode);
            returned.setRequestId(requestId);
            returned.setOrderId(order.getId());
            returned.setOrderNo(order.getOrderNo());
            returned.setStyleId(order.getStyleId());
            returned.setStyleNo(order.getStyleNo());
            returned.setColor(color);
            returned.setSize(size);
            returned.setQuantity(nextQty);
            returned.setUnitPrice(unitPrice);
            returned.setTotalAmount(computeTotalAmount(unitPrice, nextQty));
            returned.setProcessCode(processCode);
            returned.setProgressStage(progressStage);
            returned.setProcessName(processName);
            returned.setOperatorId(operatorId);
            returned.setOperatorName(operatorName);
            returned.setScanTime(LocalDateTime.now());
            returned.setScanType(scanType);
            returned.setScanResult("success");
            returned.setRemark(remark);
            returned.setCuttingBundleId(bundle.getId());
            returned.setCuttingBundleNo(bundle.getBundleNo());
            returned.setCuttingBundleQrCode(bundle.getQrCode());
            result.put("scanRecord", returned);
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
        String st = hasText(sr.getScanType()) ? sr.getScanType().trim().toLowerCase() : "";
        if (("production".equals(st) || "quality".equals(st) || "warehouse".equals(st)) && skuService != null) {
            if (!skuService.validateSKU(sr)) {
                throw new IllegalStateException("SKU信息无效");
            }
        }
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

        String[] FIXED_PRODUCTION_NODES = {"采购", "裁剪", "车缝", "大烫", "质检", "二次工艺", "包装", "入库"};

        try {
            Map<String, BigDecimal> prices = templateLibraryService.resolveProcessUnitPrices(sn);
            if (prices == null || prices.isEmpty()) {
                return null;
            }

            String normalized = normalizeFixedProductionNodeName(pn);
            if (hasText(normalized)) {
                BigDecimal exact = prices.get(normalized);
                if (exact != null && exact.compareTo(BigDecimal.ZERO) > 0) {
                    return exact;
                }
            }

            BigDecimal exact = prices.get(pn);
            if (exact != null && exact.compareTo(BigDecimal.ZERO) > 0) {
                return exact;
            }

            for (String n : FIXED_PRODUCTION_NODES) {
                if (!hasText(n)) {
                    continue;
                }
                if (templateLibraryService.progressStageNameMatches(n, pn)) {
                    BigDecimal v = prices.get(n);
                    if (v != null && v.compareTo(BigDecimal.ZERO) > 0) {
                        return v;
                    }
                }
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

    // ========== findByRequestId 已迁移到 DuplicateScanPreventer ==========

    // ========== resolveAutoProcessName 已迁移到 ProcessStageDetector ==========

    private String resolveColor(Map<String, Object> params, CuttingBundle bundle, ProductionOrder order) {
        String v = TextUtils.safeText(params == null ? null : params.get("color"));
        if (hasText(v)) {
            return v;
        }
        String b = bundle == null ? null : TextUtils.safeText(bundle.getColor());
        if (hasText(b)) {
            return b;
        }
        return order == null ? null : TextUtils.safeText(order.getColor());
    }

    private String resolveSize(Map<String, Object> params, CuttingBundle bundle, ProductionOrder order) {
        String v = TextUtils.safeText(params == null ? null : params.get("size"));
        if (hasText(v)) {
            return v;
        }
        String b = bundle == null ? null : TextUtils.safeText(bundle.getSize());
        if (hasText(b)) {
            return b;
        }
        return order == null ? null : TextUtils.safeText(order.getSize());
    }

    // 使用NumberUtils.toInt()、NumberUtils.toBigDecimal()和TextUtils.safeText()替代

    private boolean isTruthy(Object v) {
        if (v == null) {
            return false;
        }
        if (v instanceof Boolean boolean1) {
            return boolean1;
        }
        if (v instanceof Number number) {
            return number.intValue() != 0;
        }
        String s = String.valueOf(v).trim();
        if (!hasText(s)) {
            return false;
        }
        String t = s.toLowerCase();
        return "1".equals(t) || "true".equals(t) || "y".equals(t) || "yes".equals(t) || "on".equals(t);
    }

    private BigDecimal computeTotalAmount(BigDecimal unitPrice, int quantity) {
        BigDecimal up = unitPrice == null ? BigDecimal.ZERO : unitPrice;
        int q = Math.max(0, quantity);
        return up.multiply(BigDecimal.valueOf(q)).setScale(2, RoundingMode.HALF_UP);
    }

    public Map<String, Object> resolveUnitPrice(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : new HashMap<>(params);

        String scanCode = TextUtils.safeText(safeParams.get("scanCode"));
        String orderId = TextUtils.safeText(safeParams.get("orderId"));
        String orderNo = TextUtils.safeText(safeParams.get("orderNo"));
        String styleNo = TextUtils.safeText(safeParams.get("styleNo"));

        CuttingBundle bundle = hasText(scanCode) ? cuttingBundleService.getByQrCode(scanCode) : null;
        if (!hasText(orderId) && bundle != null && hasText(bundle.getProductionOrderId())) {
            orderId = bundle.getProductionOrderId().trim();
        }

        ProductionOrder order = null;
        if (!hasText(styleNo)) {
            order = resolveOrder(orderId, orderNo);
            styleNo = order == null ? null : TextUtils.safeText(order.getStyleNo());
        }
        if (!hasText(styleNo)) {
            throw new IllegalArgumentException("未匹配到款号");
        }

        String processName = TextUtils.safeText(safeParams.get("processName"));
        if (!hasText(processName)) {
            processName = TextUtils.safeText(safeParams.get("progressStage"));
        }
        if (!hasText(processName)) {
            throw new IllegalArgumentException("缺少工序名称");
        }

        BigDecimal unitPrice = resolveUnitPriceFromTemplate(styleNo, processName);
        String unitPriceHint = null;
        if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            unitPrice = BigDecimal.ZERO;
            unitPriceHint = "未找到工序【" + processName + "】的单价配置，请在模板中心设置工序单价模板";
        }

        Map<String, Object> result = new HashMap<>();
        result.put("unitPrice", unitPrice.setScale(2, RoundingMode.HALF_UP));
        result.put("styleNo", styleNo);
        result.put("processName", processName);
        if (hasText(unitPriceHint)) {
            result.put("unitPriceHint", unitPriceHint);
        }
        if (hasText(scanCode)) {
            result.put("scanCode", scanCode);
        }
        if (bundle != null && bundle.getBundleNo() != null) {
            result.put("bundleNo", String.valueOf(bundle.getBundleNo()));
        }
        if (order != null && hasText(order.getOrderNo())) {
            result.put("orderNo", order.getOrderNo());
        }
        return result;
    }

    // ========== 已迁移到 InventoryValidator，保留委托方法以兼容 ==========
    private void validateNotExceedOrderQuantity(ProductionOrder order, String scanType, String progressStage,
            int incomingQty, CuttingBundle bundle) {
        inventoryValidator.validateNotExceedOrderQuantity(order, scanType, progressStage, incomingQty, bundle);
    }

    private long computeStageDoneQuantity(String orderId, String scanType, String progressStage) {
        String oid = hasText(orderId) ? orderId.trim() : null;
        if (!hasText(oid)) {
            return 0L;
        }
        String st = hasText(scanType) ? scanType.trim() : null;
        String pn = hasText(progressStage) ? progressStage.trim() : null;
        try {
            LambdaQueryWrapper<ScanRecord> qw = new LambdaQueryWrapper<ScanRecord>()
                    .select(ScanRecord::getQuantity)
                    .eq(ScanRecord::getOrderId, oid)
                    .eq(hasText(st), ScanRecord::getScanType, st)
                    .eq(hasText(pn), ScanRecord::getProgressStage, pn)
                    .eq(ScanRecord::getScanResult, "success")
                    .gt(ScanRecord::getQuantity, 0);
            List<ScanRecord> list = scanRecordService.list(qw);
            long sum = 0L;
            if (list != null) {
                for (ScanRecord r : list) {
                    if (r == null) {
                        continue;
                    }
                    int q = r.getQuantity() == null ? 0 : r.getQuantity();
                    if (q > 0) {
                        sum += q;
                    }
                }
            }
            return Math.max(0L, sum);
        } catch (Exception e) {
            return 0L;
        }
    }

    private int computeExistingBundleQuantity(String orderId, String scanType, String progressStage,
            CuttingBundle bundle) {
        if (bundle == null || !hasText(bundle.getId())) {
            return 0;
        }
        String oid = hasText(orderId) ? orderId.trim() : null;
        if (!hasText(oid)) {
            return 0;
        }
        String st = hasText(scanType) ? scanType.trim() : null;
        String pn = hasText(progressStage) ? progressStage.trim() : null;
        try {
            ScanRecord existing = scanRecordService.getOne(new LambdaQueryWrapper<ScanRecord>()
                    .select(ScanRecord::getQuantity)
                    .eq(ScanRecord::getOrderId, oid)
                    .eq(hasText(st), ScanRecord::getScanType, st)
                    .eq(hasText(pn), ScanRecord::getProgressStage, pn)
                    .eq(ScanRecord::getScanResult, "success")
                    .eq(ScanRecord::getCuttingBundleId, bundle.getId())
                    .gt(ScanRecord::getQuantity, 0)
                    .last("limit 1"));
            int q = existing == null || existing.getQuantity() == null ? 0 : existing.getQuantity();
            return Math.max(0, q);
        } catch (Exception e) {
            return 0;
        }
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

    public IPage<ScanRecord> getMyHistory(int page, int pageSize, String scanType, String startTime, String endTime,
            String orderNo, String bundleNo, String workerName, String operatorName) {
        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        if (!hasText(operatorId)) {
            throw new AccessDeniedException("未登录");
        }

        Map<String, Object> params = new HashMap<>();
        params.put("page", page);
        params.put("pageSize", pageSize);
        params.put("operatorId", operatorId);
        if (hasText(scanType)) {
            params.put("scanType", scanType.trim());
        }
        if (hasText(startTime)) {
            params.put("startTime", startTime.trim());
        }
        if (hasText(endTime)) {
            params.put("endTime", endTime.trim());
        }
        if (hasText(orderNo)) {
            params.put("orderNo", orderNo.trim());
        }
        if (hasText(bundleNo)) {
            params.put("bundleNo", bundleNo.trim());
        }
        String name = hasText(operatorName) ? operatorName : workerName;
        if (hasText(name)) {
            params.put("operatorName", name.trim());
        }
        return scanRecordService.queryPage(params);
    }

    /**
     * 获取我的质检待处理任务（已领取未确认结果）
     * 查询 scanType='quality' 且 processCode='quality_receive' 但没有对应的
     * 'quality_confirm' 记录
     */
    public List<ScanRecord> getMyQualityTasks() {
        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        if (!hasText(operatorId)) {
            throw new AccessDeniedException("未登录");
        }

        // 查询质检领取记录
        Map<String, Object> params = new HashMap<>();
        params.put("operatorId", operatorId);
        params.put("scanType", "quality");
        params.put("processCode", "quality_receive");
        params.put("page", 1);
        params.put("pageSize", 100);

        IPage<ScanRecord> receivedPage = scanRecordService.queryPage(params);
        List<ScanRecord> receivedRecords = receivedPage.getRecords();

        if (receivedRecords == null || receivedRecords.isEmpty()) {
            return List.of();
        }

        // 过滤出还没有确认结果的记录
        List<ScanRecord> pendingTasks = new ArrayList<>();
        for (ScanRecord received : receivedRecords) {
            // 检查是否有对应的确认记录
            String orderId = received.getOrderId();
            String bundleId = received.getCuttingBundleId();

            // 1. 检查是否已有质检确认记录
            ScanRecord confirmed = findQualityStageRecord(orderId, bundleId, "quality_confirm");
            if (confirmed != null && hasText(confirmed.getId())) {
                // 有确认记录，跳过
                continue;
            }

            // 2. 检查该菲号是否已入库（可能通过PC端入库）
            if (hasText(bundleId)) {
                long warehousingCount = productWarehousingService.count(
                        new LambdaQueryWrapper<ProductWarehousing>()
                                .eq(ProductWarehousing::getCuttingBundleId, bundleId)
                                .eq(ProductWarehousing::getDeleteFlag, 0));
                if (warehousingCount > 0) {
                    // 已入库，跳过
                    continue;
                }
            }

            // 没有确认记录且未入库，添加到待处理列表
            pendingTasks.add(received);
        }

        return pendingTasks;
    }

    public Map<String, Object> getPersonalStats(String scanType) {
        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        String operatorName = ctx == null ? null : ctx.getUsername();
        if (!hasText(operatorId)) {
            throw new AccessDeniedException("未登录");
        }

        String st = hasText(scanType) ? scanType.trim() : null;
        Map<String, Object> agg = scanRecordService.getPersonalStats(operatorId, st);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("operatorId", operatorId);
        String safeOperatorName = operatorName == null ? null : operatorName.trim();
        if (hasText(safeOperatorName)) {
            resp.put("operatorName", safeOperatorName);
        }
        resp.put("scanType", st);

        if (agg == null) {
            resp.put("scanCount", 0);
            resp.put("orderCount", 0);
            resp.put("totalQuantity", 0);
            resp.put("totalAmount", BigDecimal.ZERO);
            return resp;
        }

        resp.putAll(agg);
        return resp;
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

    /**
     * 裁剪环节检查纸样是否齐全（只记录警告，不阻止流程）
     */
    private void checkPatternForCutting(String styleId) {
        if (!hasText(styleId)) {
            return;
        }
        try {
            boolean complete = styleAttachmentService != null && styleAttachmentService.checkPatternComplete(styleId);
            if (!complete) {
                log.warn("Pattern files not complete for styleId={}, cutting scan continues with warning", styleId);
            }
        } catch (Exception e) {
            log.warn("Failed to check pattern complete for styleId={}: {}", styleId, e.getMessage());
        }
    }

    /**
     * 标准化固定生产节点名称
     */
    private String normalizeFixedProductionNodeName(String name) {
        if (!hasText(name)) {
            return null;
        }
        String n = name.trim();
        String[] FIXED_PRODUCTION_NODES = {"采购", "裁剪", "车缝", "大烫", "质检", "二次工艺", "包装", "入库"};
        for (String node : FIXED_PRODUCTION_NODES) {
            if (node.equals(n)) {
                return node;
            }
        }
        return n;
    }
}
