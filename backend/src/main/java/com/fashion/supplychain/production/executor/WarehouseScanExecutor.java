package com.fashion.supplychain.production.executor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.common.util.NumberUtils;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.helper.InventoryValidator;
import com.fashion.supplychain.production.helper.lookup.BundleLookupContext;
import com.fashion.supplychain.production.service.impl.ProductWarehousingHelper;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.*;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 仓库入库扫码执行器
 * 职责：
 * 1. 成品入库
 * 2. 次品阻止入库
 * 3. 重复扫码处理
 * 4. 进度重新计算
 *
 * 提取自 ScanRecordOrchestrator（减少约140行代码）
 */
@Component
@Slf4j
public class WarehouseScanExecutor {

    @Autowired
    private ProductionScanStageSupport stageSupport;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private CuttingBundleLookupService bundleLookupService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private InventoryValidator inventoryValidator;

    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @Autowired
    private SKUService skuService;

    @Autowired
    private ProductWarehousingHelper warehousingHelper;

    @Autowired
    private ProductSkuService productSkuService;

    @Lazy
    @Autowired(required = false)
    private com.fashion.supplychain.system.orchestration.ChangeApprovalOrchestrator changeApprovalOrchestrator;

    @Autowired
    private com.fashion.supplychain.websocket.service.WebSocketService webSocketService;

    @Autowired
    private UCodeWarehouseScanExecutor uCodeWarehouseScanExecutor;

    /**
     * 执行仓库入库扫码
     */
    public Map<String, Object> execute(Map<String, Object> params, String requestId, String operatorId,
                                       String operatorName, ProductionOrder order,
                                       java.util.function.Function<String, String> colorResolver,
                                       java.util.function.Function<String, String> sizeResolver) {
        Integer qty = NumberUtils.toInt(params.get("quantity"));
        if (qty == null || qty <= 0) {
            throw new IllegalArgumentException("数量必须大于0");
        }

        String scanCode = TextUtils.safeText(params.get("scanCode"));
        if (!hasText(scanCode)) {
            throw new IllegalArgumentException("扫码内容不能为空");
        }

        // ★ 提前判断 isDefectiveReentry，返修申报不强制要求仓库（避免 400）
        boolean isDefectiveReentry = "true".equalsIgnoreCase(
                TextUtils.safeText(params.get("isDefectiveReentry")));

        String warehouse = TextUtils.safeText(params.get("warehouse"));
        if (!hasText(warehouse)) {
            if (isDefectiveReentry) {
                warehouse = "待分配"; // 返修申报不必指定仓库，使用默认值
            } else {
                throw new IllegalArgumentException("请指定仓库");
            }
        }

        CuttingBundle bundle = bundleLookupService.lookup(BundleLookupContext.from(params));
        if (bundle == null || !hasText(bundle.getId())) {
            throw new IllegalStateException("未匹配到菲号");
        }

        validateBundleFactoryAccess(bundle);

        if (order == null) {
            throw new IllegalStateException("未匹配到订单");
        }

        // ★ 订单完成状态检查：所有环节统一拦截
        String orderStatus = order.getStatus() == null ? "" : order.getStatus().trim();
        if (OrderStatusConstants.isTerminal(orderStatus)) {
            throw new IllegalStateException("订单已终态(" + orderStatus + ")，无法继续入库");
        }

        if (isDefectiveReentry) {
            return handleDefectiveReentry(order, bundle, qty, operatorId, operatorName, warehouse);
        }
        Map<String, Object> overResult = validateNormalWarehouseIn(
                order, bundle, qty, warehouse, params, requestId, operatorId, operatorName, colorResolver, sizeResolver);
        if (overResult != null) return overResult;

        // 创建入库记录（正常入库路径）
        ProductWarehousing w = saveWarehousingRecord(order, bundle, qty, warehouse, operatorId, operatorName);
        ScanRecord sr = saveWarehouseScanRecord(params, requestId, operatorId, operatorName,
                order, bundle, qty, warehouse, colorResolver, sizeResolver);
        updateProcessTrackingForWarehouse(bundle, order, operatorId, operatorName, sr);
        Map<String, Object> result = buildResult(bundle, order, sr);
        notifyWarehouseScanSuccess(operatorId, operatorName, order, bundle, w, sr);
        return result;
    }

    private Map<String, Object> handleDefectiveReentry(ProductionOrder order, CuttingBundle bundle,
                                                        int qty, String operatorId, String operatorName,
                                                        String warehouse) {
        validateDefectiveReentryQty(order.getId(), bundle, qty);
        try {
            productWarehousingService.saveRepairReturnDeclaration(
                    bundle, order, qty, "返修完成", operatorId, operatorName, warehouse);
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("返修申报保存失败（不阻断流程）: orderId={}, bundle={}, error={}",
                    order.getId(), bundle.getBundleNo(), e.getMessage(), e);
        }
        try {
            productionOrderService.recomputeProgressFromRecords(order.getId());
        } catch (Exception e) {
            log.warn("返修申报后进度重算失败(不阻断): orderNo={}", order.getOrderNo(), e);
        }
        Map<String, Object> repairResult = new HashMap<>();
        repairResult.put("success", true);
        repairResult.put("message", "返修完成申报成功，请通知质检员进行重新验收");
        repairResult.put("bundleStatus", "repaired_waiting_qc");
        repairResult.put("nextScanType", "quality");
        repairResult.put("nextStageHint", "下一环节: quality");
        return repairResult;
    }

    private Map<String, Object> validateNormalWarehouseIn(ProductionOrder order, CuttingBundle bundle, int qty,
                                            String warehouse, Map<String, Object> params, String requestId,
                                            String operatorId, String operatorName,
                                            java.util.function.Function<String, String> colorResolver,
                                            java.util.function.Function<String, String> sizeResolver) {
        if (warehousingHelper.isBundleBlockedForWarehousing(bundle.getStatus())) {
            int repairPool = warehousingHelper.calcRepairBreakdown(order.getId(), bundle.getId(), null)[0];
            if (repairPool > 0) {
                throw new IllegalStateException("温馨提示：该菲号存在待返修的产品，返修完成后才能入库哦～");
            }
        }
        validateBundleWarehousingQuantity(bundle, qty);
        validateProductionPrerequisite(order, bundle);
        validateQualityConfirmBeforeWarehousing(order.getId(), bundle.getId());
        InventoryValidator.QuantityCheckResult qr =
            inventoryValidator.checkOverQuantity(order, "warehouse", "入库", qty, bundle);
        if (qr.isExceeded()) {
            Map<String, Object> overResult = attemptOverQuantityApproval(
                qr, params, requestId, operatorId, operatorName,
                order, bundle, qty, warehouse, colorResolver, sizeResolver);
            if (overResult != null) return overResult;
            log.info("[OverQty] 管理员/无审批链，直接放行: orderId={}", order.getId());
        }
        return null;
    }

    private ProductWarehousing saveWarehousingRecord(ProductionOrder order, CuttingBundle bundle,
                                                      int qty, String warehouse,
                                                      String operatorId, String operatorName) {
        ProductWarehousing w = new ProductWarehousing();
        w.setOrderId(order.getId());
        w.setWarehousingType("scan");
        w.setWarehouse(warehouse);
        w.setWarehousingQuantity(qty);
        w.setQualifiedQuantity(qty);
        w.setUnqualifiedQuantity(0);
        w.setQualityStatus("qualified");
        w.setCuttingBundleQrCode(bundle.getQrCode());
        if (StringUtils.hasText(operatorId)) {
            w.setWarehousingOperatorId(operatorId);
            w.setReceiverId(operatorId);
            w.setQualityOperatorId(operatorId);
        }
        if (StringUtils.hasText(operatorName)) {
            w.setWarehousingOperatorName(operatorName);
            w.setReceiverName(operatorName);
            w.setQualityOperatorName(operatorName);
        }
        w.setTenantId(order.getTenantId());
        try {
            boolean ok = productWarehousingService.saveWarehousingAndUpdateOrder(w);
            if (!ok) {
                throw new IllegalStateException("入库失败");
            }
        } catch (IllegalArgumentException | IllegalStateException | NoSuchElementException e) {
            throw e;
        } catch (DataAccessException dae) {
            log.error("[WarehouseScan] 入库记录写入DB失败 orderId={}, bundle={}: {}",
                    order.getId(), bundle.getBundleNo(), dae.getMessage(), dae);
            throw new IllegalStateException("入库记录保存失败，请联系管理员（DB错误：" + dae.getMessage() + "）");
        } catch (Exception e) {
            log.error("[WarehouseScan] 入库操作意外异常 orderId={}, bundle={}: {}",
                    order.getId(), bundle.getBundleNo(), e.getMessage(), e);
            throw new IllegalStateException("入库操作失败：" + e.getMessage());
        }
        try {
            if (productionOrderService != null) {
                productionOrderService.recomputeProgressFromRecords(order.getId());
            }
        } catch (Exception e) {
            log.error("重新计算订单进度失败: orderId={}", order.getId(), e);
        }
        return w;
    }

    private ScanRecord saveWarehouseScanRecord(Map<String, Object> params, String requestId,
                                                String operatorId, String operatorName,
                                                ProductionOrder order, CuttingBundle bundle,
                                                int qty, String warehouse,
                                                java.util.function.Function<String, String> colorResolver,
                                                java.util.function.Function<String, String> sizeResolver) {
        ScanRecord sr = buildWarehouseRecord(params, requestId, operatorId, operatorName, order, bundle, qty, warehouse,
                                             colorResolver, sizeResolver);
        try {
            scanRecordService.saveScanRecord(sr);
        } catch (DuplicateKeyException dke) {
            log.info("仓库扫码记录重复: requestId={}", requestId, dke);
            try {
                ScanRecord existing = scanRecordService.lambdaQuery()
                        .eq(ScanRecord::getRequestId, requestId)
                        .last("limit 1")
                        .one();
                if (existing != null) sr = existing;
            } catch (Exception ex) {
                log.warn("查找已有入库扫码记录失败: requestId={}", requestId, ex);
            }
        } catch (Exception dbEx) {
            log.error("[ScanSave-Warehouse] t_scan_record保存失败: requestId={}, exType={}, error={}",
                    requestId, dbEx.getClass().getSimpleName(), dbEx.getMessage(), dbEx);
            throw new IllegalStateException("入库扫码记录保存失败，请重试: " + dbEx.getMessage());
        }
        return sr;
    }

    private void updateProcessTrackingForWarehouse(CuttingBundle bundle, ProductionOrder order,
                                                    String operatorId, String operatorName, ScanRecord sr) {
        if (bundle == null || !hasText(bundle.getId())) {
            return;
        }
        try {
            boolean trackingUpdated = processTrackingOrchestrator.updateScanRecord(
                bundle.getId(), "入库", operatorId, operatorName, sr.getId());
            if (trackingUpdated) {
                log.info("入库工序跟踪记录更新成功: bundleId={}, orderId={}", bundle.getId(), order.getId());
            } else {
                log.info("入库工序跟踪记录未找到，尝试追加初始化并重试更新: bundleId={}, orderId={}", bundle.getId(), order.getId());
                try {
                    processTrackingOrchestrator.appendProcessTracking(order.getId(), List.of(bundle));
                    boolean retryUpdated = processTrackingOrchestrator.updateScanRecord(
                            bundle.getId(), "入库", operatorId, operatorName, sr.getId());
                    if (retryUpdated) {
                        log.info("入库工序跟踪记录重试更新成功: bundleId={}, orderId={}", bundle.getId(), order.getId());
                    }
                } catch (Exception createEx) {
                    log.warn("追加并更新入库工序跟踪记录失败（不阻断入库）: bundleId={}, orderId={}, msg={}",
                            bundle.getId(), order.getId(), createEx.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("更新入库工序跟踪记录失败（不阻断入库）: bundleId={}, msg={}", bundle.getId(), e.getMessage());
        }
    }

    private Map<String, Object> buildResult(CuttingBundle bundle, ProductionOrder order, ScanRecord sr) {
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        String whBundleNo = bundle != null && bundle.getBundleNo() != null ? String.valueOf(bundle.getBundleNo()) : "";
        result.put("message", "入库成功" + (whBundleNo.isEmpty() ? "" : " · 菲号" + whBundleNo));
        result.put("scanRecord", sr);
        result.put("orderInfo", buildOrderInfo(order));
        result.put("cuttingBundle", bundle);
        return result;
    }

    private void notifyWarehouseScanSuccess(String operatorId, String operatorName,
                                             ProductionOrder order, CuttingBundle bundle,
                                             ProductWarehousing w, ScanRecord sr) {
        try {
            String orderNo = order.getOrderNo() != null ? order.getOrderNo() : "";
            String wh = w.getWarehouse() != null ? w.getWarehouse() : "";
            int whQty = w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0;
            String styleNo = order.getStyleNo() != null ? order.getStyleNo() : "";
            String bNo = bundle.getBundleNo() != null ? String.valueOf(bundle.getBundleNo()) : "";
            String bColor = bundle.getColor() != null ? bundle.getColor() : "";
            String bSize = bundle.getSize() != null ? bundle.getSize() : "";
            String opName = operatorName != null ? operatorName : "";
            webSocketService.notifyScanSuccess(operatorId, orderNo, styleNo, "入库", whQty, opName, bNo);
            webSocketService.notifyWarehouseIn(operatorId, orderNo, whQty, wh);
            webSocketService.notifyOrderProgressChanged(operatorId, orderNo, whQty, "入库");
            webSocketService.notifyDataChanged(operatorId, "ScanRecord", sr.getId(), "create");
            webSocketService.notifyProcessStageCompleted(operatorId, orderNo, "入库", opName, bNo, bColor, bSize, whQty);
        } catch (Exception wsEx) {
            log.warn("[WarehouseScan] WebSocket broadcast failed (non-blocking): {}", wsEx.getMessage());
        }
    }

    /**
     * ★ 验证单个菲号累计入库数量不超过菲号裁剪数量
     */
    private void validateBundleWarehousingQuantity(CuttingBundle bundle, int incomingQty) {
        if (bundle == null || bundle.getQuantity() == null || bundle.getQuantity() <= 0) {
            return;
        }

        int bundleQty = bundle.getQuantity();

        int scrapQty = warehousingHelper.getScrapQtyByBundle(
                bundle.getProductionOrderId(), bundle.getId());
        int effectiveBundleQty = bundleQty - scrapQty;

        int bundleWarehoused;
        try {
            QueryWrapper<ProductWarehousing> qw = new QueryWrapper<ProductWarehousing>()
                    .select("COALESCE(SUM(qualified_quantity), 0) as totalQty")
                    .eq("delete_flag", 0)
                    .eq("cutting_bundle_id", bundle.getId())
                    .eq("quality_status", "qualified")
                    .notIn("warehousing_type", "quality_scan", "quality_scan_scrap");
            List<Map<String, Object>> result = productWarehousingService.listMaps(qw);
            bundleWarehoused = 0;
            if (result != null && !result.isEmpty()) {
                Object val = result.get(0).get("totalQty");
                if (val instanceof Number) bundleWarehoused = ((Number) val).intValue();
            }
        } catch (Exception e) {
            log.warn("查询菲号已入库数量失败: bundleId={}", bundle.getId(), e);
            throw new IllegalStateException("查询菲号已入库数量失败，为防止超额入库，请重试或联系管理员");
        }

        if (bundleWarehoused >= effectiveBundleQty) {
            throw new IllegalStateException(String.format(
                    "该菲号已全部入库！裁剪数=%d%s，已入库=%d，无需重复入库",
                    bundleQty,
                    scrapQty > 0 ? "（报废" + scrapQty + "件，可入库" + effectiveBundleQty + "件）" : "",
                    bundleWarehoused));
        }

        int totalAfterScan = bundleWarehoused + incomingQty;

        if (totalAfterScan > effectiveBundleQty) {
            String msg = String.format(
                    "菲号入库数量超出限制！菲号裁剪数=%d%s，已入库=%d，本次入库=%d，总计=%d",
                    bundleQty,
                    scrapQty > 0 ? "（报废" + scrapQty + "件，可入库" + effectiveBundleQty + "件）" : "",
                    bundleWarehoused, incomingQty, totalAfterScan);
            log.warn("单菲号数量验证失败: bundleId={}, bundleNo={}, {}",
                    bundle.getId(), bundle.getBundleNo(), msg);
            throw new IllegalArgumentException(msg);
        }

        log.debug("单菲号数量验证通过: bundleId={}, bundleNo={}, 裁剪数={}, 报废={}, 有效={}, 已入库={}, 本次={}",
                bundle.getId(), bundle.getBundleNo(), bundleQty, scrapQty, effectiveBundleQty, bundleWarehoused, incomingQty);
    }

    /**
     * 尝试创建超额入库审批申请。
     * 若审批链未配置（管理员操作或无审批人），返回 null，由调用方直接放行入库。
     */
    private Map<String, Object> attemptOverQuantityApproval(
            InventoryValidator.QuantityCheckResult qr,
            Map<String, Object> params,
            String requestId, String operatorId, String operatorName,
            ProductionOrder order, CuttingBundle bundle, int qty, String warehouse,
            java.util.function.Function<String, String> colorResolver,
            java.util.function.Function<String, String> sizeResolver) {

        ScanRecord sr = new ScanRecord();
        sr.setRequestId("OQ_" + requestId);
        sr.setScanCode(TextUtils.safeText(params.get("scanCode")));
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setTenantId(order.getTenantId());
        sr.setQuantity(qty);
        sr.setProcessCode("warehouse");
        sr.setProgressStage("入库");
        sr.setProcessName("入库");
        sr.setScanType("warehouse");
        sr.setScanResult("pending_approval");
        sr.setOperatorId(operatorId);
        sr.setOperatorName(operatorName);
        sr.setCuttingBundleId(bundle != null ? bundle.getId() : null);
        sr.setCuttingBundleNo(bundle != null ? bundle.getBundleNo() : null);
        sr.setCuttingBundleQrCode(bundle != null ? bundle.getQrCode() : null);
        sr.setFactoryId(com.fashion.supplychain.common.UserContext.factoryId());
        sr.setScanMode("scan");
        sr.setRemark("[超额待审批] " + qr.getMessage());
        sr.setScanTime(java.time.LocalDateTime.now());
        sr.setCreateTime(java.time.LocalDateTime.now());
        try { scanRecordService.saveScanRecord(sr); }
        catch (Exception e) { log.warn("[OverQty] 保存超额记录失败: {}", e.getMessage()); }

        Map<String, Object> operationData = new HashMap<>();
        operationData.put("orderId", order.getId());
        operationData.put("bundleId", bundle != null ? bundle.getId() : null);
        operationData.put("qty", qty);
        operationData.put("warehouse", warehouse);
        operationData.put("operatorId", operatorId);
        operationData.put("operatorName", operatorName);
        operationData.put("scanRecordId", sr.getId());

        String reason = "入库超额：" + qr.getMessage();
        Map<String, Object> approvalResp = changeApprovalOrchestrator == null ? null :
            changeApprovalOrchestrator.checkAndCreateIfNeeded(
                "OVER_QUANTITY_SCAN", order.getId(), order.getOrderNo(), operationData, reason);

        if (approvalResp == null) return null;

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("needApproval", true);
        result.put("approvalId", approvalResp.get("approvalId"));
        result.put("approverName", approvalResp.get("approverName"));
        result.put("message", "入库超出限制，已提交主管审批，审批通过后自动入库");
        result.put("overQuantityDetail", qr.getMessage());
        log.warn("[OverQty] 超额审批已提交: orderId={}, qty={}, limit={}",
            order.getId(), qty, qr.getLimitQuantity());
        return result;
    }

    /**
     * 构建仓库扫码记录
     */
    private ScanRecord buildWarehouseRecord(Map<String, Object> params, String requestId, String operatorId,
                                           String operatorName, ProductionOrder order, CuttingBundle bundle,
                                           int qty, String warehouse,
                                           java.util.function.Function<String, String> colorResolver,
                                           java.util.function.Function<String, String> sizeResolver) {
        ScanRecord sr = new ScanRecord();
        sr.setRequestId(requestId);
        sr.setScanCode(TextUtils.safeText(params.get("scanCode")));
        sr.setOrderId(order.getId());
        sr.setOrderNo(order.getOrderNo());
        sr.setStyleId(order.getStyleId());
        sr.setStyleNo(order.getStyleNo());
        sr.setTenantId(order.getTenantId());
        String color = colorResolver.apply(null);
        if (!hasText(color) && bundle != null) {
            color = TextUtils.safeText(bundle.getColor());
        }
        if (!hasText(color) && order != null) {
            color = TextUtils.safeText(order.getColor());
        }
        String size = sizeResolver.apply(null);
        if (!hasText(size) && bundle != null) {
            size = TextUtils.safeText(bundle.getSize());
        }
        if (!hasText(size) && order != null) {
            size = TextUtils.safeText(order.getSize());
        }
        sr.setColor(color);
        sr.setSize(size);
        sr.setQuantity(qty);
        sr.setProcessCode("warehouse");
        sr.setProgressStage("入库");
        sr.setProcessName("入库");
        sr.setOperatorId(operatorId);
        sr.setOperatorName(operatorName);
        sr.setScanTime(LocalDateTime.now());
        sr.setScanType("warehouse");
        sr.setScanResult("success");
        sr.setRemark("入库: " + warehouse);
        sr.setCuttingBundleId(bundle.getId());
        sr.setCuttingBundleNo(bundle.getBundleNo());
        sr.setCuttingBundleQrCode(bundle.getQrCode());
        sr.setFactoryId(com.fashion.supplychain.common.UserContext.factoryId());
        sr.setScanMode("scan");
        sr.setReceiveTime(LocalDateTime.now());

        if (skuService != null) {
            skuService.attachProcessUnitPrice(sr);
        }

        return sr;
    }

    /**
     * 构建订单信息
     */
    private Map<String, Object> buildOrderInfo(ProductionOrder order) {
        Map<String, Object> info = new HashMap<>();
        info.put("orderNo", order.getOrderNo());
        info.put("styleNo", order.getStyleNo());
        return info;
    }

    private boolean hasText(String str) {
        return StringUtils.hasText(str);
    }

    private void validateBundleFactoryAccess(CuttingBundle bundle) {
        if (bundle == null) return;
        String bundleFactoryId = bundle.getFactoryId();
        if (!StringUtils.hasText(bundleFactoryId)) return;
        String workerFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        if (!bundleFactoryId.equals(workerFactoryId)) {
            log.warn("[工厂隔离-入库] 扫码被拒绝: bundleId={}, bundleFactory={}, workerFactory={}", bundle.getId(), bundleFactoryId, workerFactoryId);
            throw new com.fashion.supplychain.common.BusinessException("该菲号已转派至外发工厂，您无权入库扫码");
        }
    }

    /**
     * 入库前置校验：必须完成所有生产扫码（至少一条），且“尾部”父节点下所有子工序全部完成
     * 业务规则：入库前需车缝+尾部全部完成，PC端和小程序共用此校验
     */
    private void validateProductionPrerequisite(ProductionOrder order, CuttingBundle bundle) {
        if (order == null || bundle == null || !hasText(order.getId()) || !hasText(bundle.getId())) {
            return;
        }
        try {
            // 1. 基础检查：至少有生产扫码记录
            long productionCount = scanRecordService.count(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, order.getId())
                    .eq(ScanRecord::getCuttingBundleId, bundle.getId())
                    .eq(ScanRecord::getScanType, "production")
                    .eq(ScanRecord::getScanResult, "success"));
            if (productionCount <= 0) {
                throw new IllegalStateException("温馨提示：该菲号还未完成生产扫码哦～请先完成所有生产工序（车缝/尾部）后再入库");
            }

            // 2. 尾部子工序全部完成校验（基于模板配置）
            // "入库"的前一个父节点是"尾部"，此调用会检查尾部所有子工序都有扫码记录
            stageSupport.validateParentStagePrerequisite(order, bundle, "入库", null);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.error("检查入库前置条件失败，为防止数据异常阻止入库: orderId={}, bundleId={}", order.getId(), bundle.getId(), e);
            throw new IllegalStateException("检查入库前置条件失败，请重试或联系管理员");
        }
    }

    /**
     * 质检前置校验：入库前必须已录入质检结果（quality_receive 记录 + confirmTime 不为空）
     * 业务规则：质检 → 包装 → 入库，质检结果是必经步骤
     *
     * 🔧 修复(2026-02-25)：handleConfirm 只更新现有 quality_receive 记录的 confirmTime，
     * 不创建 quality_confirm 记录。改为查询 quality_receive + confirmTime IS NOT NULL，
     * 与小程序 StageDetector 的修复保持一致。
     */
    private void validateQualityConfirmBeforeWarehousing(String orderId, String bundleId) {
        if (!hasText(orderId) || !hasText(bundleId)) {
            return;
        }
        try {
            long confirmCount = scanRecordService.count(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId)
                    .eq(ScanRecord::getCuttingBundleId, bundleId)
                    .eq(ScanRecord::getScanType, "quality")
                    .eq(ScanRecord::getProcessCode, "quality_receive")
                    .eq(ScanRecord::getScanResult, "success")
                    .isNotNull(ScanRecord::getConfirmTime));
            if (confirmCount <= 0) {
                throw new IllegalStateException("温馨提示：该菲号还未录入质检结果哦～请先完成质检后再入库");
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.error("检查质检前置条件失败，为防止数据异常阻止入库: orderId={}, bundleId={}", orderId, bundleId, e);
            throw new IllegalStateException("检查质检前置条件失败，请重试或联系管理员");
        }
    }



    /**
     * 次品返修入库数量验证：从 t_product_warehousing 读取剩余可返修件数
     * （PC 手工入库 / 扫码入库均适用，数据源统一）
     */
    private void validateDefectiveReentryQty(String orderId, CuttingBundle bundle, int qty) {
        String bid = bundle == null ? null : bundle.getId();
        // 根据新语义：检查“尚在工厂返修中尚未申报返回”的件数
        int remaining = warehousingHelper.repairDeclarationRemainingQtyByBundle(orderId, bid, null);
        if (remaining <= 0) {
            // 兜底：quality_scan 记录可能因 DB 异常未创建（createQualityScanRecord 静默失败），
            // 从 t_scan_record 的最新质检确认 remark 中恢复次品数量
            int defectFromScan = getDefectQtyFromScanRecord(orderId, bid);
            if (defectFromScan <= 0) {
                throw new IllegalStateException("未找到待返修次品记录，无法进行次品入库");
            }
            log.warn("[WarehouseScan] 次品入库：quality_scan 记录缺失，从质检扫码记录恢复次品数 bundleId={}, defectQty={}",
                    bid, defectFromScan);
            remaining = defectFromScan;
        }
        if (qty > remaining) {
            throw new IllegalArgumentException(String.format(
                    "次品入库数量超限！剩余可返修=%d，本次=%d，超出%d件",
                    remaining, qty, qty - remaining));
        }
        log.debug("次品入库验证通过: bundleId={}, remaining={}, 本次={}", bid, remaining, qty);
    }

    /**
     * 从质检扫码记录的 remark 中获取次品数量（quality_scan warehousing 记录缺失时的兜底）
     */
    private int getDefectQtyFromScanRecord(String orderId, String bundleId) {
        if (!hasText(orderId) || !hasText(bundleId)) return 0;
        try {
            ScanRecord latest = scanRecordService.getOne(new LambdaQueryWrapper<ScanRecord>()
                    .select(ScanRecord::getId, ScanRecord::getRemark, ScanRecord::getQuantity, ScanRecord::getConfirmTime)
                    .eq(ScanRecord::getOrderId, orderId)
                    .eq(ScanRecord::getCuttingBundleId, bundleId)
                    .eq(ScanRecord::getProcessCode, "quality_receive")
                    .isNotNull(ScanRecord::getConfirmTime)
                    .eq(ScanRecord::getScanResult, "success")
                    .orderByDesc(ScanRecord::getConfirmTime)
                    .last("limit 1"));
            if (latest == null) return 0;

            String remark = latest.getRemark() == null ? "" : latest.getRemark();
            if (!remark.startsWith("unqualified")) return 0;

            if (remark.contains("|报废|") || remark.endsWith("|报废")) return 0;

            return parseDefectQtyFromRemark(remark,
                    latest.getQuantity() == null ? 0 : latest.getQuantity());
        } catch (Exception e) {
            log.warn("[WarehouseScan] 从扫码记录获取次品数量失败: orderId={}, bundleId={}, error={}",
                    orderId, bundleId, e.getMessage());
            return 0;
        }
    }

    /**
     * 从 remark 字符串中解析次品数量
     * remark 格式：「unqualified|category|返修|defectQty=N」或「unqualified|defectQty=N」
     */
    private int parseDefectQtyFromRemark(String remark, int fallbackQty) {
        if (!hasText(remark)) return fallbackQty;
        String[] parts = remark.split("\\|");
        for (String part : parts) {
            String trimmed = part.trim();
            if (trimmed.startsWith("defectQty=")) {
                try {
                    int v = Integer.parseInt(trimmed.substring("defectQty=".length()).trim());
                    if (v > 0) return v;
                } catch (NumberFormatException e) {
                    log.debug("[WarehouseScan] defectQty解析失败: {}", e.getMessage());
                }
            }
        }
        return fallbackQty;
    }

    // ======================== U编码入库 ========================

    /**
     * U编码入库扫码（无菲号模式）
     * 委托给 {@link UCodeWarehouseScanExecutor} 处理
     *
     * @deprecated 建议直接注入 {@link UCodeWarehouseScanExecutor} 调用
     */
    public Map<String, Object> executeUCode(Map<String, Object> params, String requestId,
            String operatorId, String operatorName, ProductionOrder order) {
        return uCodeWarehouseScanExecutor.execute(params, requestId, operatorId, operatorName, order);
    }
}
