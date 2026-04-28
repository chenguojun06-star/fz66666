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
import com.fashion.supplychain.production.helper.ProductWarehousingPendingHelper;
import com.fashion.supplychain.production.helper.ProductWarehousingRepairHelper;
import com.fashion.supplychain.production.helper.ProductWarehousingRollbackHelper;
import com.fashion.supplychain.production.helper.ProductWarehousingPostActionHelper;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.service.ProductSkuService;
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
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private ProductWarehousingQueryHelper queryHelper;

    @Autowired
    private ProductWarehousingPendingHelper pendingHelper;

    @Autowired
    private ProductWarehousingRepairHelper repairHelper;

    @Autowired
    private ProductWarehousingRollbackHelper rollbackHelper;

    @Autowired
    private ProductWarehousingPostActionHelper postActionHelper;

    public IPage<ProductWarehousing> list(Map<String, Object> params) {
        return queryHelper.list(params);
    }

    public Map<String, Object> getStatusStats(Map<String, Object> params) {
        return queryHelper.getStatusStats(params);
    }

    public List<Map<String, Object>> listPendingBundles(String status) {
        return pendingHelper.listPendingBundles(status);
    }

    public Map<String, Object> getBundleReadiness(String orderId) {
        return pendingHelper.getBundleReadiness(orderId);
    }

    public Map<String, Object> getQualityBriefing(String orderId) {
        return pendingHelper.getQualityBriefing(orderId);
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
        TenantAssert.assertTenantContext();
        if (productWarehousing == null) {
            throw new IllegalArgumentException("参数错误");
        }

        resolveOrderAndBundle(productWarehousing);
        fillOperatorFromContext(productWarehousing);
        normalizeAndValidateDefectInfo(productWarehousing);
        validateBundleNotAlreadyQualityChecked(productWarehousing);
        validateProductionPrerequisiteForWarehousing(
                productWarehousing.getOrderId(), productWarehousing.getCuttingBundleId());

        executeSaveWarehousing(productWarehousing);

        String orderId = StringUtils.hasText(productWarehousing.getOrderId())
                ? productWarehousing.getOrderId().trim() : null;
        postActionHelper.triggerPostSaveActions(orderId, productWarehousing);

        return true;
    }

    private void resolveOrderAndBundle(ProductWarehousing w) {
        String orderId = StringUtils.hasText(w.getOrderId()) ? w.getOrderId().trim() : null;
        String orderNo = StringUtils.hasText(w.getOrderNo()) ? w.getOrderNo().trim() : null;

        if (!StringUtils.hasText(orderId) && StringUtils.hasText(orderNo)) {
            ProductionOrder order = productionOrderService.getByOrderNo(orderNo);
            if (order == null || !StringUtils.hasText(order.getId())) {
                throw new IllegalArgumentException("订单不存在: " + orderNo);
            }
            w.setOrderId(order.getId());
            orderId = order.getId();
        }

        String bundleId = StringUtils.hasText(w.getCuttingBundleId()) ? w.getCuttingBundleId().trim() : null;
        String bundleQrCode = StringUtils.hasText(w.getCuttingBundleQrCode()) ? w.getCuttingBundleQrCode().trim() : null;
        Integer bundleNo = w.getCuttingBundleNo();

        if (!StringUtils.hasText(bundleId)) {
            CuttingBundle bundle = null;
            if (StringUtils.hasText(bundleQrCode)) {
                bundle = cuttingBundleService.getByQrCode(bundleQrCode);
            }
            if (bundle == null && StringUtils.hasText(orderNo) && bundleNo != null && bundleNo > 0) {
                bundle = cuttingBundleService.lambdaQuery()
                        .eq(CuttingBundle::getProductionOrderNo, orderNo)
                        .eq(CuttingBundle::getBundleNo, bundleNo)
                        .last("LIMIT 1")
                        .one();
            }
            if (bundle != null && StringUtils.hasText(bundle.getId())) {
                w.setCuttingBundleId(bundle.getId());
                if (!StringUtils.hasText(bundleQrCode)) {
                    w.setCuttingBundleQrCode(bundle.getQrCode());
                }
                if (bundleNo == null || bundleNo <= 0) {
                    w.setCuttingBundleNo(bundle.getBundleNo());
                }
            }
        }
    }

    private void executeSaveWarehousing(ProductWarehousing w) {
        boolean ok;
        try {
            ok = productWarehousingService.saveWarehousingAndUpdateOrder(w);
        } catch (org.springframework.transaction.UnexpectedRollbackException ure) {
            log.error("save: UnexpectedRollbackException caught — inner REQUIRES_NEW transaction rolled back, " +
                    "propagating as business error: orderId={}, bundleId={}",
                    w.getOrderId(), w.getCuttingBundleId(), ure);
            throw new IllegalStateException("入库操作失败，请稍后重试（事务冲突）");
        } catch (IllegalArgumentException | IllegalStateException | NoSuchElementException e) {
            throw e;
        } catch (Exception e) {
            log.error("save: unexpected exception from saveWarehousingAndUpdateOrder: orderId={}, bundleId={}",
                    w.getOrderId(), w.getCuttingBundleId(), e);
            throw new IllegalStateException("入库操作失败：" + e.getMessage());
        }
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean batchSave(Map<String, Object> body) {
        TenantAssert.assertTenantContext();
        String oid = resolveBatchOrderId(body);
        List<ProductWarehousing> list = parseBatchItems(body, oid);

        validateBatchPrerequisites(oid, list);
        list.forEach(this::fillOperatorFromContext);

        executeBatchSaveWarehousing(list);

        postActionHelper.triggerPostBatchSaveActions(oid, list.size());
        return true;
    }

    private String resolveBatchOrderId(Map<String, Object> body) {
        String orderId = body == null ? null : (String) body.get("orderId");
        String oid = orderId == null ? null : StringUtils.trimWhitespace(orderId);
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        return oid;
    }

    private List<ProductWarehousing> parseBatchItems(Map<String, Object> body, String oid) {
        String warehouse = body == null ? null : (String) body.get("warehouse");
        String warehousingType = body == null ? null : (String) body.get("warehousingType");
        Object itemsRaw = body == null ? null : body.get("items");

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
        return list;
    }

    private void validateBatchPrerequisites(String oid, List<ProductWarehousing> list) {
        for (ProductWarehousing w : list) {
            String bundleId = w.getCuttingBundleId();
            if (!StringUtils.hasText(bundleId) && StringUtils.hasText(w.getCuttingBundleQrCode())) {
                CuttingBundle b = cuttingBundleService.getByQrCode(w.getCuttingBundleQrCode());
                if (b != null) {
                    bundleId = b.getId();
                }
            }
            validateProductionPrerequisiteForWarehousing(oid, bundleId);
        }
    }

    private void executeBatchSaveWarehousing(List<ProductWarehousing> list) {
        boolean ok;
        try {
            ok = productWarehousingService.saveBatchWarehousingAndUpdateOrder(list);
        } catch (org.springframework.transaction.UnexpectedRollbackException ure) {
            log.error("batchSave: UnexpectedRollbackException caught", ure);
            throw new IllegalStateException("批量入库操作失败，请稍后重试（事务冲突）");
        } catch (IllegalArgumentException | IllegalStateException | NoSuchElementException e) {
            throw e;
        } catch (Exception e) {
            log.error("batchSave: unexpected exception", e);
            throw new IllegalStateException("批量入库操作失败：" + e.getMessage());
        }
        if (!ok) {
            throw new IllegalStateException("批量入库失败");
        }
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
        TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "入库记录");
        normalizeAndValidateDefectInfo(productWarehousing);

        executeUpdateWarehousing(productWarehousing);

        String orderId = StringUtils.hasText(current.getOrderId()) ? current.getOrderId().trim() : null;
        postActionHelper.triggerPostUpdateActions(orderId, productWarehousing.getId());
        return true;
    }

    private void executeUpdateWarehousing(ProductWarehousing w) {
        boolean ok;
        try {
            ok = productWarehousingService.updateWarehousingAndUpdateOrder(w);
        } catch (org.springframework.transaction.UnexpectedRollbackException ure) {
            log.error("update: UnexpectedRollbackException caught: warehousingId={}", w.getId(), ure);
            throw new IllegalStateException("更新入库操作失败，请稍后重试（事务冲突）");
        } catch (IllegalArgumentException | IllegalStateException | NoSuchElementException e) {
            throw e;
        } catch (Exception e) {
            log.error("update: unexpected exception: warehousingId={}", w.getId(), e);
            throw new IllegalStateException("更新入库操作失败：" + e.getMessage());
        }
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
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
        TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "入库记录");

        String orderId = StringUtils.hasText(current.getOrderId()) ? current.getOrderId().trim() : null;

        restoreSkuStockOnDelete(current);
        productWarehousingService.removeById(key);

        postActionHelper.updateOrderCompletedQuantity(orderId);
        postActionHelper.triggerPostDeleteActions(orderId, key);
        return true;
    }

    private void restoreSkuStockOnDelete(ProductWarehousing current) {
        if (current.getQualifiedQuantity() == null || current.getQualifiedQuantity() <= 0) {
            return;
        }
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
                    current.getId(), current.getCuttingBundleId(), current.getCuttingBundleQrCode());
        }
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

    @Transactional(rollbackFor = Exception.class)
    public boolean markBundleRepaired(String bundleId) {
        return repairHelper.markBundleRepaired(bundleId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void startBundleRepair(String bundleId, String operatorName) {
        repairHelper.startBundleRepair(bundleId, operatorName);
    }

    @Transactional(rollbackFor = Exception.class)
    public void completeBundleRepair(String bundleId) {
        repairHelper.completeBundleRepair(bundleId);
    }

    @Transactional(rollbackFor = Exception.class)
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
