package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.common.util.NumberUtils;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.helper.ProductWarehousingQueryHelper;
import com.fashion.supplychain.production.helper.ProductWarehousingRepairHelper;
import com.fashion.supplychain.production.helper.ProductWarehousingRollbackHelper;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.production.util.SpcCalculator;
import com.fashion.supplychain.style.service.ProductSkuService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.service.OrderRemarkService;
import com.fashion.supplychain.websocket.service.WebSocketService;

@Service
@Slf4j
public class ProductWarehousingOrchestrator {

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private ProductWarehousingQueryHelper queryHelper;

    @Autowired
    private ProductWarehousingRepairHelper repairHelper;

    @Autowired
    private ProductWarehousingRollbackHelper rollbackHelper;

    @Autowired
    private OrderRemarkService orderRemarkService;

    @Autowired
    private com.fashion.supplychain.integration.openapi.service.WebhookPushService webhookPushService;

    @Autowired
    private WebSocketService webSocketService;

    public IPage<ProductWarehousing> list(Map<String, Object> params) {
        return queryHelper.list(params);
    }

    /**
     * 获取质检入库统计数据
     */
    public Map<String, Object> getStatusStats(Map<String, Object> params) {
        return queryHelper.getStatusStats(params);
    }


    /**
     * 查询各状态的待处理菲号列表
     * @param status pendingQc(待质检) | pendingPackaging(待包装) | pendingWarehouse(待入库)
     */
    public List<Map<String, Object>> listPendingBundles(String status) {
        return queryHelper.listPendingBundles(status);
    }

    /**
     * 查询指定订单下各菲号的扫码就绪状态
     * 返回：qcReadyQrs（已完成车缝、尚未质检的菲号二维码列表）
     *       warehouseReadyQrs（已质检、尚未入库的菲号二维码列表）
     * 前端用于控制质检/入库页面中哪些菲号可选
     */
    public Map<String, Object> getBundleReadiness(String orderId) {
        return queryHelper.getBundleReadiness(orderId);
    }

    /**
     * 质检简报：返回订单的关键信息、款式BOM、尺寸规格、质检注意事项
     * 供质检详情页右侧面板使用
     */
    public Map<String, Object> getQualityBriefing(String orderId) {
        return queryHelper.getQualityBriefing(orderId);
    }

    public ProductWarehousing getById(String id) {
        return queryHelper.getById(id);
    }

    private void normalizeAndValidateDefectInfo(ProductWarehousing w) {
        if (w == null) {
            return;
        }
        Integer uq = w.getUnqualifiedQuantity();
        String qs = TextUtils.safeText(w.getQualityStatus());
        boolean hasUnqualified = (uq != null && uq > 0) || (qs != null && "unqualified".equalsIgnoreCase(qs));

        if (!hasUnqualified) {
            w.setDefectCategory(null);
            w.setDefectRemark(null);
            return;
        }

        String defectCategory = TextUtils.safeText(w.getDefectCategory());
        String defectRemark = TextUtils.safeText(w.getDefectRemark());

        if (!StringUtils.hasText(defectCategory)) {
            throw new IllegalArgumentException("请选择次品类别");
        }
        if (!StringUtils.hasText(defectRemark)) {
            throw new IllegalArgumentException("请选择次品处理方式");
        }

        if (!("返修".equals(defectRemark) || "报废".equals(defectRemark))) {
            throw new IllegalArgumentException("次品处理方式只能选择：返修/报废");
        }

        boolean okCategory = "appearance_integrity".equals(defectCategory)
                || "size_accuracy".equals(defectCategory)
                || "process_compliance".equals(defectCategory)
                || "functional_effectiveness".equals(defectCategory)
                || "other".equals(defectCategory);
        if (!okCategory) {
            throw new IllegalArgumentException("次品类别不合法");
        }

        w.setDefectCategory(defectCategory);
        w.setDefectRemark(defectRemark);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean save(ProductWarehousing productWarehousing) {
        TenantAssert.assertTenantContext(); // 入库必须有租户上下文
        if (productWarehousing == null) {
            throw new IllegalArgumentException("参数错误");
        }

        // 如果没有orderId但有orderNo，自动查找orderId
        String orderId = StringUtils.hasText(productWarehousing.getOrderId())
                ? productWarehousing.getOrderId().trim()
                : null;
        String orderNo = StringUtils.hasText(productWarehousing.getOrderNo())
                ? productWarehousing.getOrderNo().trim()
                : null;

        if (!StringUtils.hasText(orderId) && StringUtils.hasText(orderNo)) {
            ProductionOrder order = productionOrderService.getByOrderNo(orderNo);
            if (order == null || !StringUtils.hasText(order.getId())) {
                throw new IllegalArgumentException("订单不存在: " + orderNo);
            }
            productWarehousing.setOrderId(order.getId());
            orderId = order.getId();
        }

        // 如果没有cuttingBundleId，尝试通过qrCode或bundleNo查找
        String bundleId = StringUtils.hasText(productWarehousing.getCuttingBundleId())
                ? productWarehousing.getCuttingBundleId().trim()
                : null;
        String bundleQrCode = StringUtils.hasText(productWarehousing.getCuttingBundleQrCode())
                ? productWarehousing.getCuttingBundleQrCode().trim()
                : null;
        Integer bundleNo = productWarehousing.getCuttingBundleNo();

        if (!StringUtils.hasText(bundleId)) {
            CuttingBundle bundle = null;
            // 方式1：通过二维码查找
            if (StringUtils.hasText(bundleQrCode)) {
                bundle = cuttingBundleService.getByQrCode(bundleQrCode);
            }
            // 方式2：通过订单号+菲号序号查找
            if (bundle == null && StringUtils.hasText(orderNo) && bundleNo != null && bundleNo > 0) {
                bundle = cuttingBundleService.lambdaQuery()
                        .eq(CuttingBundle::getProductionOrderNo, orderNo)
                        .eq(CuttingBundle::getBundleNo, bundleNo)
                        .last("LIMIT 1")
                        .one();
            }
            if (bundle != null && StringUtils.hasText(bundle.getId())) {
                productWarehousing.setCuttingBundleId(bundle.getId());
                // 同步填充其他菲号信息
                if (!StringUtils.hasText(bundleQrCode)) {
                    productWarehousing.setCuttingBundleQrCode(bundle.getQrCode());
                }
                if (bundleNo == null || bundleNo <= 0) {
                    productWarehousing.setCuttingBundleNo(bundle.getBundleNo());
                }
            }
        }

        fillOperatorFromContext(productWarehousing);

        normalizeAndValidateDefectInfo(productWarehousing);

        // ★ 菲号已质检拦截：手机端已做质检的菲号，PC端不能再做质检入库，只能做入库操作
        validateBundleNotAlreadyQualityChecked(productWarehousing);

        // ★ 生产前置校验：菲号必须有生产扫码记录才能入库
        validateProductionPrerequisiteForWarehousing(
                productWarehousing.getOrderId(), productWarehousing.getCuttingBundleId());

        boolean ok;
        try {
            ok = productWarehousingService.saveWarehousingAndUpdateOrder(productWarehousing);
        } catch (org.springframework.transaction.UnexpectedRollbackException ure) {
            log.error("save: UnexpectedRollbackException caught — inner REQUIRES_NEW transaction rolled back, " +
                    "propagating as business error: orderId={}, bundleId={}",
                    productWarehousing.getOrderId(), productWarehousing.getCuttingBundleId(), ure);
            throw new IllegalStateException("入库操作失败，请稍后重试（事务冲突）");
        } catch (IllegalArgumentException | IllegalStateException | NoSuchElementException e) {
            throw e;
        } catch (Exception e) {
            log.error("save: unexpected exception from saveWarehousingAndUpdateOrder: orderId={}, bundleId={}",
                    productWarehousing.getOrderId(), productWarehousing.getCuttingBundleId(), e);
            throw new IllegalStateException("入库操作失败：" + e.getMessage());
        }
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        // ★ 成品SKU库存已由 ServiceImpl.saveWarehousingAndUpdateOrderInternal 内部更新，此处不再重复调用

        orderId = StringUtils.hasText(productWarehousing.getOrderId()) ? productWarehousing.getOrderId().trim()
                : null;
        if (StringUtils.hasText(orderId)) {
            try {
                productionOrderOrchestrator.ensureFinanceRecordsForOrder(orderId);
            } catch (Exception e) {
                log.warn("Failed to ensure finance records after warehousing save: orderId={}, warehousingId={}",
                        orderId,
                        productWarehousing == null ? null : productWarehousing.getId(),
                        e);
            }
            try {
                productionOrderService.recomputeProgressFromRecords(orderId);
            } catch (Exception ex) {
                log.warn("save: recomputeProgress失败（不阻断入库）: orderId={}, error={}", orderId, ex.getMessage());
            }

            try {
                computeAndPersistSpcForOrder(orderId);
            } catch (Exception ex) {
                log.warn("[SPC] 入库后Cpk计算失败（不阻断入库）: orderId={}, error={}", orderId, ex.getMessage());
            }
        }

        try {
            String whOrderNo = productWarehousing.getOrderNo() != null ? productWarehousing.getOrderNo() : "";
            String bNo = productWarehousing.getCuttingBundleNo() != null ? String.valueOf(productWarehousing.getCuttingBundleNo()) : "";
            String opName = productWarehousing.getWarehousingOperatorName() != null ? productWarehousing.getWarehousingOperatorName() : "";
            int qty = productWarehousing.getQualifiedQuantity() != null ? productWarehousing.getQualifiedQuantity() : 0;
            String processLabel = qty > 0 && (productWarehousing.getUnqualifiedQuantity() == null || productWarehousing.getUnqualifiedQuantity() <= 0)
                    ? "质检入库" : "质检记录";
            String whOperatorId = productWarehousing.getWarehousingOperatorId() != null ? productWarehousing.getWarehousingOperatorId() : "";
            if (StringUtils.hasText(whOperatorId)) {
                webSocketService.notifyProcessStageCompleted(whOperatorId, whOrderNo, processLabel, opName, bNo, "", "", qty);
            }
        } catch (Exception e) {
            log.debug("save: 工序通知推送失败(不阻断): orderId={}", orderId, e);
        }

        // 自动写入系统备注：质检入库节点
        try {
            if (StringUtils.hasText(productWarehousing.getOrderNo())) {
                int qualified = productWarehousing.getQualifiedQuantity() != null
                        ? productWarehousing.getQualifiedQuantity() : 0;
                int unqualified = productWarehousing.getUnqualifiedQuantity() != null
                        ? productWarehousing.getUnqualifiedQuantity() : 0;
                OrderRemark sysRemark = new OrderRemark();
                sysRemark.setTargetType("order");
                sysRemark.setTargetNo(productWarehousing.getOrderNo());
                sysRemark.setAuthorId("system");
                sysRemark.setAuthorName("系统");
                sysRemark.setAuthorRole("质检");
                sysRemark.setContent("质检入库完成，合格 " + qualified + " 件"
                        + (unqualified > 0 ? "，不合格 " + unqualified + " 件" : ""));
                sysRemark.setTenantId(UserContext.tenantId());
                sysRemark.setCreateTime(LocalDateTime.now());
                sysRemark.setDeleteFlag(0);
                orderRemarkService.save(sysRemark);
            }
        } catch (Exception e) {
            log.warn("自动写入质检入库备注失败，不影响主流程", e);
        }

        try {
            if (webhookPushService != null && StringUtils.hasText(productWarehousing.getOrderNo())) {
                int qualified = productWarehousing.getQualifiedQuantity() != null
                        ? productWarehousing.getQualifiedQuantity() : 0;
                int unqualified = productWarehousing.getUnqualifiedQuantity() != null
                        ? productWarehousing.getUnqualifiedQuantity() : 0;
                webhookPushService.pushQualityResult(
                        productWarehousing.getOrderNo(),
                        "质检入库",
                        qualified,
                        unqualified,
                        Map.of("warehouse", productWarehousing.getWarehouse() != null ? productWarehousing.getWarehouse() : "",
                               "warehousingNo", productWarehousing.getWarehousingNo() != null ? productWarehousing.getWarehousingNo() : ""));
            }
        } catch (Exception e) {
            log.warn("[Webhook] 质检结果推送失败，不影响主流程: {}", e.getMessage());
        }

        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean batchSave(Map<String, Object> body) {
        TenantAssert.assertTenantContext(); // 批量入库必须有租户上下文
        String orderId = body == null ? null : (String) body.get("orderId");
        String warehouse = body == null ? null : (String) body.get("warehouse");
        String warehousingType = body == null ? null : (String) body.get("warehousingType");
        Object itemsRaw = body == null ? null : body.get("items");

        String oid = orderId == null ? null : StringUtils.trimWhitespace(orderId);
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        if (!(itemsRaw instanceof List)) {
            throw new IllegalArgumentException("入库明细不能为空");
        }

        List<?> rawList = (List<?>) itemsRaw;
        List<ProductWarehousing> list = new ArrayList<>();
        for (Object obj : rawList) {
            if (!(obj instanceof Map)) {
                continue;
            }
            Map<?, ?> m = (Map<?, ?>) obj;
            String cuttingBundleQrCode = m.get("cuttingBundleQrCode") == null ? null
                    : String.valueOf(m.get("cuttingBundleQrCode"));
            Integer qty = NumberUtils.toInt(m.get("warehousingQuantity"));
            if (!StringUtils.hasText(cuttingBundleQrCode) || qty == null || qty <= 0) {
                continue;
            }

            ProductWarehousing w = new ProductWarehousing();
            w.setOrderId(oid);
            if (StringUtils.hasText(warehouse)) {
                w.setWarehouse(warehouse);
            }
            w.setWarehousingType(StringUtils.hasText(warehousingType) ? warehousingType : "manual");
            w.setCuttingBundleQrCode(cuttingBundleQrCode);
            w.setWarehousingQuantity(qty);
            w.setQualifiedQuantity(qty);
            w.setUnqualifiedQuantity(0);
            w.setQualityStatus("qualified");
            list.add(w);
        }

        if (list.isEmpty()) {
            throw new IllegalArgumentException("入库明细不能为空");
        }

        // ★ 生产前置校验：批量入库前，检查每个菲号是否都有生产扫码记录
        for (ProductWarehousing w : list) {
            // 通过二维码查找菲号ID
            String bundleId = w.getCuttingBundleId();
            if (!StringUtils.hasText(bundleId) && StringUtils.hasText(w.getCuttingBundleQrCode())) {
                CuttingBundle b = cuttingBundleService.getByQrCode(w.getCuttingBundleQrCode());
                if (b != null) {
                    bundleId = b.getId();
                }
            }
            validateProductionPrerequisiteForWarehousing(oid, bundleId);
        }

        list.forEach(this::fillOperatorFromContext);

        boolean ok;
        try {
            ok = productWarehousingService.saveBatchWarehousingAndUpdateOrder(list);
        } catch (org.springframework.transaction.UnexpectedRollbackException ure) {
            log.error("batchSave: UnexpectedRollbackException caught: orderId={}", oid, ure);
            throw new IllegalStateException("批量入库操作失败，请稍后重试（事务冲突）");
        } catch (IllegalArgumentException | IllegalStateException | NoSuchElementException e) {
            throw e;
        } catch (Exception e) {
            log.error("batchSave: unexpected exception: orderId={}", oid, e);
            throw new IllegalStateException("批量入库操作失败：" + e.getMessage());
        }
        if (!ok) {
            throw new IllegalStateException("批量入库失败");
        }

        // ★ 成品SKU库存已由 ServiceImpl.saveWarehousingAndUpdateOrderInternal 内部更新，此处不再重复调用

        try {
            productionOrderOrchestrator.ensureFinanceRecordsForOrder(oid);
        } catch (Exception e) {
            log.warn("Failed to ensure finance records after warehousing batch save: orderId={}, itemsCount={}",
                    oid,
                    list == null ? 0 : list.size(),
                    e);
            scanRecordDomainService.insertOrchestrationFailure(
                    oid,
                    null,
                    null,
                    null,
                    "ensureFinanceRecords",
                    e == null ? "ensureFinanceRecords failed" : ("ensureFinanceRecords failed: " + e.getMessage()),
                    LocalDateTime.now());
        }
        try {
            productionOrderService.recomputeProgressFromRecords(oid);
        } catch (Exception ex) {
            log.warn("create: recomputeProgress失败: orderId={}, error={}", oid, ex.getMessage());
        }

        // 已禁用系统自动完成
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean update(ProductWarehousing productWarehousing) {
        if (productWarehousing == null || !StringUtils.hasText(productWarehousing.getId())) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductWarehousing current = productWarehousingService.getById(productWarehousing.getId().trim());
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("入库记录不存在");
        }
        com.fashion.supplychain.common.tenant.TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "入库记录");
        normalizeAndValidateDefectInfo(productWarehousing);
        boolean ok;
        try {
            ok = productWarehousingService.updateWarehousingAndUpdateOrder(productWarehousing);
        } catch (org.springframework.transaction.UnexpectedRollbackException ure) {
            log.error("update: UnexpectedRollbackException caught: warehousingId={}", productWarehousing.getId(), ure);
            throw new IllegalStateException("更新入库操作失败，请稍后重试（事务冲突）");
        } catch (IllegalArgumentException | IllegalStateException | NoSuchElementException e) {
            throw e;
        } catch (Exception e) {
            log.error("update: unexpected exception: warehousingId={}", productWarehousing.getId(), e);
            throw new IllegalStateException("更新入库操作失败：" + e.getMessage());
        }
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        // ★ 成品SKU库存已由 ServiceImpl.updateWarehousingAndUpdateOrder 内部处理差量更新，此处不再重复调用

        String orderId = StringUtils.hasText(current.getOrderId()) ? current.getOrderId().trim() : null;
        if (StringUtils.hasText(orderId)) {
            try {
                productionOrderOrchestrator.ensureFinanceRecordsForOrder(orderId);
            } catch (Exception e) {
                log.warn("Failed to ensure finance records after warehousing update: orderId={}, warehousingId={}",
                        orderId,
                        productWarehousing == null ? null : productWarehousing.getId(),
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        orderId,
                        null,
                        null,
                        null,
                        "ensureFinanceRecords",
                        e == null ? "ensureFinanceRecords failed"
                                : ("ensureFinanceRecords failed: " + e.getMessage()),
                        LocalDateTime.now());
            }
            try {
                productionOrderService.recomputeProgressFromRecords(orderId);
            } catch (Exception ex) {
                log.warn("update: recomputeProgress失败: orderId={}, error={}", orderId, ex.getMessage());
            }

            // 已禁用系统自动完成
        }
        return true;
    }

    private void updateSkuStock(ProductWarehousing w, ProductionOrder order, CuttingBundle bundle, int deltaQuantity) {
        if (deltaQuantity == 0) {
            return;
        }
        String styleNo = w.getStyleNo();
        String color = null;
        String size = null;

        if (bundle != null) {
            color = bundle.getColor();
            size = bundle.getSize();
        } else if (StringUtils.hasText(w.getCuttingBundleId())) {
            // bundle 对象未传入，通过 bundleId 加载
            try {
                CuttingBundle b = cuttingBundleService.getById(w.getCuttingBundleId());
                if (b != null) {
                    color = b.getColor();
                    size = b.getSize();
                }
            } catch (Exception e) {
                log.warn("ProductWarehousingOrchestrator.updateSkuStock 加载菲号异常: bundleId={}", w.getCuttingBundleId(), e);
            }
        }
        // QrCode 兜底：bundleId 加载失败（为空或查不到）时，尝试通过 QrCode 加载菲号
        if (!StringUtils.hasText(color) || !StringUtils.hasText(size)) {
            if (StringUtils.hasText(w.getCuttingBundleQrCode())) {
                try {
                    CuttingBundle b = cuttingBundleService.getByQrCode(w.getCuttingBundleQrCode().trim());
                    if (b != null) {
                        color = b.getColor();
                        size = b.getSize();
                    }
                } catch (Exception e) {
                    log.debug("[SKUStock] Orchestrator.updateSkuStock QrCode fallback failed: bundleQrCode={}", w.getCuttingBundleQrCode());
                }
            }
        }
        // ⚠️ 不再使用 order.getColor()/getSize() 兜底：多码订单的 order.size 是单值字段，
        // 用于多码情景会写入错误的 SKU 条目

        if (StringUtils.hasText(styleNo) && StringUtils.hasText(color) && StringUtils.hasText(size)) {
            String skuCode = String.format("%s-%s-%s", styleNo.trim(), color.trim(), size.trim());
            productSkuService.updateStock(skuCode, deltaQuantity);
        } else {
            log.warn("[SKUStock] 无法获取 color/size，跳过 SKU 库存更新: warehousingId={}, styleNo={}, delta={}",
                    w.getId(), styleNo, deltaQuantity);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductWarehousing current = productWarehousingService.getById(key);
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("入库记录不存在");
        }
        com.fashion.supplychain.common.tenant.TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "入库记录");

        String orderId = StringUtils.hasText(current.getOrderId()) ? current.getOrderId().trim() : null;

        if (current.getQualifiedQuantity() != null && current.getQualifiedQuantity() > 0) {
            CuttingBundle bundleForDelete = null;
            if (StringUtils.hasText(current.getCuttingBundleId())) {
                try {
                    bundleForDelete = cuttingBundleService.getById(current.getCuttingBundleId());
                } catch (Exception e) {
                    log.warn("ProductWarehousingOrchestrator.delete 加载菲号异常: bundleId={}", current.getCuttingBundleId(), e);
                }
            }
            if (bundleForDelete == null && StringUtils.hasText(current.getCuttingBundleQrCode())) {
                try {
                    bundleForDelete = cuttingBundleService.getByQrCode(current.getCuttingBundleQrCode().trim());
                } catch (Exception e) {
                    log.debug("[SKUStock删除] QrCode fallback failed: bundleQrCode={}", current.getCuttingBundleQrCode());
                }
            }
            if (bundleForDelete != null) {
                updateSkuStock(current, null, bundleForDelete, -current.getQualifiedQuantity());
            } else {
                log.error("[SKUStock删除] 无法加载菲号，SKU库存无法自动恢复，需人工修复: warehousingId={}, bundleId={}, bundleQrCode={}",
                        key, current.getCuttingBundleId(), current.getCuttingBundleQrCode());
            }
        }

        boolean ok = productWarehousingService.removeById(key);

        if (StringUtils.hasText(orderId)) {
            try {
                int qualifiedSum = productWarehousingService.sumQualifiedByOrderId(orderId);
                ProductionOrder orderPatch = new ProductionOrder();
                orderPatch.setId(orderId);
                orderPatch.setCompletedQuantity(qualifiedSum);
                orderPatch.setUpdateTime(LocalDateTime.now());
                productionOrderService.updateById(orderPatch);
            } catch (Exception e) {
                log.warn(
                        "Failed to update production order completed quantity after warehousing delete: orderId={}, warehousingId={}",
                        orderId,
                        key,
                        e);
            }

            try {
                productionOrderOrchestrator.ensureFinanceRecordsForOrder(orderId);
            } catch (Exception e) {
                log.warn("Failed to ensure finance records after warehousing delete: orderId={}, warehousingId={}",
                        orderId,
                        key,
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        orderId,
                        null,
                        null,
                        null,
                        "ensureFinanceRecords",
                        e == null ? "ensureFinanceRecords failed"
                                : ("ensureFinanceRecords failed: " + e.getMessage()),
                        LocalDateTime.now());
            }

            try {
                productionOrderService.recomputeProgressFromRecords(orderId);
            } catch (Exception e) {
                log.warn("Failed to recompute progress after warehousing delete: orderId={}, warehousingId={}",
                        orderId,
                        key,
                        e);
            }
        }
        return true;
    }

    public Map<String, Object> repairStats(Map<String, Object> params) {
        return repairHelper.repairStats(params);
    }

    public Map<String, Object> batchRepairStats(Map<String, Object> body) {
        return repairHelper.batchRepairStats(body);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean rollbackByBundle(Map<String, Object> body) {
        return rollbackHelper.rollbackByBundle(body);
    }

    /**
     * 验证质检前置条件：该菲号必须有生产扫码记录才能进行质检入库
     * 业务规则：车缝等生产工序完成 → 质检（合格/不合格）→ 包装 → 入库
     * PC端质检入库接口（save/batchSave）使用此校验，不检查包装（包装在质检之后）
     * ⚠️ 小程序仓库扫码入库使用 WarehouseScanExecutor.validateProductionPrerequisite，
     *    那里才需要检查包装完成。两个校验职责不同，请勿混淆。
     */
    private void validateProductionPrerequisiteForWarehousing(String orderId, String bundleId) {
        if (!StringUtils.hasText(orderId) || !StringUtils.hasText(bundleId)) {
            return;
        }
        try {
            long productionCount = scanRecordService.count(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId)
                    .eq(ScanRecord::getCuttingBundleId, bundleId)
                    .eq(ScanRecord::getScanType, "production")
                    .eq(ScanRecord::getScanResult, "success"));
            if (productionCount <= 0) {
                throw new IllegalStateException("温馨提示：该菲号还未完成生产扫码哦～请先完成车缝等生产工序后再质检");
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("检查质检前置条件失败: orderId={}, bundleId={}", orderId, bundleId, e);
        }
    }

    private void validateBundleNotAlreadyQualityChecked(ProductWarehousing productWarehousing) {
        String bundleId = StringUtils.hasText(productWarehousing.getCuttingBundleId())
                ? productWarehousing.getCuttingBundleId().trim() : null;
        String orderId = StringUtils.hasText(productWarehousing.getOrderId())
                ? productWarehousing.getOrderId().trim() : null;
        if (!StringUtils.hasText(bundleId) || !StringUtils.hasText(orderId)) {
            return;
        }
        try {
            long qualityScanCount = productWarehousingService.count(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getOrderId, orderId)
                            .eq(ProductWarehousing::getCuttingBundleId, bundleId)
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .eq(ProductWarehousing::getWarehousingType, "quality_scan")
                            .eq(ProductWarehousing::getQualityStatus, "qualified"));
            if (qualityScanCount > 0) {
                throw new IllegalStateException("该菲号已在手机端完成质检，PC端不能再做质检入库。请直接在入库操作中分配仓库。");
            }
            long manualQualifiedCount = productWarehousingService.count(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .eq(ProductWarehousing::getOrderId, orderId)
                            .eq(ProductWarehousing::getCuttingBundleId, bundleId)
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .in(ProductWarehousing::getWarehousingType, "manual", "scan")
                            .eq(ProductWarehousing::getQualityStatus, "qualified"));
            if (manualQualifiedCount > 0) {
                throw new IllegalStateException("该菲号已完成质检入库，不能重复操作");
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("检查菲号质检状态失败: orderId={}, bundleId={}", orderId, bundleId, e);
        }
    }

    public List<Map<String, Object>> listPendingRepairTasks(Long tenantId) {
        return repairHelper.listPendingRepairTasks(tenantId);
    }


    @org.springframework.transaction.annotation.Transactional(rollbackFor = Exception.class)
    public boolean markBundleRepaired(String bundleId) {
        return repairHelper.markBundleRepaired(bundleId);
    }

    @org.springframework.transaction.annotation.Transactional(rollbackFor = Exception.class)
    public void startBundleRepair(String bundleId, String operatorName) {
        repairHelper.startBundleRepair(bundleId, operatorName);
    }

    @org.springframework.transaction.annotation.Transactional(rollbackFor = Exception.class)
    public void completeBundleRepair(String bundleId) {
        repairHelper.completeBundleRepair(bundleId);
    }

    @org.springframework.transaction.annotation.Transactional(rollbackFor = Exception.class)
    public void scrapBundle(String bundleId) {
        repairHelper.scrapBundle(bundleId);
    }

    private void fillOperatorFromContext(ProductWarehousing w) {
        String userId = UserContext.userId();
        String username = UserContext.username();
        if (!StringUtils.hasText(userId)) return;
        if (!StringUtils.hasText(w.getWarehousingOperatorId())) {
            w.setWarehousingOperatorId(userId);
            w.setWarehousingOperatorName(username);
        }
        if (!StringUtils.hasText(w.getQualityOperatorId())) {
            w.setQualityOperatorId(userId);
            w.setQualityOperatorName(username);
        }
        if (!StringUtils.hasText(w.getReceiverId())) {
            w.setReceiverId(userId);
            w.setReceiverName(username);
        }
    }

    private void computeAndPersistSpcForOrder(String orderId) {
        List<ProductWarehousing> records = productWarehousingService.lambdaQuery()
                .select(ProductWarehousing::getId, ProductWarehousing::getQualifiedQuantity,
                        ProductWarehousing::getUnqualifiedQuantity, ProductWarehousing::getAqlLevel)
                .eq(ProductWarehousing::getOrderId, orderId)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .last("LIMIT 200")
                .list();
        if (records == null || records.size() < 2) return;

        List<Double> defectRates = new ArrayList<>();
        for (ProductWarehousing w : records) {
            int total = (w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0)
                      + (w.getUnqualifiedQuantity() != null ? w.getUnqualifiedQuantity() : 0);
            if (total > 0) {
                int defective = w.getUnqualifiedQuantity() != null ? w.getUnqualifiedQuantity() : 0;
                defectRates.add((double) defective / total * 100);
            }
        }
        if (defectRates.size() < 2) return;

        java.math.BigDecimal cpk = SpcCalculator.calcCpk(defectRates, 5.0, 0.0);
        java.math.BigDecimal ppk = SpcCalculator.calcPpk(defectRates, 5.0, 0.0);

        productWarehousingService.lambdaUpdate()
                .eq(ProductWarehousing::getOrderId, orderId)
                .eq(ProductWarehousing::getDeleteFlag, 0)
                .set(ProductWarehousing::getCpk, cpk)
                .set(ProductWarehousing::getPpk, ppk)
                .update();

        log.info("[SPC] orderId={}, records={}, cpk={}, ppk={}", orderId, records.size(), cpk, ppk);
    }
}
