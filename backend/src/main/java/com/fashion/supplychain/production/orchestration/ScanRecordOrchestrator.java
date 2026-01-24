package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
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
import java.util.Arrays;
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

    private static final List<String> FIXED_PRODUCTION_NODES = Arrays.asList(
            "采购",
            "裁剪",
            "车缝",
            "大烫",
            "质检",
            "包装",
            "入库");

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionCleanupOrchestrator productionCleanupOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ProductWarehousingOrchestrator productWarehousingOrchestrator;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private SKUService skuService;

    @Autowired
    private com.fashion.supplychain.style.service.StyleAttachmentService styleAttachmentService;

    private boolean isAutoSkippableStageName(ProductionOrder order, String processName) {
        String pn = hasText(processName) ? processName.trim() : null;
        if (!hasText(pn)) {
            return true;
        }
        if (templateLibraryService.progressStageNameMatches(ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED,
                pn)) {
            return true;
        }
        if (templateLibraryService.progressStageNameMatches(ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT,
                pn)) {
            int r = order == null || order.getMaterialArrivalRate() == null ? 0 : order.getMaterialArrivalRate();
            if (r < 0) {
                r = 0;
            }
            if (r > 100) {
                r = 100;
            }
            return r >= 100;
        }
        return false;
    }

    private String normalizeFixedProductionNodeName(String raw) {
        String v = hasText(raw) ? raw.trim() : null;
        if (!hasText(v)) {
            return null;
        }
        for (String n : FIXED_PRODUCTION_NODES) {
            if (!hasText(n)) {
                continue;
            }
            if (n.equals(v) || templateLibraryService.progressStageNameMatches(n, v)) {
                return n;
            }
        }
        return null;
    }

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

        if ("quality".equals(scanType)) {
            return executeQualityScan(safeParams, requestId, operatorId, operatorName);
        }

        boolean autoProcess = false;
        Integer qty = parseInt(safeParams.get("quantity"));
        if ("sewing".equals(scanType)) {
            scanType = "production";
            autoProcess = true;
        }

        return executeProductionScan(safeParams, requestId, operatorId, operatorName, scanType, qty, autoProcess);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> undo(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : new HashMap<>(params);
        String requestId = trimToNull(safeParams.get("requestId"));
        String scanCode = trimToNull(safeParams.get("scanCode"));
        String scanType = trimToNull(safeParams.get("scanType"));
        String progressStage = trimToNull(safeParams.get("progressStage"));
        String processCode = trimToNull(safeParams.get("processCode"));
        Integer qtyParam = parseInt(safeParams.get("quantity"));

        if (!hasText(requestId) && !hasText(scanCode)) {
            throw new IllegalArgumentException("参数错误");
        }

        ScanRecord target = null;
        if (hasText(requestId)) {
            target = findByRequestId(requestId);
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
                body.put("orderId", trimToNull(safeParams.get("orderId")));
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

        String oid = trimToNull(target.getOrderId());
        if (hasText(oid)) {
            productionOrderService.recomputeProgressFromRecords(oid);
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("success", true);
        resp.put("message", "已撤销");
        return resp;
    }

    private Map<String, Object> executeQualityScan(Map<String, Object> params, String requestId, String operatorId,
            String operatorName) {
        Integer qty = parseInt(params.get("quantity"));
        if (qty == null || qty <= 0) {
            throw new IllegalArgumentException("数量必须大于0");
        }

        String scanCode = trimToNull(params.get("scanCode"));
        if (!hasText(scanCode)) {
            throw new IllegalArgumentException("扫码内容不能为空");
        }

        CuttingBundle bundle = cuttingBundleService.getByQrCode(scanCode);
        if (bundle == null || !hasText(bundle.getId())) {
            throw new IllegalStateException("未匹配到菲号");
        }

        String orderId = trimToNull(params.get("orderId"));
        String orderNo = trimToNull(params.get("orderNo"));
        if (!hasText(orderId) && hasText(bundle.getProductionOrderId())) {
            orderId = bundle.getProductionOrderId().trim();
        }

        ProductionOrder order = resolveOrder(orderId, orderNo);
        if (order == null && !hasText(orderId) && !hasText(orderNo) && hasText(scanCode)) {
            order = resolveOrder(null, scanCode);
            if (order != null) {
                orderNo = scanCode;
            }
        }
        if (order == null) {
            throw new IllegalStateException("未匹配到订单");
        }

        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("completed".equalsIgnoreCase(st)) {
            throw new IllegalStateException("订单已关单，已停止质检");
        }

        validateNotExceedOrderQuantity(order, "quality", "质检", qty, bundle);

        String qualityStage = parseQualityStageFromParams(params);
        if (!"confirm".equals(qualityStage)) {
            String stageCode = "receive".equals(qualityStage) ? "quality_receive" : "quality_inspect";
            String stageName = "receive".equals(qualityStage) ? "质检领取" : "质检验收";
            ScanRecord existed = findQualityStageRecord(order.getId(), bundle.getId(), stageCode);
            if (existed != null && hasText(existed.getId())) {
                // 检查是否是同一个操作人
                String existingOperatorId = existed.getOperatorId() == null ? null : existed.getOperatorId().trim();
                String existingOperatorName = existed.getOperatorName() == null ? null : existed.getOperatorName().trim();
                boolean isSameOperator = false;
                if (hasText(operatorId) && hasText(existingOperatorId)) {
                    isSameOperator = operatorId.equals(existingOperatorId);
                } else if (hasText(operatorName) && hasText(existingOperatorName)) {
                    isSameOperator = operatorName.equals(existingOperatorName);
                }
                if (!isSameOperator && "receive".equals(qualityStage)) {
                    String otherName = hasText(existingOperatorName) ? existingOperatorName : "他人";
                    throw new IllegalStateException("该菲号已被「" + otherName + "」领取，无法重复领取");
                }
                Map<String, Object> dup = new HashMap<>();
                dup.put("success", true);
                dup.put("message", "receive".equals(qualityStage) ? "已领取" : "已验收");
                dup.put("scanRecord", existed);
                Map<String, Object> orderInfo = new HashMap<>();
                orderInfo.put("orderNo", order.getOrderNo());
                orderInfo.put("styleNo", order.getStyleNo());
                dup.put("orderInfo", orderInfo);
                dup.put("cuttingBundle", bundle);
                return dup;
            }

            if ("inspect".equals(qualityStage)) {
                ScanRecord received = findQualityStageRecord(order.getId(), bundle.getId(), "quality_receive");
                if (received == null || !hasText(received.getId())) {
                    throw new IllegalStateException("请先领取再验收");
                }
                // 验收人必须是领取人
                String receivedOperatorId = received.getOperatorId() == null ? null : received.getOperatorId().trim();
                String receivedOperatorName = received.getOperatorName() == null ? null : received.getOperatorName().trim();
                boolean isSameOperator = false;
                if (hasText(operatorId) && hasText(receivedOperatorId)) {
                    isSameOperator = operatorId.equals(receivedOperatorId);
                } else if (hasText(operatorName) && hasText(receivedOperatorName)) {
                    isSameOperator = operatorName.equals(receivedOperatorName);
                }
                if (!isSameOperator) {
                    String otherName = hasText(receivedOperatorName) ? receivedOperatorName : "他人";
                    throw new IllegalStateException("该菲号已被「" + otherName + "」领取，只能由领取人验收");
                }
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
            sr.setProcessCode(stageCode);
            sr.setProgressStage("质检");
            sr.setProcessName(stageName);
            sr.setOperatorId(operatorId);
            sr.setOperatorName(operatorName);
            sr.setScanTime(LocalDateTime.now());
            sr.setScanType("quality");
            sr.setScanResult("success");
            sr.setRemark(stageName);
            sr.setCuttingBundleId(bundle.getId());
            sr.setCuttingBundleNo(bundle.getBundleNo());
            sr.setCuttingBundleQrCode(bundle.getQrCode());

            validateScanRecordForSave(sr);
            scanRecordService.saveScanRecord(sr);

            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("message", "receive".equals(qualityStage) ? "领取成功" : "验收成功");
            result.put("scanRecord", sr);
            Map<String, Object> orderInfo = new HashMap<>();
            orderInfo.put("orderNo", order.getOrderNo());
            orderInfo.put("styleNo", order.getStyleNo());
            result.put("orderInfo", orderInfo);
            result.put("cuttingBundle", bundle);
            return result;
        }

        ScanRecord receivedStage = findQualityStageRecord(order.getId(), bundle.getId(), "quality_receive");
        if (receivedStage == null || !hasText(receivedStage.getId())) {
            throw new IllegalStateException("请先领取再确认");
        }
        ScanRecord inspectedStage = findQualityStageRecord(order.getId(), bundle.getId(), "quality_inspect");
        if (inspectedStage == null || !hasText(inspectedStage.getId())) {
            throw new IllegalStateException("请先验收再确认");
        }

        String qualityResult = parseQualityResultFromParams(params);
        String repairRemark = trimToNull(params.get("repairRemark"));
        String defectCategory = trimToNull(params.get("defectCategory"));
        String defectRemark = trimToNull(params.get("defectRemark"));
        String unqualifiedImageUrls = trimToNull(params.get("unqualifiedImageUrls"));

        int availableQuantity = 0;
        boolean qtyAdjusted = false;

        boolean isUnqualified = "unqualified".equalsIgnoreCase(qualityResult);
        boolean isRepaired = "repaired".equalsIgnoreCase(qualityResult);

        boolean hasQualifiedWarehousing = false;
        boolean hasUnqualifiedWarehousing = false;
        try {
            List<ProductWarehousing> existingList = productWarehousingService.list(new LambdaQueryWrapper<ProductWarehousing>()
                    .select(ProductWarehousing::getId, ProductWarehousing::getQualityStatus,
                            ProductWarehousing::getWarehousingQuantity, ProductWarehousing::getQualifiedQuantity,
                            ProductWarehousing::getUnqualifiedQuantity)
                    .eq(ProductWarehousing::getDeleteFlag, 0)
                    .eq(ProductWarehousing::getOrderId, order.getId())
                    .eq(ProductWarehousing::getCuttingBundleId, bundle.getId())
                    .orderByDesc(ProductWarehousing::getCreateTime));
            if (existingList != null) {
                for (ProductWarehousing w : existingList) {
                    if (w == null) {
                        continue;
                    }
                    int qualifiedQty = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
                    int unqualifiedQty = w.getUnqualifiedQuantity() == null ? 0 : w.getUnqualifiedQuantity();
                    int totalQty = w.getWarehousingQuantity() == null ? (qualifiedQty + unqualifiedQty)
                            : w.getWarehousingQuantity();
                    if (totalQty <= 0) {
                        continue;
                    }
                    String qs = trimToNull(w.getQualityStatus());
                    if (!hasText(qs) || "qualified".equalsIgnoreCase(qs)) {
                        hasQualifiedWarehousing = true;
                        break;
                    }
                    if ("unqualified".equalsIgnoreCase(qs)) {
                        hasUnqualifiedWarehousing = true;
                    }
                }
            }
        } catch (Exception e) {
            hasQualifiedWarehousing = false;
            hasUnqualifiedWarehousing = false;
        }

        if (hasQualifiedWarehousing) {
            throw new IllegalStateException("该菲号已质检合格，不能重复扫码");
        }
        if (isUnqualified && hasUnqualifiedWarehousing) {
            throw new IllegalStateException("该菲号已质检记录，不能重复扫码");
        }

        if (isRepaired) {
            availableQuantity = computeRemainingRepairQuantity(order.getId(), bundle.getId(), null);
            if (availableQuantity <= 0) {
                throw new IllegalStateException("该菲号无可返修入库数量");
            }
            if (qty > availableQuantity) {
                qty = availableQuantity;
                qtyAdjusted = true;
            }
            if (!hasText(repairRemark)) {
                repairRemark = "返修完成";
            }
        }

        ProductWarehousing w = new ProductWarehousing();
        w.setOrderId(order.getId());
        w.setWarehousingType("quality_scan");
        w.setCuttingBundleQrCode(bundle.getQrCode());
        w.setWarehousingQuantity(qty);
        if (receivedStage != null) {
            w.setReceiverId(trimToNull(receivedStage.getOperatorId()));
            w.setReceiverName(trimToNull(receivedStage.getOperatorName()));
            w.setReceivedTime(receivedStage.getScanTime());
        }
        w.setInspectionStatus("inspected");
        if (isUnqualified) {
            if (!hasText(defectCategory)) {
                throw new IllegalArgumentException("请选择次品类别");
            }
            if (!hasText(defectRemark)) {
                throw new IllegalArgumentException("请选择次品处理方式");
            }
            String dr = defectRemark.trim();
            if (!("返修".equals(dr) || "报废".equals(dr))) {
                throw new IllegalArgumentException("次品处理方式只能选择：返修/报废");
            }
            w.setQualifiedQuantity(0);
            w.setUnqualifiedQuantity(qty);
            w.setDefectCategory(defectCategory);
            w.setDefectRemark(dr);
            if (hasText(unqualifiedImageUrls)) {
                w.setUnqualifiedImageUrls(unqualifiedImageUrls);
            }
        } else {
            w.setQualifiedQuantity(qty);
            w.setUnqualifiedQuantity(0);
        }
        if (hasText(repairRemark)) {
            w.setRepairRemark(repairRemark);
        }
        w.setQualityStatus(isUnqualified ? "unqualified" : "qualified");

        boolean ok = productWarehousingService.saveWarehousingAndUpdateOrder(w);
        if (!ok) {
            throw new IllegalStateException("质检失败");
        }

        ScanRecord sr = null;
        String warehousingRequestId = hasText(w.getId()) ? ("WAREHOUSING:" + w.getId().trim()) : null;
        if (hasText(warehousingRequestId)) {
            try {
                sr = scanRecordService.getOne(new LambdaQueryWrapper<ScanRecord>()
                        .eq(ScanRecord::getRequestId, warehousingRequestId)
                        .last("limit 1"));
            } catch (Exception e) {
                sr = null;
            }
        }

        Map<String, Object> orderInfo = new HashMap<>();
        orderInfo.put("orderNo", order.getOrderNo());
        orderInfo.put("styleNo", order.getStyleNo());

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("message", isUnqualified ? "次品已录入" : (isRepaired ? "返修入库成功" : "质检成功"));
        if (qtyAdjusted && availableQuantity > 0) {
            result.put("message", "该菲号只可返修入库数量为" + availableQuantity + "，本次按" + qty + "录入");
        }
        result.put("scanRecord", sr);
        result.put("orderInfo", orderInfo);
        result.put("cuttingBundle", bundle);
        if (isRepaired) {
            result.put("availableQuantity", availableQuantity);
            result.put("usedQuantity", qty);
        }
        return result;
    }

    private String parseQualityResultFromParams(Map<String, Object> params) {
        if (params == null) {
            return "qualified";
        }
        String v = trimToNull(params.get("qualityResult"));
        if (hasText(v)) {
            return v.trim();
        }
        String remark = trimToNull(params.get("remark"));
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
        String v = trimToNull(params.get("qualityStage"));
        if (!hasText(v)) {
            v = trimToNull(params.get("qualityAction"));
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
                String rr = trimToNull(w.getRepairRemark());
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
        if (bundle != null && hasText(bundle.getStatus()) && isBundleBlockedForWarehousingStatus(bundle.getStatus())) {
            throw new IllegalStateException("该菲号为次品待返修，返修完成后才可入库");
        }
        if (!hasText(orderId) && bundle != null && hasText(bundle.getProductionOrderId())) {
            orderId = bundle.getProductionOrderId().trim();
        }

        ProductionOrder order = resolveOrder(orderId, orderNo);
        if (order == null && !hasText(orderId) && !hasText(orderNo) && hasText(scanCode)) {
            order = resolveOrder(null, scanCode);
            if (order != null) {
                orderNo = scanCode;
            }
        }
        if (order == null) {
            throw new IllegalStateException("未匹配到订单");
        }

        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("completed".equalsIgnoreCase(st)) {
            throw new IllegalStateException("订单已关单，已停止入库");
        }

        validateNotExceedOrderQuantity(order, "warehouse", "入库", qty, bundle);

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

        try {
            productionOrderService.recomputeProgressFromRecords(order.getId());
        } catch (Exception e) {
            log.warn("Failed to recompute progress after warehouse scan: orderId={}",
                    order == null ? null : order.getId(),
                    e);
            scanRecordDomainService.insertOrchestrationFailure(
                    order,
                    "recomputeProgressFromRecords",
                    e == null ? "recomputeProgressFromRecords failed"
                            : ("recomputeProgressFromRecords failed: " + e.getMessage()),
                    LocalDateTime.now());
        }

        Map<String, Object> result = new HashMap<>();
        result.put("message", "入库成功");
        if (bundle != null) {
            result.put("cuttingBundle", bundle);
        }
        return result;
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
        if (order == null && !hasText(orderId) && !hasText(orderNo) && hasText(scanCode)) {
            order = resolveOrder(null, scanCode);
            if (order != null) {
                orderNo = scanCode;
            }
        }
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

        String stageNameNormalized = normalizeFixedProductionNodeName(stageName);
        String pricingProcessNameNormalized = normalizeFixedProductionNodeName(pricingProcessName);
        if (!hasText(stageNameNormalized) || !hasText(pricingProcessNameNormalized)) {
            throw new IllegalArgumentException("生产环节必须为：采购/裁剪/车缝/大烫/质检/包装/入库");
        }

        final String stageNameFinal = Objects.requireNonNull(stageNameNormalized);
        final String pricingProcessNameFinal = Objects.requireNonNull(pricingProcessNameNormalized);

        boolean isCutting = "cutting".equals(scanType);
        if (!isCutting && bundle != null) {
            String pn = stageNameFinal;
            if (templateLibraryService.progressStageNameMatches("裁剪", pn)) {
                isCutting = true;
            }
        }
        // 检查是否是裁剪环节但没有匹配到菲号
        if (!isCutting && bundle == null && templateLibraryService.progressStageNameMatches("裁剪", stageNameFinal)) {
            throw new IllegalStateException("裁剪环节需先在PC端生成菲号，再进行扫码操作");
        }
        
        // 裁剪环节检查纸样是否齐全（只警告，不阻止）
        if (isCutting && order != null && hasText(order.getStyleId())) {
            checkPatternForCutting(order.getStyleId());
        }
        
        String finalScanType = isCutting ? "cutting" : scanType;

        Integer qty = quantity;
        if (qty == null) {
            qty = parseInt(params.get("quantity"));
        }
        if (qty == null || qty <= 0) {
            throw new IllegalArgumentException("数量必须大于0");
        }

        validateNotExceedOrderQuantity(order, finalScanType, stageNameFinal, qty, bundle);

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
            dup.put("success", true);
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
        result.put("success", true);
        result.put("message", "扫码成功");
        result.put("scanRecord", sr);
        Map<String, Object> orderInfo = new HashMap<>();
        orderInfo.put("orderNo", order.getOrderNo());
        orderInfo.put("styleNo", order.getStyleNo());
        result.put("orderInfo", orderInfo);
        if (templateLibraryService.progressStageNameMatches("采购", stageNameFinal)) {
            List<MaterialPurchase> purchases = materialPurchaseService.list(new LambdaQueryWrapper<MaterialPurchase>()
                    .eq(MaterialPurchase::getOrderId, order.getId())
                    .eq(MaterialPurchase::getDeleteFlag, 0)
                    .orderByAsc(MaterialPurchase::getCreateTime));
            result.put("materialPurchases", purchases == null ? List.of() : purchases);
        }
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

        int progress = order.getProductionProgress() == null ? 0 : order.getProductionProgress();
        if (progress < 0) {
            progress = 0;
        }
        if (progress > 100) {
            progress = 100;
        }
        int idx = -1;
        try {
            idx = scanRecordDomainService.getNodeIndexFromProgress(nodes.size(), progress);
        } catch (Exception e) {
            idx = -1;
        }
        if (idx < 0) {
            idx = 0;
        }
        if (idx >= nodes.size()) {
            idx = nodes.size() - 1;
        }
        for (int i = idx; i < nodes.size(); i++) {
            String pnRaw = nodes.get(i) == null ? "" : nodes.get(i).trim();
            if (!hasText(pnRaw)) {
                continue;
            }
            String pn = normalizeFixedProductionNodeName(pnRaw);
            if (!hasText(pn)) {
                continue;
            }
            if (templateLibraryService.isProgressQualityStageName(pnRaw)
                    || templateLibraryService.isProgressQualityStageName(pn)) {
                continue;
            }
            if (isAutoSkippableStageName(order, pn)) {
                continue;
            }
            return pn;
        }
        for (int i = idx; i >= 0; i--) {
            String pnRaw = nodes.get(i) == null ? "" : nodes.get(i).trim();
            if (!hasText(pnRaw)) {
                continue;
            }
            String pn = normalizeFixedProductionNodeName(pnRaw);
            if (!hasText(pn)) {
                continue;
            }
            if (templateLibraryService.isProgressQualityStageName(pnRaw)
                    || templateLibraryService.isProgressQualityStageName(pn)) {
                continue;
            }
            if (templateLibraryService.progressStageNameMatches(
                    ProductionOrderScanRecordDomainService.STAGE_ORDER_CREATED,
                    pnRaw)) {
                continue;
            }
            if (templateLibraryService.progressStageNameMatches(
                    ProductionOrderScanRecordDomainService.STAGE_PROCUREMENT,
                    pnRaw)) {
                int r = order.getMaterialArrivalRate() == null ? 0 : order.getMaterialArrivalRate();
                if (r < 0) {
                    r = 0;
                }
                if (r > 100) {
                    r = 100;
                }
                if (r >= 100) {
                    continue;
                }
            }
            return pn;
        }

        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) {
            for (String n : nodes) {
                String pnRaw = n == null ? "" : n.trim();
                if (!hasText(pnRaw)) {
                    continue;
                }
                String pn = normalizeFixedProductionNodeName(pnRaw);
                if (hasText(pn)
                        && !isAutoSkippableStageName(order, pn)
                        && !templateLibraryService.isProgressQualityStageName(pnRaw)
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
                if (isAutoSkippableStageName(order, pn)) {
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
            if (isAutoSkippableStageName(order, pn)) {
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
        if (v instanceof Number number) {
            return number.intValue();
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

    private BigDecimal parseBigDecimal(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof BigDecimal decimal) {
            return decimal;
        }
        if (v instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue());
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

    public Map<String, Object> resolveUnitPrice(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new HashMap<>() : new HashMap<>(params);

        String scanCode = trimToNull(safeParams.get("scanCode"));
        String orderId = trimToNull(safeParams.get("orderId"));
        String orderNo = trimToNull(safeParams.get("orderNo"));
        String styleNo = trimToNull(safeParams.get("styleNo"));

        CuttingBundle bundle = hasText(scanCode) ? cuttingBundleService.getByQrCode(scanCode) : null;
        if (!hasText(orderId) && bundle != null && hasText(bundle.getProductionOrderId())) {
            orderId = bundle.getProductionOrderId().trim();
        }

        ProductionOrder order = null;
        if (!hasText(styleNo)) {
            order = resolveOrder(orderId, orderNo);
            styleNo = order == null ? null : trimToNull(order.getStyleNo());
        }
        if (!hasText(styleNo)) {
            throw new IllegalArgumentException("未匹配到款号");
        }

        String processName = trimToNull(safeParams.get("processName"));
        if (!hasText(processName)) {
            processName = trimToNull(safeParams.get("progressStage"));
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

    private void validateNotExceedOrderQuantity(ProductionOrder order, String scanType, String progressStage,
            int incomingQty, CuttingBundle bundle) {
        if (order == null || !hasText(order.getId())) {
            return;
        }
        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) {
            return;
        }
        long total = computeStageDoneQuantity(order.getId(), scanType, progressStage);
        int existingBundleQty = computeExistingBundleQuantity(order.getId(), scanType, progressStage, bundle);
        int nextBundleQty = Math.max(existingBundleQty, incomingQty);
        long safeTotal = Math.max(0L, total - existingBundleQty);
        long nextTotal = safeTotal + nextBundleQty;
        if (nextTotal > orderQty) {
            throw new IllegalStateException("扫码数量超过订单数量");
        }
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

    public IPage<ScanRecord> getMyHistory(int page, int pageSize, String scanType) {
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
        return scanRecordService.queryPage(params);
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
}
