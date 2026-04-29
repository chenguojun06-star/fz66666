package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.util.NumberUtils;
import com.fashion.supplychain.common.util.QrCodeSigner;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.helper.DuplicateScanPreventer;
import com.fashion.supplychain.production.helper.ScanRecordPermissionHelper;
import com.fashion.supplychain.production.helper.ScanUndoHelper;
import com.fashion.supplychain.production.helper.ScanRescanHelper;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import org.springframework.util.StringUtils;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Collections;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import com.fashion.supplychain.production.executor.QualityScanExecutor;
import com.fashion.supplychain.production.executor.WarehouseScanExecutor;
import com.fashion.supplychain.production.executor.ProductionScanExecutor;
import com.fashion.supplychain.production.helper.ScanRecordQueryHelper;
import com.fashion.supplychain.production.helper.ScanRecordEnrichHelper;
import com.fashion.supplychain.production.helper.UnitPriceResolver;
import com.fashion.supplychain.production.service.impl.ProductWarehousingHelper;
import com.fashion.supplychain.intelligence.orchestration.SmartNotificationOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ScanPrecheckFeedbackOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.OrderRiskTrackingOrchestrator;
import com.fashion.supplychain.common.lock.DistributedLockService;

@Service
@Slf4j
public class ScanRecordOrchestrator {

    private static final Set<String> ALLOWED_SCAN_TYPES = Set.of("cutting", "production", "quality", "warehouse");
    private static final Set<String> ADMIN_ROLE_KEYWORDS = Set.of("admin", "ADMIN", "manager", "supervisor", "主管", "管理员");

    @Autowired private ScanRecordService scanRecordService;
    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private CuttingBundleService cuttingBundleService;
    @Autowired private ProductWarehousingService productWarehousingService;
    @Autowired private DuplicateScanPreventer duplicateScanPreventer;
    @Autowired private ScanRecordPermissionHelper scanRecordPermissionHelper;
    @Autowired private ScanRecordQueryHelper scanRecordQueryHelper;
    @Autowired private UnitPriceResolver unitPriceResolver;
    @Autowired private QualityScanExecutor qualityScanExecutor;
    @Autowired private WarehouseScanExecutor warehouseScanExecutor;
    @Autowired private ProductionScanExecutor productionScanExecutor;
    @Autowired private QrCodeSigner qrCodeSigner;
    @Autowired private SmartNotificationOrchestrator smartNotificationOrchestrator;
    @Autowired private ScanRecordEnrichHelper scanRecordEnrichHelper;
    @Autowired private DistributedLockService distributedLockService;
    @Autowired private TransactionTemplate transactionTemplate;
    @Autowired private ProductWarehousingHelper warehousingHelper;
    @Autowired private ScanUndoHelper scanUndoHelper;
    @Autowired private ScanRescanHelper scanRescanHelper;
    @Autowired(required = false) private ScanPrecheckFeedbackOrchestrator scanPrecheckFeedbackOrchestrator;
    @Autowired(required = false) private OrderRiskTrackingOrchestrator orderRiskTrackingOrchestrator;

    public Map<String, Object> execute(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        Map<String, Object> safeParams = params == null ? new HashMap<>() : new HashMap<>(params);
        String orderNo = safeParams.get("orderNo") == null ? null : String.valueOf(safeParams.get("orderNo"));
        String lockKey = "scan:" + (orderNo != null ? orderNo : "unknown");
        return distributedLockService.executeWithLock(lockKey, 10, java.util.concurrent.TimeUnit.SECONDS, () -> {
            // 仅核心 DB 写入在事务内
            Map<String, Object> result = transactionTemplate.execute(status -> {
                try {
                    return doExecute(safeParams);
                } catch (Exception e) {
                    status.setRollbackOnly();
                    throw e;
                }
            });
            // 事务提交后执行：通知与状态提示（各自有 try/catch，失败不影响扫码结果）
            tryNotifyNextStage(safeParams, result);
            appendBundleStatusHints(safeParams, result);
            recordScanFeedbackSafely(safeParams, result);
            return result;
        });
    }

    private Map<String, Object> doExecute(Map<String, Object> safeParams) {
        resolveOperatorInfo(safeParams);
        String scanCode = verifyQrCodeSignature(safeParams);
        String scanType = validateAndNormalizeScanType(safeParams);

        boolean autoProcess = "sewing".equals(scanType) || "procurement".equals(scanType);
        Integer qty = NumberUtils.toInt(safeParams.get("quantity"));

        if ("quality".equals(scanType)) {
            return executeQualityScan(safeParams, safeParams.get("requestId") == null ? null : String.valueOf(safeParams.get("requestId")),
                    safeParams.get("operatorId") == null ? null : String.valueOf(safeParams.get("operatorId")), safeParams.get("operatorName") == null ? null : String.valueOf(safeParams.get("operatorName")), UserContext.get());
        }

        if ("warehouse".equals(scanType)) {
            return executeWarehouseScan(safeParams, safeParams.get("requestId") == null ? null : String.valueOf(safeParams.get("requestId")),
                    safeParams.get("operatorId") == null ? null : String.valueOf(safeParams.get("operatorId")), safeParams.get("operatorName") == null ? null : String.valueOf(safeParams.get("operatorName")));
        }

        return executeProductionScan(safeParams, safeParams.get("requestId") == null ? null : String.valueOf(safeParams.get("requestId")),
                safeParams.get("operatorId") == null ? null : String.valueOf(safeParams.get("operatorId")), safeParams.get("operatorName") == null ? null : String.valueOf(safeParams.get("operatorName")), scanType, qty, autoProcess, UserContext.get());
    }

    private void resolveOperatorInfo(Map<String, Object> safeParams) {
        String operatorId = safeParams.get("operatorId") == null ? null : String.valueOf(safeParams.get("operatorId"));
        String operatorName = safeParams.get("operatorName") == null ? null : String.valueOf(safeParams.get("operatorName"));
        if (!hasText(operatorId) && safeParams.get("workerId") != null) operatorId = String.valueOf(safeParams.get("workerId"));
        if (!hasText(operatorName) && safeParams.get("workerName") != null) operatorName = String.valueOf(safeParams.get("workerName"));
        UserContext ctx = UserContext.get();
        String ctxUserId = ctx == null ? null : ctx.getUserId();
        String ctxUsername = ctx == null ? null : ctx.getUsername();
        if (hasText(ctxUserId) && hasText(ctxUsername)) { operatorId = ctxUserId; operatorName = ctxUsername; }
        safeParams.put("operatorId", operatorId);
        safeParams.put("operatorName", operatorName);
    }

    private String verifyQrCodeSignature(Map<String, Object> safeParams) {
        String scanCode = safeParams.get("scanCode") == null ? null : String.valueOf(safeParams.get("scanCode"));
        if (hasText(scanCode)) {
            QrCodeSigner.VerifyResult sigResult = qrCodeSigner.verify(scanCode);
            if (sigResult.isInvalid()) throw new IllegalArgumentException(sigResult.getMessage());
            if (sigResult.getContent() != null && !sigResult.getContent().equals(scanCode)) {
                scanCode = sigResult.getContent();
                safeParams.put("scanCode", scanCode);
            }
        }
        return scanCode;
    }

    private String validateAndNormalizeScanType(Map<String, Object> safeParams) {
        String operatorId = safeParams.get("operatorId") == null ? null : String.valueOf(safeParams.get("operatorId"));
        String operatorName = safeParams.get("operatorName") == null ? null : String.valueOf(safeParams.get("operatorName"));
        String scanCode = safeParams.get("scanCode") == null ? null : String.valueOf(safeParams.get("scanCode"));
        String orderNo = safeParams.get("orderNo") == null ? null : String.valueOf(safeParams.get("orderNo"));
        String orderId = safeParams.get("orderId") == null ? null : String.valueOf(safeParams.get("orderId"));

        if (!hasText(operatorId) || !hasText(operatorName) || (!hasText(scanCode) && !hasText(orderNo) && !hasText(orderId))) {
            if (!hasText(operatorId) || !hasText(operatorName)) throw new IllegalArgumentException("参数错误：缺少操作人信息，请重新登录后再试");
            throw new IllegalArgumentException("参数错误：缺少扫码内容或订单信息");
        }

        String requestId = TextUtils.safeText(safeParams.get("requestId"));
        if (!hasText(requestId)) { requestId = duplicateScanPreventer.generateRequestId(); safeParams.put("requestId", requestId); }
        duplicateScanPreventer.validateRequestId(requestId);
        ScanRecord existed = duplicateScanPreventer.findByRequestId(requestId);
        if (existed != null) throw new IllegalStateException("DUPLICATE_IGNORE");

        String scanType = TextUtils.safeText(safeParams.get("scanType"));
        if (!hasText(scanType)) scanType = "production";
        scanType = scanType.trim().toLowerCase();
        if ("sewing".equals(scanType) || "procurement".equals(scanType)) scanType = "production";
        if (!ALLOWED_SCAN_TYPES.contains(scanType)) throw new IllegalArgumentException("不支持的扫码类型: " + scanType);

        Integer qtyParam = NumberUtils.toInt(safeParams.get("quantity"));
        if (qtyParam != null && qtyParam <= 0) throw new IllegalArgumentException("扫码数量必须大于0");

        String checkOrderId = TextUtils.safeText(safeParams.get("orderId"));
        String checkOrderNo = TextUtils.safeText(safeParams.get("orderNo"));
        ProductionOrder preCheckOrder = scanRecordPermissionHelper.findScopedOrder(checkOrderId, checkOrderNo);
        if (preCheckOrder != null && scanRecordPermissionHelper.isTerminalOrderStatus(preCheckOrder.getStatus()))
            throw new IllegalStateException("订单已终态(" + preCheckOrder.getStatus() + ")，无法继续扫码");

        return scanType;
    }

    public Map<String, Object> undo(Map<String, Object> params) {
        return scanUndoHelper.undo(params);
    }

    public Map<String, Object> rescan(Map<String, Object> params) {
        return scanRescanHelper.rescan(params);
    }

    private Map<String, Object> executeQualityScan(Map<String, Object> params, String requestId, String operatorId,
            String operatorName, UserContext ctx) {
        String scanCode = TextUtils.safeText(params.get("scanCode"));
        final CuttingBundle bundle = cuttingBundleService.getByQrCode(scanCode);
        String orderId = TextUtils.safeText(params.get("orderId"));
        String orderNo = TextUtils.safeText(params.get("orderNo"));
        if (!hasText(orderId) && bundle != null && hasText(bundle.getProductionOrderId())) orderId = bundle.getProductionOrderId().trim();
        ProductionOrder order = resolveOrder(orderId, orderNo);
        if (order == null && !hasText(orderId) && !hasText(orderNo) && hasText(scanCode)) order = resolveOrder(null, scanCode);
        final ProductionOrder finalOrder = order;
        return qualityScanExecutor.execute(params, requestId, operatorId, operatorName, finalOrder,
                (unused) -> resolveColor(params, bundle, finalOrder), (unused) -> resolveSize(params, bundle, finalOrder));
    }

    private Map<String, Object> executeWarehouseScan(Map<String, Object> params, String requestId, String operatorId,
            String operatorName) {
        String scanCode = TextUtils.safeText(params.get("scanCode"));
        String orderId = TextUtils.safeText(params.get("orderId"));
        String orderNo = TextUtils.safeText(params.get("orderNo"));
        String scanMode = TextUtils.safeText(params.get("scanMode"));
        if ("ucode".equals(scanMode)) {
            ProductionOrder order = resolveOrder(orderId, orderNo);
            UserContext ctx = UserContext.get();
            validateOrderBelonging(order, ctx);
            return warehouseScanExecutor.executeUCode(params, requestId, operatorId, operatorName, order);
        }
        final CuttingBundle bundle = hasText(scanCode) ? cuttingBundleService.getByQrCode(scanCode) : null;
        if (!hasText(orderId) && bundle != null && hasText(bundle.getProductionOrderId())) orderId = bundle.getProductionOrderId().trim();
        ProductionOrder order = resolveOrder(orderId, orderNo);
        if (order == null && !hasText(orderId) && !hasText(orderNo) && hasText(scanCode)) order = resolveOrder(null, scanCode);
        final ProductionOrder finalOrder = order;
        UserContext ctx = UserContext.get();
        validateOrderBelonging(finalOrder, ctx);
        return warehouseScanExecutor.execute(params, requestId, operatorId, operatorName, finalOrder,
                (unused) -> resolveColor(params, bundle, finalOrder), (unused) -> resolveSize(params, bundle, finalOrder));
    }

    private Map<String, Object> executeProductionScan(Map<String, Object> params, String requestId, String operatorId,
            String operatorName, String scanType, Integer quantity, boolean autoProcess, UserContext ctx) {
        String orderId = TextUtils.safeText(params.get("orderId"));
        String orderNo = TextUtils.safeText(params.get("orderNo"));
        String scanCode = TextUtils.safeText(params.get("scanCode"));
        ProductionOrder order = resolveOrder(orderId, orderNo);
        if (order == null && hasText(scanCode)) order = resolveOrder(null, scanCode);
        validateOrderBelonging(order, ctx);
        final ProductionOrder resolvedOrder = order;
        return productionScanExecutor.execute(params, requestId, operatorId, operatorName, scanType,
                quantity != null ? quantity : NumberUtils.toInt(params.get("quantity")), autoProcess,
                (unused) -> resolveColor(params, null, resolvedOrder), (unused) -> resolveSize(params, null, resolvedOrder));
    }

    private ProductionOrder resolveOrder(String orderId, String orderNo) {
        String oid = hasText(orderId) ? orderId.trim() : null;
        if (hasText(oid)) {
            ProductionOrder o = productionOrderService.getOne(new LambdaQueryWrapper<ProductionOrder>()
                    .select(ProductionOrder::getId, ProductionOrder::getOrderNo, ProductionOrder::getDeleteFlag,
                            ProductionOrder::getFactoryId, ProductionOrder::getFactoryType, ProductionOrder::getStatus,
                            ProductionOrder::getStyleId, ProductionOrder::getStyleNo, ProductionOrder::getStyleName,
                            ProductionOrder::getColor, ProductionOrder::getSize, ProductionOrder::getTenantId)
                    .eq(ProductionOrder::getId, oid).last("limit 1"));
            if (o == null || o.getDeleteFlag() == null || o.getDeleteFlag() != 0) return null;
            return o;
        }
        String on = hasText(orderNo) ? orderNo.trim() : null;
        if (!hasText(on)) return null;
        return productionOrderService.getOne(new LambdaQueryWrapper<ProductionOrder>()
                .select(ProductionOrder::getId, ProductionOrder::getOrderNo, ProductionOrder::getDeleteFlag,
                        ProductionOrder::getFactoryId, ProductionOrder::getFactoryType, ProductionOrder::getStatus,
                        ProductionOrder::getStyleId, ProductionOrder::getStyleNo, ProductionOrder::getStyleName,
                        ProductionOrder::getColor, ProductionOrder::getSize, ProductionOrder::getTenantId)
                .eq(ProductionOrder::getOrderNo, on).eq(ProductionOrder::getDeleteFlag, 0).last("limit 1"));
    }

    private void validateOrderBelonging(ProductionOrder order, UserContext ctx) {
        if (order == null || ctx == null) return;
        if (isAdminRole(ctx)) return;
        String userFactoryId = ctx.getFactoryId();
        String orderFactoryId = order.getFactoryId();
        String orderFactoryType = order.getFactoryType();
        boolean isInternalUser = !StringUtils.hasText(userFactoryId);
        boolean isExternalOrder = "EXTERNAL".equalsIgnoreCase(orderFactoryType);
        if (isInternalUser && !isExternalOrder) return;
        if (isInternalUser && isExternalOrder) throw new AccessDeniedException("内部员工无法扫码外发订单，请确认订单归属");
        if (!isInternalUser && isExternalOrder) {
            if (userFactoryId != null && userFactoryId.equals(orderFactoryId)) return;
            throw new AccessDeniedException("无法扫码其他工厂的外发订单，请确认订单归属");
        }
        if (!isInternalUser && !isExternalOrder) throw new AccessDeniedException("外发工厂无法扫码内部订单，请确认订单归属");
    }

    private boolean isAdminRole(UserContext ctx) {
        if (ctx == null) return false;
        String role = ctx.getRole();
        if (role == null) return false;
        for (String keyword : ADMIN_ROLE_KEYWORDS) { if (role.contains(keyword)) return true; }
        return false;
    }

    private String resolveColor(Map<String, Object> params, CuttingBundle bundle, ProductionOrder order) {
        String v = TextUtils.safeText(params == null ? null : params.get("color"));
        if (hasText(v)) return v;
        String b = bundle == null ? null : TextUtils.safeText(bundle.getColor());
        if (hasText(b)) return b;
        return order == null ? null : TextUtils.safeText(order.getColor());
    }

    private String resolveSize(Map<String, Object> params, CuttingBundle bundle, ProductionOrder order) {
        String v = TextUtils.safeText(params == null ? null : params.get("size"));
        if (hasText(v)) return v;
        String b = bundle == null ? null : TextUtils.safeText(bundle.getSize());
        if (hasText(b)) return b;
        return order == null ? null : TextUtils.safeText(order.getSize());
    }

    public Map<String, Object> resolveUnitPrice(Map<String, Object> params) { return unitPriceResolver.resolveUnitPrice(params); }

    public IPage<ScanRecord> list(Map<String, Object> params) {
        IPage<ScanRecord> page = scanRecordQueryHelper.list(params);
        scanRecordEnrichHelper.enrichBedNo(page.getRecords());
        scanRecordEnrichHelper.markHasNextStageScan(page.getRecords());
        return page;
    }

    public IPage<ScanRecord> getByOrderId(String orderId, int page, int pageSize) {
        IPage<ScanRecord> result = scanRecordQueryHelper.getByOrderId(orderId, page, pageSize);
        scanRecordEnrichHelper.enrichBedNo(result.getRecords());
        scanRecordEnrichHelper.markHasNextStageScan(result.getRecords());
        return result;
    }

    public IPage<ScanRecord> getByStyleNo(String styleNo, int page, int pageSize) {
        IPage<ScanRecord> result = scanRecordQueryHelper.getByStyleNo(styleNo, page, pageSize);
        scanRecordEnrichHelper.enrichBedNo(result.getRecords());
        scanRecordEnrichHelper.markHasNextStageScan(result.getRecords());
        return result;
    }

    public IPage<ScanRecord> getHistory(int page, int pageSize) {
        IPage<ScanRecord> result = scanRecordQueryHelper.getHistory(page, pageSize);
        scanRecordEnrichHelper.enrichBedNo(result.getRecords());
        scanRecordEnrichHelper.markHasNextStageScan(result.getRecords());
        return result;
    }

    public IPage<ScanRecord> getMyHistory(int page, int pageSize, String scanType, String startTime, String endTime,
            String orderNo, String bundleNo, String workerName, String operatorName) {
        IPage<ScanRecord> result = scanRecordQueryHelper.getMyHistory(page, pageSize, scanType, startTime, endTime, orderNo, bundleNo, workerName, operatorName);
        scanRecordEnrichHelper.enrichBedNo(result.getRecords());
        scanRecordEnrichHelper.markHasNextStageScan(result.getRecords());
        return result;
    }

    public List<ScanRecord> getMyQualityTasks() { return scanRecordQueryHelper.getMyQualityTasks(); }
    public Map<String, Object> getPersonalStats(String scanType) { return getPersonalStats(scanType, null); }
    public Map<String, Object> getPersonalStats(String scanType, String period) { return scanRecordQueryHelper.getPersonalStats(scanType, period); }

    public Map<String, Object> cleanup(String from) {
        if (!UserContext.isTopAdmin()) throw new AccessDeniedException("无权限操作");
        log.warn("[Cleanup] cleanup 功能已禁用");
        return Collections.emptyMap();
    }

    public Map<String, Object> deleteFullLinkByOrderId(String orderId) {
        if (!UserContext.isTopAdmin()) throw new AccessDeniedException("无权限操作");
        String key = orderId == null ? null : orderId.trim();
        if (!hasText(key)) throw new IllegalArgumentException("参数错误");
        log.warn("[Cleanup] deleteFullLink 功能已禁用");
        return Collections.emptyMap();
    }

    private void tryNotifyNextStage(Map<String, Object> params, Map<String, Object> result) {
        try {
            if (result == null || !Boolean.TRUE.equals(result.get("success"))) return;
            UserContext ctx = UserContext.get();
            Long tenantId = ctx != null ? ctx.getTenantId() : null;
            if (tenantId == null) return;
            String orderNo = TextUtils.safeText(params.get("orderNo"));
            if (!hasText(orderNo)) orderNo = TextUtils.safeText(params.get("orderId"));
            String stage = TextUtils.safeText(params.get("progressStage"));
            if (!hasText(stage)) stage = TextUtils.safeText(params.get("scanType"));
            smartNotificationOrchestrator.notifyTeam("next_stage",
                String.format("工序 %s 完成扫码 — %s", hasText(stage) ? stage : "生产扫码", hasText(orderNo) ? orderNo : ""),
                "扫码成功，可安排下道工序接单", tenantId);
        } catch (Exception e) { log.warn("[ScanNotify] 工序推进推送失败，不阻断业务: {}", e.getMessage()); }
    }

    private void appendBundleStatusHints(Map<String, Object> params, Map<String, Object> result) {
        if (result == null) return;
        try {
            String bundleId = null; String orderId = null;
            Object bundleObj = result.get("cuttingBundle");
            if (bundleObj instanceof CuttingBundle) bundleId = ((CuttingBundle) bundleObj).getId();
            if (!hasText(bundleId)) bundleId = TextUtils.safeText(params.get("cuttingBundleId"));
            Object orderObj = result.get("orderInfo");
            if (orderObj instanceof Map) orderId = TextUtils.safeText(((Map<?, ?>) orderObj).get("id"));
            if (!hasText(orderId)) orderId = TextUtils.safeText(params.get("orderId"));
            if (!hasText(bundleId) || !hasText(orderId)) return;
            List<ScanRecord> records = scanRecordService.list(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId).eq(ScanRecord::getCuttingBundleId, bundleId)
                    .eq(ScanRecord::getScanResult, "success").ne(ScanRecord::getScanType, "orchestration").orderByAsc(ScanRecord::getCreateTime));
            List<ProductWarehousing> whRecords = productWarehousingService.list(new LambdaQueryWrapper<ProductWarehousing>()
                    .eq(ProductWarehousing::getOrderId, orderId).eq(ProductWarehousing::getCuttingBundleId, bundleId)
                    .eq(ProductWarehousing::getDeleteFlag, 0).orderByAsc(ProductWarehousing::getCreateTime));
            List<String> hints = warehousingHelper.buildBundleStageHints(records, whRecords);
            if (!hints.isEmpty()) { result.put("bundleStatusHints", hints); result.put("bundleStatusText", String.join(" → ", hints)); }
        } catch (Exception e) { log.debug("[ScanHints] 菲号状态提示生成失败（不阻断）: {}", e.getMessage()); }
    }

    private boolean hasText(String value) { return value != null && !value.trim().isEmpty(); }

    private void recordScanFeedbackSafely(Map<String, Object> params, Map<String, Object> result) {
        try {
            if (result == null || !Boolean.TRUE.equals(result.get("success"))) return;
            if (scanPrecheckFeedbackOrchestrator == null) return;
            String orderNo = TextUtils.safeText(params.get("orderNo"));
            String scanType = TextUtils.safeText(params.get("scanType"));
            String userAction = "accepted";
            Object precheckWarning = result.get("precheckWarning");
            if (precheckWarning != null && hasText(String.valueOf(precheckWarning))) {
                userAction = "warning_accepted";
            }
            scanPrecheckFeedbackOrchestrator.recordFeedback(orderNo, scanType,
                    Collections.emptyList(), userAction, null);
        } catch (Exception e) {
            log.debug("[ScanFeedback] 扫码预检反馈记录失败（不阻断）: {}", e.getMessage());
        }
    }
}
