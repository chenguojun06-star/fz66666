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
import com.fashion.supplychain.production.helper.DuplicateScanPreventer;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import org.springframework.util.StringUtils;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 扫码记录编排器
 * 职责：扫码业务编排（生产/质检/入库）、撤销/退回重扫、事务管理
 *
 * 辅助类：
 * - ProcessStageDetector（工序识别）
 * - DuplicateScanPreventer（防重复）
 * - InventoryValidator（库存验证）
 * - ScanRecordQueryHelper（查询操作）
 * - UnitPriceResolver（单价解析）
 *
 * 执行器：
 * - QualityScanExecutor / WarehouseScanExecutor / ProductionScanExecutor
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
    private CuttingTaskService cuttingTaskService;

    @Autowired
    private ProductWarehousingOrchestrator productWarehousingOrchestrator;

    @Autowired
    private DuplicateScanPreventer duplicateScanPreventer;

    @Autowired
    private com.fashion.supplychain.production.helper.ScanRecordQueryHelper scanRecordQueryHelper;

    @Autowired
    private com.fashion.supplychain.production.helper.UnitPriceResolver unitPriceResolver;

    @Autowired
    private com.fashion.supplychain.production.executor.QualityScanExecutor qualityScanExecutor;

    @Autowired
    private com.fashion.supplychain.production.executor.WarehouseScanExecutor warehouseScanExecutor;

    @Autowired
    private com.fashion.supplychain.production.executor.ProductionScanExecutor productionScanExecutor;

    @Autowired
    private QrCodeSigner qrCodeSigner;

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> execute(Map<String, Object> params) {
        TenantAssert.assertTenantContext(); // 扫码必须有租户上下文
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

        // 二维码 HMAC 签名验证（防伪造）
        if (hasText(scanCode)) {
            QrCodeSigner.VerifyResult sigResult = qrCodeSigner.verify(scanCode);
            if (sigResult.isInvalid()) {
                throw new IllegalArgumentException(sigResult.getMessage());
            }
            // 签名有效或无签名（旧QR码向后兼容），继续处理
        }

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

        boolean autoProcess = false;
        Integer qty = NumberUtils.toInt(safeParams.get("quantity"));
        if ("sewing".equals(scanType)) {
            scanType = "production";
            autoProcess = true;
        }

        // 质检扫码路由
        if ("quality".equals(scanType)) {
            return executeQualityScan(safeParams, requestId, operatorId, operatorName);
        }

        // 入库扫码路由
        if ("warehouse".equals(scanType)) {
            return executeWarehouseScan(safeParams, requestId, operatorId, operatorName);
        }

        return executeProductionScan(safeParams, requestId, operatorId, operatorName, scanType, qty, autoProcess);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> undo(Map<String, Object> params) {
        TenantAssert.assertTenantContext(); // 撤销扫码必须有租户上下文
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

        // 工资已结算的扫码记录禁止撤回
        if (StringUtils.hasText(target.getPayrollSettlementId())) {
            throw new IllegalStateException("该扫码记录已参与工资结算，无法撤回");
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

            // 标记扫码记录为已撤销
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
     * 退回重扫 - 仅允许退回1小时内的、当前用户的、成功的扫码记录
     * 小程序"退回重扫"功能调用此方法
     *
     * @param params { recordId: 扫码记录ID }
     * @return { success: true, message: "退回成功" }
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> rescan(Map<String, Object> params) {
        TenantAssert.assertTenantContext(); // 重新扫码必须有租户上下文
        String recordId = TextUtils.safeText(params == null ? null : params.get("recordId"));
        if (!hasText(recordId)) {
            throw new IllegalArgumentException("记录ID不能为空");
        }

        // 查找扫码记录
        ScanRecord target = scanRecordService.getById(recordId);
        if (target == null) {
            throw new IllegalStateException("未找到扫码记录");
        }

        // 校验是否属于当前用户
        UserContext ctx = UserContext.get();
        String currentUserId = ctx == null ? null : ctx.getUserId();
        if (!hasText(currentUserId) || !currentUserId.equals(target.getOperatorId())) {
            throw new AccessDeniedException("只能退回自己的扫码记录");
        }

        // 校验记录状态
        if (!"success".equalsIgnoreCase(target.getScanResult()) && !"qualified".equalsIgnoreCase(target.getScanResult())) {
            throw new IllegalStateException("只能退回成功的扫码记录");
        }

        // 工资已结算的扫码记录禁止退回重扫
        if (StringUtils.hasText(target.getPayrollSettlementId())) {
            throw new IllegalStateException("该扫码记录已参与工资结算，无法退回重扫");
        }

        // 校验1小时时间限制
        LocalDateTime scanTime = target.getScanTime() != null ? target.getScanTime() : target.getCreateTime();
        if (scanTime != null && scanTime.plusHours(1).isBefore(LocalDateTime.now())) {
            throw new IllegalStateException("只能退回1小时内的扫码记录");
        }

        // 判断是否为入库类型扫码，需要同时回滚入库记录
        String scanType = hasText(target.getScanType()) ? target.getScanType().trim().toLowerCase() : "";
        boolean isWarehouseType = "warehouse".equals(scanType) || "quality".equals(scanType)
                || "quality_warehousing".equalsIgnoreCase(target.getProcessCode());

        if (isWarehouseType) {
            // 回滚入库记录
            String qr = hasText(target.getCuttingBundleQrCode()) ? target.getCuttingBundleQrCode()
                    : target.getScanCode();
            int qty = target.getQuantity() != null ? target.getQuantity() : 0;
            if (hasText(qr) && qty > 0) {
                try {
                    Map<String, Object> body = new HashMap<>();
                    body.put("orderId", target.getOrderId());
                    body.put("cuttingBundleQrCode", qr);
                    body.put("rollbackQuantity", qty);
                    body.put("rollbackRemark", "退回重扫");
                    productWarehousingOrchestrator.rollbackByBundle(body);
                } catch (Exception e) {
                    log.error("[rescan] 入库回滚失败: recordId={}", recordId, e);
                    throw new IllegalStateException("入库回滚失败，无法退回重扫: " + e.getMessage(), e);
                }
            }
        }

        // 判断是否为裁剪类型扫码（CUTTING_BUNDLED 记录），需要回滚裁剪菲号和任务状态
        String reqId = hasText(target.getRequestId()) ? target.getRequestId().trim() : "";
        boolean isCuttingBundled = reqId.startsWith("CUTTING_BUNDLED:");
        boolean isCuttingType = "cutting".equals(scanType)
                || "裁剪".equals(hasText(target.getProgressStage()) ? target.getProgressStage().trim() : "");

        if (isCuttingBundled || isCuttingType) {
            String oid = TextUtils.safeText(target.getOrderId());
            if (hasText(oid)) {
                try {
                    // 删除该订单的所有裁剪菲号数据
                    cuttingBundleService.remove(new LambdaQueryWrapper<CuttingBundle>()
                            .eq(CuttingBundle::getProductionOrderId, oid));
                    log.info("[rescan] 已删除裁剪菲号: orderId={}", oid);

                    // 将裁剪任务状态从 bundled 退回到 received（保留领取人信息）
                    CuttingTask cuttingTask = cuttingTaskService.getOne(new LambdaQueryWrapper<CuttingTask>()
                            .eq(CuttingTask::getProductionOrderId, oid)
                            .last("limit 1"));
                    if (cuttingTask != null && "bundled".equalsIgnoreCase(cuttingTask.getStatus())) {
                        cuttingTask.setStatus("received");
                        cuttingTask.setBundledTime(null);
                        cuttingTask.setUpdateTime(LocalDateTime.now());
                        cuttingTaskService.updateById(cuttingTask);
                        log.info("[rescan] 裁剪任务状态已退回到received: taskId={}, orderId={}", cuttingTask.getId(), oid);
                    }
                } catch (Exception e) {
                    log.warn("[rescan] 裁剪数据回滚失败，继续撤销扫码记录: recordId={}, error={}", recordId, e.getMessage());
                }
            }
        }

        // 标记扫码记录为已撤销
        ScanRecord patch = new ScanRecord();
        patch.setId(target.getId());
        patch.setScanResult("failure");
        patch.setRemark("退回重扫");
        patch.setUpdateTime(LocalDateTime.now());
        scanRecordService.updateById(patch);

        // 异步重算订单进度
        String orderId = TextUtils.safeText(target.getOrderId());
        if (hasText(orderId)) {
            productionOrderService.recomputeProgressAsync(orderId);
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("success", true);
        resp.put("message", "退回成功，可重新扫码");
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

    public Map<String, Object> resolveUnitPrice(Map<String, Object> params) {
        return unitPriceResolver.resolveUnitPrice(params);
    }

    public IPage<ScanRecord> list(Map<String, Object> params) {
        IPage<ScanRecord> page = scanRecordQueryHelper.list(params);
        enrichBedNo(page.getRecords());
        return page;
    }

    /**
     * 批量填充床号：从 t_cutting_bundle 查询 bedNo 并写入扫码记录
     */
    private void enrichBedNo(List<ScanRecord> records) {
        if (records == null || records.isEmpty()) return;
        List<String> bundleIds = records.stream()
                .map(ScanRecord::getCuttingBundleId)
                .filter(id -> id != null && !id.isEmpty())
                .distinct()
                .collect(java.util.stream.Collectors.toList());
        if (bundleIds.isEmpty()) return;
        Map<String, Integer> bedNoMap = cuttingBundleService.listByIds(bundleIds)
                .stream()
                .filter(b -> b.getBedNo() != null)
                .collect(java.util.stream.Collectors.toMap(
                        CuttingBundle::getId,
                        CuttingBundle::getBedNo,
                        (a, b) -> a));
        records.forEach(r -> {
            if (r.getCuttingBundleId() != null) {
                r.setBedNo(bedNoMap.get(r.getCuttingBundleId()));
            }
        });
    }

    public IPage<ScanRecord> getByOrderId(String orderId, int page, int pageSize) {
        return scanRecordQueryHelper.getByOrderId(orderId, page, pageSize);
    }

    public IPage<ScanRecord> getByStyleNo(String styleNo, int page, int pageSize) {
        return scanRecordQueryHelper.getByStyleNo(styleNo, page, pageSize);
    }

    public IPage<ScanRecord> getHistory(int page, int pageSize) {
        return scanRecordQueryHelper.getHistory(page, pageSize);
    }

    public IPage<ScanRecord> getMyHistory(int page, int pageSize, String scanType, String startTime, String endTime,
            String orderNo, String bundleNo, String workerName, String operatorName) {
        return scanRecordQueryHelper.getMyHistory(page, pageSize, scanType, startTime, endTime,
                orderNo, bundleNo, workerName, operatorName);
    }

    public List<ScanRecord> getMyQualityTasks() {
        return scanRecordQueryHelper.getMyQualityTasks();
    }

    public Map<String, Object> getPersonalStats(String scanType) {
        return getPersonalStats(scanType, null);
    }

    public Map<String, Object> getPersonalStats(String scanType, String period) {
        return scanRecordQueryHelper.getPersonalStats(scanType, period);
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
