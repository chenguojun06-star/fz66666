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

        // ★ 生产前置校验：菲号必须有生产扫码记录才能入库
        validateProductionPrerequisiteForWarehousing(
                productWarehousing.getOrderId(), productWarehousing.getCuttingBundleId());

        boolean ok = productWarehousingService.saveWarehousingAndUpdateOrder(productWarehousing);
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

            // 已禁用系统自动完成
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

        boolean ok = productWarehousingService.saveBatchWarehousingAndUpdateOrder(list);
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
        normalizeAndValidateDefectInfo(productWarehousing);
        boolean ok = productWarehousingService.updateWarehousingAndUpdateOrder(productWarehousing);
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
            } catch (Exception ignored) {
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

        String orderId = StringUtils.hasText(current.getOrderId()) ? current.getOrderId().trim() : null;

        boolean ok = productWarehousingService.removeById(key);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }

        // Decrement Stock
        if (current.getQualifiedQuantity() != null && current.getQualifiedQuantity() > 0) {
            // 必须加载菲号才能知道 color/size，否则无法回滚正确的 SKU 库存
            CuttingBundle bundleForDelete = null;
            if (StringUtils.hasText(current.getCuttingBundleId())) {
                try {
                    bundleForDelete = cuttingBundleService.getById(current.getCuttingBundleId());
                } catch (Exception ignored) {}
            }
            if (bundleForDelete != null) {
                updateSkuStock(current, null, bundleForDelete, -current.getQualifiedQuantity());
            } else {
                log.warn("[SKUStock删除] 无法加载菲号，SKU库存不还原: warehousingId={}, bundleId={}",
                        key, current.getCuttingBundleId());
            }
        }

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
            // 基础检查：至少有生产扫码记录（车缝等子工序完成即可做质检）
            long productionCount = scanRecordService.count(new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId)
                    .eq(ScanRecord::getCuttingBundleId, bundleId)
                    .eq(ScanRecord::getScanType, "production")
                    .eq(ScanRecord::getScanResult, "success"));
            if (productionCount <= 0) {
                throw new IllegalStateException("温馨提示：该菲号还未完成生产扫码哦～请先完成车缝等生产工序后再质检");
            }
            // ✅ 不检查包装：质检操作在包装之前，车缝子工序扫码完成即可质检
            // ✅ 包装检查仅在 WarehouseScanExecutor（小程序入库扫码）中执行
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("检查质检前置条件失败: orderId={}, bundleId={}", orderId, bundleId, e);
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
}
