package com.fashion.supplychain.production.orchestration;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.stream.Collectors;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.production.helper.MaterialPurchasePickingHelper;
import com.fashion.supplychain.production.helper.MaterialPurchaseQueryHelper;
import com.fashion.supplychain.production.helper.MaterialPurchaseStatusHelper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 面辅料采购编排器（瘦身版）
 * <p>
 * 状态流转逻辑 → {@link MaterialPurchaseStatusHelper}
 * 出库/拣货逻辑 → {@link MaterialPurchasePickingHelper}
 * 查询/统计逻辑 → {@link MaterialPurchaseQueryHelper}
 */
@Service
@Slf4j
public class MaterialPurchaseOrchestrator {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private MaterialReconciliationOrchestrator materialReconciliationOrchestrator;

    @Autowired
    private MaterialPurchaseOrchestratorHelper helper;

    @Autowired
    private MaterialPurchasePickingHelper pickingHelper;

    @Autowired
    private MaterialPurchaseStatusHelper statusHelper;

    @Autowired
    private MaterialPurchaseQueryHelper queryHelper;

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    // ── Query ───────────────────────────────────────────────

    public IPage<MaterialPurchase> list(Map<String, Object> params) {
        // PC端默认隔离：未指定工厂类型时，跟单员/管理员只查内部工厂采购记录
        Map<String, Object> effectiveParams = params != null ? params : new java.util.HashMap<>();
        String factoryType = String.valueOf(effectiveParams.getOrDefault("factoryType", "")).trim();
        if (!StringUtils.hasText(factoryType) && !DataPermissionHelper.isFactoryAccount()) {
            effectiveParams = new java.util.HashMap<>(effectiveParams);
            effectiveParams.put("factoryType", "INTERNAL");
        }
        return materialPurchaseService.queryPage(effectiveParams);
    }

    public Map<String, Object> listWithEnrichment(Map<String, Object> params) {
        return helper.listWithEnrichment(params);
    }

    public MaterialPurchase getById(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        MaterialPurchase purchase = materialPurchaseService.getById(key);
        if (purchase == null || (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }
        return purchase;
    }

    // ── Write ───────────────────────────────────────────────

    public boolean save(MaterialPurchase materialPurchase) {
        if (materialPurchase == null) {
            throw new IllegalArgumentException("参数错误");
        }
        boolean ok = saveAndSync(materialPurchase);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    public boolean update(MaterialPurchase materialPurchase) {
        if (materialPurchase == null || !StringUtils.hasText(materialPurchase.getId())) {
            throw new IllegalArgumentException("参数错误");
        }
        MaterialPurchase current = materialPurchaseService.getById(materialPurchase.getId().trim());
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }
        boolean ok = updateAndSync(materialPurchase);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    public boolean batch(List<MaterialPurchase> purchases) {
        if (purchases == null || purchases.isEmpty()) {
            throw new IllegalArgumentException("采购明细不能为空");
        }
        // 从物料资料库补全缺失属性（颜色/规格/幅宽/克重/成分），确保仓库批量采购也能显示完整物料信息
        List<String> matCodes = purchases.stream()
                .map(MaterialPurchase::getMaterialCode)
                .filter(org.springframework.util.StringUtils::hasText)
                .distinct()
                .collect(Collectors.toList());
        if (!matCodes.isEmpty()) {
            Map<String, MaterialDatabase> dbMap = materialDatabaseService.list(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialDatabase>()
                            .in(MaterialDatabase::getMaterialCode, matCodes))
                    .stream()
                    .filter(d -> d != null && org.springframework.util.StringUtils.hasText(d.getMaterialCode()))
                    .collect(Collectors.toMap(MaterialDatabase::getMaterialCode, d -> d, (a, b) -> a));
            for (MaterialPurchase p : purchases) {
                MaterialDatabase db = dbMap.get(p.getMaterialCode());
                if (db == null) continue;
                if (!org.springframework.util.StringUtils.hasText(p.getColor()) && org.springframework.util.StringUtils.hasText(db.getColor())) p.setColor(db.getColor());
                if (!org.springframework.util.StringUtils.hasText(p.getSpecifications()) && org.springframework.util.StringUtils.hasText(db.getSpecifications())) p.setSpecifications(db.getSpecifications());
                if (!org.springframework.util.StringUtils.hasText(p.getFabricWidth()) && org.springframework.util.StringUtils.hasText(db.getFabricWidth())) p.setFabricWidth(db.getFabricWidth());
                if (!org.springframework.util.StringUtils.hasText(p.getFabricWeight()) && org.springframework.util.StringUtils.hasText(db.getFabricWeight())) p.setFabricWeight(db.getFabricWeight());
                if (!org.springframework.util.StringUtils.hasText(p.getFabricComposition()) && org.springframework.util.StringUtils.hasText(db.getFabricComposition())) p.setFabricComposition(db.getFabricComposition());
            }
        }
        boolean ok = batchAndSync(purchases);
        if (!ok) {
            throw new IllegalStateException("批量保存失败");
        }
        return true;
    }

    public boolean updateArrivedQuantity(Map<String, Object> params) {
        String id = params == null ? null : (params.get("id") == null ? null : String.valueOf(params.get("id")));
        Integer arrivedQuantity = helper.coerceInt(params == null ? null : params.get("arrivedQuantity"));
        String remark = params == null ? null
                : (params.get("remark") == null ? null : String.valueOf(params.get("remark")));
        String key = id == null ? null : StringUtils.trimWhitespace(id);
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        if (arrivedQuantity == null) {
            throw new IllegalArgumentException("arrivedQuantity参数错误");
        }
        if (arrivedQuantity < 0) {
            throw new IllegalArgumentException("arrivedQuantity不能小于0");
        }
        MaterialPurchase current = materialPurchaseService.getById(key);
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }
        int purchaseQty = current.getPurchaseQuantity() == null ? 0 : current.getPurchaseQuantity().intValue();
        if (purchaseQty > 0 && arrivedQuantity * 100 < purchaseQty * MaterialConstants.ARRIVAL_RATE_THRESHOLD_REMARK) {
            if (!StringUtils.hasText(remark)) {
                throw new IllegalArgumentException(
                        "到货不足" + MaterialConstants.ARRIVAL_RATE_THRESHOLD_REMARK + "%，请填写备注");
            }
        }
        boolean ok = updateArrivedQuantityAndSync(key, arrivedQuantity, remark);
        if (!ok) {
            throw new IllegalStateException("更新失败");
        }
        return true;
    }

    public MaterialPurchase createInstruction(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new java.util.LinkedHashMap<>() : params;
        String materialId = ParamUtils.toTrimmedString(safeParams.get("materialId"));
        String materialCode = ParamUtils.toTrimmedString(safeParams.get("materialCode"));
        String materialName = ParamUtils.toTrimmedString(safeParams.get("materialName"));
        String materialType = ParamUtils.toTrimmedString(safeParams.get("materialType"));
        String specifications = ParamUtils.toTrimmedString(safeParams.get("specifications"));
        String unit = ParamUtils.toTrimmedString(safeParams.get("unit"));
        String color = ParamUtils.toTrimmedString(safeParams.get("color"));
        String size = ParamUtils.toTrimmedString(safeParams.get("size"));
        java.math.BigDecimal conversionRate = null;
        Object conversionRateRaw = safeParams.get("conversionRate");
        if (conversionRateRaw != null && StringUtils.hasText(String.valueOf(conversionRateRaw))) {
            try {
                conversionRate = new java.math.BigDecimal(String.valueOf(conversionRateRaw).trim());
            } catch (NumberFormatException e) {
                log.warn("[MaterialPurchase] 换算率解析失败，conversionRateRaw={}: {}", conversionRateRaw, e.getMessage());
                conversionRate = null;
            }
        }
        String remark = ParamUtils.toTrimmedString(safeParams.get("remark"));
        Integer qty = helper.coerceInt(safeParams.get("purchaseQuantity"));
        String supplierId = ParamUtils.toTrimmedString(safeParams.get("supplierId"));
        String supplierName = ParamUtils.toTrimmedString(safeParams.get("supplierName"));
        String fabricComposition = ParamUtils.toTrimmedString(safeParams.get("fabricComposition"));
        String fabricWidth = ParamUtils.toTrimmedString(safeParams.get("fabricWidth"));
        String fabricWeight = ParamUtils.toTrimmedString(safeParams.get("fabricWeight"));
        BigDecimal unitPrice = null;
        Object unitPriceRaw = safeParams.get("unitPrice");
        if (unitPriceRaw != null && StringUtils.hasText(String.valueOf(unitPriceRaw))) {
            try { unitPrice = new BigDecimal(String.valueOf(unitPriceRaw).trim()); } catch (NumberFormatException e) {
                log.warn("[MaterialPurchase] 单价解析失败，unitPriceRaw={}: {}", unitPriceRaw, e.getMessage());
            }
        }

        if (!StringUtils.hasText(materialCode) && !StringUtils.hasText(materialName)) {
            throw new IllegalArgumentException("物料信息不能为空");
        }

        // 从物料资料库自动补全缺失属性（前端可能未传全部字段）
        MaterialDatabase dbMaterial = null;
        if (StringUtils.hasText(materialId)) {
            dbMaterial = materialDatabaseService.getById(materialId);
        }
        if (dbMaterial == null && StringUtils.hasText(materialCode)) {
            dbMaterial = materialDatabaseService.getOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialDatabase>()
                            .eq(MaterialDatabase::getMaterialCode, materialCode)
                            .last("LIMIT 1"));
        }
        if (dbMaterial != null) {
            if (!StringUtils.hasText(color)) color = dbMaterial.getColor();
            if (!StringUtils.hasText(fabricComposition)) fabricComposition = dbMaterial.getFabricComposition();
            if (!StringUtils.hasText(fabricWidth)) fabricWidth = dbMaterial.getFabricWidth();
            if (!StringUtils.hasText(fabricWeight)) fabricWeight = dbMaterial.getFabricWeight();
            if (!StringUtils.hasText(specifications)) specifications = dbMaterial.getSpecifications();
            if (!StringUtils.hasText(unit)) unit = dbMaterial.getUnit();
            if (!StringUtils.hasText(supplierId)) supplierId = dbMaterial.getSupplierId();
            if (!StringUtils.hasText(supplierName)) supplierName = dbMaterial.getSupplierName();
            if (unitPrice == null) unitPrice = dbMaterial.getUnitPrice();
            if (conversionRate == null) conversionRate = dbMaterial.getConversionRate();
            if (!StringUtils.hasText(materialId)) materialId = dbMaterial.getId();
        }
        if (qty == null || qty <= 0) {
            throw new IllegalArgumentException("采购数量必须大于0");
        }
        MaterialPurchase purchase = new MaterialPurchase();
        purchase.setMaterialId(materialId);
        purchase.setMaterialCode(materialCode);
        purchase.setMaterialName(materialName);
        purchase.setMaterialType(materialType);
        purchase.setSpecifications(specifications);
        purchase.setUnit(unit);
        purchase.setConversionRate(conversionRate);
        purchase.setColor(color);
        purchase.setSize(size);
        purchase.setPurchaseQuantity(BigDecimal.valueOf(qty));
        purchase.setArrivedQuantity(0);
        purchase.setStatus(MaterialConstants.STATUS_PENDING);
        purchase.setRemark(remark);
        purchase.setSourceType("stock");
        // 同步供应商与面料属性（前端从物料资料库选料时携带）
        if (StringUtils.hasText(supplierId)) { purchase.setSupplierId(supplierId); }
        if (StringUtils.hasText(supplierName)) { purchase.setSupplierName(supplierName); }
        if (StringUtils.hasText(fabricComposition)) { purchase.setFabricComposition(fabricComposition); }
        if (StringUtils.hasText(fabricWidth)) { purchase.setFabricWidth(fabricWidth); }
        if (StringUtils.hasText(fabricWeight)) { purchase.setFabricWeight(fabricWeight); }
        if (unitPrice != null) { purchase.setUnitPrice(unitPrice); }

        boolean ok = saveAndSync(purchase);
        if (!ok) {
            throw new IllegalStateException("创建采购指令失败");
        }
        return materialPurchaseService.getById(purchase.getId());
    }

    public Object previewDemand(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("orderId不能为空");
        }
        String seedOrderId = orderId.trim();
        ProductionOrder seed = productionOrderService.getDetailById(seedOrderId);
        if (seed == null) {
            throw new NoSuchElementException("生产订单不存在");
        }
        List<String> orderIds = helper.resolveTargetOrderIds(seed, false);
        return helper.buildBatchPreview(orderIds);
    }

    public Object generateDemand(Map<String, Object> params) {
        String orderId = params == null ? null
                : (params.get("orderId") == null ? null : String.valueOf(params.get("orderId")));
        Object orderIdsRaw = params == null ? null : params.get("orderIds");
        Object overwriteRaw = params == null ? null : params.get("overwrite");
        boolean overwriteFlag = overwriteRaw instanceof Boolean b ? b
                : "true".equalsIgnoreCase(String.valueOf(overwriteRaw));

        String oid = null;
        if (orderId != null) {
            oid = orderId.trim();
        }

        List<String> explicitOrderIds = helper.coerceStringList(orderIdsRaw);

        if (explicitOrderIds != null && !explicitOrderIds.isEmpty()) {
            LinkedHashMap<LocalDate, List<String>> orderIdsByDate = new LinkedHashMap<>();
            for (String x : explicitOrderIds) {
                String id = StringUtils.hasText(x) ? x.trim() : null;
                if (!StringUtils.hasText(id)) continue;
                if (!overwriteFlag && materialPurchaseService.existsActivePurchaseForOrder(id)) continue;
                ProductionOrder o = productionOrderService.getDetailById(id);
                if (o == null) continue;
                LocalDate day = (o.getCreateTime() != null) ? o.getCreateTime().toLocalDate() : LocalDate.now();
                orderIdsByDate.computeIfAbsent(day, k -> new ArrayList<>()).add(id);
            }
            List<Object> allGenerated = new ArrayList<>();
            for (List<String> dateGroup : orderIdsByDate.values()) {
                allGenerated.addAll(helper.generateBatchDemand(dateGroup, overwriteFlag));
            }
            return allGenerated;
        }

        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("orderId不能为空");
        }
        ProductionOrder seed = productionOrderService.getDetailById(oid);
        if (seed == null) {
            throw new NoSuchElementException("生产订单不存在");
        }
        if (!overwriteFlag && materialPurchaseService.existsActivePurchaseForOrder(oid)) {
            throw new IllegalStateException("该订单已生成采购需求");
        }
        List<String> targetOrderIds = helper.resolveTargetOrderIds(seed, overwriteFlag);
        return helper.generateBatchDemand(targetOrderIds, overwriteFlag);
    }

    // ── Business ────────────────────────────────────────────

    public Map<String, Object> checkMergeable(String purchaseId) {
        return helper.checkMergeableForReceive(purchaseId);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        MaterialPurchase current = materialPurchaseService.getById(key);
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }
        boolean ok = materialPurchaseService.deleteById(key);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }
        try {
            materialReconciliationOrchestrator.upsertFromPurchaseId(key);
        } catch (Exception e) {
            log.warn("Failed to upsert material reconciliation after purchase delete: purchaseId={}, orderId={}",
                    key,
                    current.getOrderId(),
                    e);
            scanRecordDomainService.insertOrchestrationFailure(
                    current.getOrderId(),
                    current.getOrderNo(),
                    current.getStyleId(),
                    current.getStyleNo(),
                    "upsertMaterialReconciliation",
                    e == null ? "upsertMaterialReconciliation failed"
                            : ("upsertMaterialReconciliation failed: " + e.getMessage()),
                    LocalDateTime.now());
        }
        if (StringUtils.hasText(current.getOrderId())) {
            helper.recomputeAndUpdateMaterialArrivalRate(current.getOrderId().trim(), productionOrderOrchestrator);
        }
        return true;
    }

    // ── Status transitions (delegated to StatusHelper) ──────

    @Transactional(rollbackFor = Exception.class)
    public MaterialPurchase receive(Map<String, Object> body) {
        return statusHelper.receive(body);
    }

    public Map<String, Object> batchReceive(Map<String, Object> body) {
        return statusHelper.batchReceive(body);
    }

    public MaterialPurchase returnConfirm(Map<String, Object> body) {
        return statusHelper.returnConfirm(body);
    }

    public MaterialPurchase resetReturnConfirm(Map<String, Object> body) {
        return statusHelper.resetReturnConfirm(body);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> cancelReceive(Map<String, Object> body) {
        return statusHelper.cancelReceive(body);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> confirmComplete(Map<String, Object> body) {
        return statusHelper.confirmComplete(body);
    }

    // ── Query aggregation (delegated to QueryHelper) ────────

    public List<MaterialPurchase> getByScanCode(Map<String, Object> params) {
        return queryHelper.getByScanCode(params);
    }

    public List<MaterialPurchase> getMyTasks() {
        return queryHelper.getMyTasks();
    }

    public Map<String, Object> getStatusStats(Map<String, Object> params) {
        return queryHelper.getStatusStats(params);
    }

    // ── Picking / Outbound (delegated to PickingHelper) ─────

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> smartReceiveAll(Map<String, Object> body) {
        return pickingHelper.smartReceiveAll(body);
    }

    public Map<String, Object> previewSmartReceive(String orderNo) {
        return pickingHelper.previewSmartReceive(orderNo);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> warehousePickSingle(Map<String, Object> body) {
        return pickingHelper.warehousePickSingle(body);
    }

    @Transactional(rollbackFor = Exception.class)
    public void confirmPickingOutbound(String pickingId) {
        pickingHelper.confirmPickingOutbound(pickingId);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> cancelPicking(Map<String, Object> body) {
        return pickingHelper.cancelPicking(body);
    }

    // ── Private transaction wrappers ────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public boolean saveAndSync(MaterialPurchase materialPurchase) {
        helper.fillUnitPriceFromBom(materialPurchase);
        if (!StringUtils.hasText(materialPurchase.getSourceType())
                && !StringUtils.hasText(materialPurchase.getOrderId())) {
            materialPurchase.setSourceType("batch");
        }
        boolean ok = materialPurchaseService.savePurchaseAndUpdateOrder(materialPurchase);
        if (!ok) {
            return false;
        }
        statusHelper.syncAfterPurchaseChanged(materialPurchase);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateAndSync(MaterialPurchase materialPurchase) {
        boolean ok = materialPurchaseService.updatePurchaseAndUpdateOrder(materialPurchase);
        if (!ok) {
            return false;
        }
        statusHelper.syncAfterPurchaseChanged(materialPurchase);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean batchAndSync(List<MaterialPurchase> purchases) {
        boolean allOk = true;
        for (MaterialPurchase p : purchases) {
            if (p == null) {
                continue;
            }
            boolean ok = materialPurchaseService.savePurchaseAndUpdateOrder(p);
            if (!ok) {
                allOk = false;
                continue;
            }
            statusHelper.syncAfterPurchaseChanged(p);
        }
        return allOk;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateArrivedQuantityAndSync(String purchaseId, Integer arrivedQuantity, String remark) {
        boolean ok = materialPurchaseService.updateArrivedQuantity(purchaseId, arrivedQuantity, remark);
        if (!ok) {
            return false;
        }
        MaterialPurchase updated = materialPurchaseService.getById(purchaseId);
        if (updated != null) {
            statusHelper.syncAfterPurchaseChanged(updated);
        }
        return true;
    }
}
