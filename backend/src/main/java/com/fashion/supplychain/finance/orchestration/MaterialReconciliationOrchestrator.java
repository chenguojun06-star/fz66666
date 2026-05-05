package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.common.lock.DistributedLockService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;
import java.time.format.DateTimeFormatter;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class MaterialReconciliationOrchestrator {

    @Autowired
    private MaterialReconciliationService materialReconciliationService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private DistributedLockService distributedLockService;

    public IPage<MaterialReconciliation> list(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            return new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
        }
        IPage<MaterialReconciliation> page = materialReconciliationService.queryPage(params);
        if (page != null) {
            fillProductionCompletedQuantity(page.getRecords());
            fillMaterialImageUrl(page.getRecords());
        }
        return page;
    }

    public MaterialReconciliation getById(String id) {
        TenantAssert.assertTenantContext();
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        MaterialReconciliation r = materialReconciliationService.getById(key);
        if (r == null || (r.getDeleteFlag() != null && r.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("对账单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(r.getTenantId(), "物料对账单");
        fillProductionCompletedQuantity(List.of(r));
        fillMaterialImageUrl(List.of(r));
        return r;
    }

    /**
     * 填充物料图片URL、采购员姓名、单位、单价（从采购单获取）
     */
    private void fillMaterialImageUrl(List<MaterialReconciliation> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        List<String> purchaseIds = records.stream()
                .map(MaterialReconciliation::getPurchaseId)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());

        if (purchaseIds.isEmpty()) {
            return;
        }

        PurchaseFillData fillData = loadPurchaseFillData(purchaseIds);
        applyPurchaseFillData(records, fillData);
    }

    private static class PurchaseFillData {
        Map<String, String> coverByPurchaseId = new HashMap<>();
        Map<String, String> purchaserByPurchaseId = new HashMap<>();
        Map<String, String> unitByPurchaseId = new HashMap<>();
        Map<String, BigDecimal> unitPriceByPurchaseId = new HashMap<>();
        Map<String, Integer> arrivedQuantityByPurchaseId = new HashMap<>();
        Map<String, String> sourceTypeByPurchaseId = new HashMap<>();
    }

    private PurchaseFillData loadPurchaseFillData(List<String> purchaseIds) {
        PurchaseFillData data = new PurchaseFillData();
        try {
            List<MaterialPurchase> purchases = materialPurchaseService.listByIds(purchaseIds);
            if (purchases != null) {
                for (MaterialPurchase p : purchases) {
                    if (p != null && StringUtils.hasText(p.getId())) {
                        String pid = p.getId().trim();
                        if (StringUtils.hasText(p.getStyleCover())) {
                            data.coverByPurchaseId.put(pid, p.getStyleCover().trim());
                        }
                        if (StringUtils.hasText(p.getReceiverName())) {
                            data.purchaserByPurchaseId.put(pid, p.getReceiverName().trim());
                        }
                        if (StringUtils.hasText(p.getUnit())) {
                            data.unitByPurchaseId.put(pid, p.getUnit().trim());
                        }
                        if (p.getUnitPrice() != null) {
                            data.unitPriceByPurchaseId.put(pid, p.getUnitPrice());
                        }
                        if (p.getArrivedQuantity() != null) {
                            data.arrivedQuantityByPurchaseId.put(pid, p.getArrivedQuantity().intValue());
                        }
                        if (StringUtils.hasText(p.getSourceType())) {
                            data.sourceTypeByPurchaseId.put(pid, p.getSourceType().trim());
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("面料对账采购信息填充失败（单价/数量可能缺失）", e);
        }
        return data;
    }

    private void applyPurchaseFillData(List<MaterialReconciliation> records, PurchaseFillData data) {
        for (MaterialReconciliation r : records) {
            if (r != null && StringUtils.hasText(r.getPurchaseId())) {
                String pid = r.getPurchaseId().trim();
                r.setMaterialImageUrl(data.coverByPurchaseId.get(pid));
                r.setPurchaserName(data.purchaserByPurchaseId.get(pid));
                r.setUnit(data.unitByPurchaseId.get(pid));
                Integer arrivedQty = data.arrivedQuantityByPurchaseId.get(pid);
                if (arrivedQty != null) {
                    r.setQuantity(arrivedQty);
                }
                String sourceType = data.sourceTypeByPurchaseId.get(pid);
                if (StringUtils.hasText(sourceType)) {
                    r.setSourceType(sourceType);
                }
                BigDecimal purchaseUnitPrice = data.unitPriceByPurchaseId.get(pid);
                if (purchaseUnitPrice != null) {
                    r.setUnitPrice(purchaseUnitPrice);
                }
            }
        }
    }

    private void fillProductionCompletedQuantity(List<MaterialReconciliation> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        List<String> orderIds = records.stream()
                .map(MaterialReconciliation::getOrderId)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());
        if (orderIds.isEmpty()) {
            return;
        }

        List<ProductionOrder> orders;
        try {
            orders = productionOrderService.listByIds(orderIds);
        } catch (Exception e) {
            log.warn("[MaterialReconciliation] 查询生产订单失败: {}", e.getMessage());
            orders = List.of();
        }

        Map<String, Integer> completedByOrderId = new HashMap<>();
        if (orders != null) {
            for (ProductionOrder o : orders) {
                if (o == null || !StringUtils.hasText(o.getId())) {
                    continue;
                }
                completedByOrderId.put(o.getId().trim(), o.getCompletedQuantity());
            }
        }

        for (MaterialReconciliation r : records) {
            if (r == null || !StringUtils.hasText(r.getOrderId())) {
                continue;
            }
            Integer v = completedByOrderId.get(r.getOrderId().trim());
            r.setProductionCompletedQuantity(v);
        }
    }

    @org.springframework.transaction.annotation.Transactional
    public boolean save(MaterialReconciliation materialReconciliation) {
        TenantAssert.assertTenantContext();
        if (materialReconciliation == null) {
            throw new IllegalArgumentException("参数错误");
        }
        if (materialReconciliation.getTenantId() == null) {
            materialReconciliation.setTenantId(UserContext.tenantId());
        }
        LocalDateTime now = LocalDateTime.now();
        UserContext ctx = UserContext.get();
        String uid = ctx == null ? null : ctx.getUserId();
        uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();

        materialReconciliation.setStatus("pending");
        materialReconciliation.setDeleteFlag(0);
        materialReconciliation.setCreateTime(now);
        materialReconciliation.setUpdateTime(now);
        if (StringUtils.hasText(uid)) {
            materialReconciliation.setCreateBy(uid);
            materialReconciliation.setUpdateBy(uid);
        }
        boolean ok = materialReconciliationService.save(materialReconciliation);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    @org.springframework.transaction.annotation.Transactional
    public boolean update(MaterialReconciliation materialReconciliation) {
        if (materialReconciliation == null || !StringUtils.hasText(materialReconciliation.getId())) {
            throw new IllegalArgumentException("参数错误");
        }
        String id = materialReconciliation.getId().trim();
        materialReconciliation.setId(id);
        MaterialReconciliation current = materialReconciliationService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("对账单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "物料对账单");
        String st = current.getStatus() == null ? "" : current.getStatus().trim();
        if (StringUtils.hasText(st) && !"pending".equalsIgnoreCase(st) && !UserContext.isTopAdmin()) {
            throw new IllegalStateException("当前状态不允许修改，请先退回到上一个环节");
        }

        materialReconciliation.setReconciliationNo(current.getReconciliationNo());
        materialReconciliation.setPurchaseId(current.getPurchaseId());
        materialReconciliation.setStatus(current.getStatus());
        materialReconciliation.setVerifiedAt(current.getVerifiedAt());
        materialReconciliation.setApprovedAt(current.getApprovedAt());
        materialReconciliation.setPaidAt(current.getPaidAt());
        materialReconciliation.setReReviewAt(current.getReReviewAt());
        materialReconciliation.setReReviewReason(current.getReReviewReason());
        materialReconciliation.setCreateTime(current.getCreateTime());
        materialReconciliation.setDeleteFlag(current.getDeleteFlag());

        LocalDateTime now = LocalDateTime.now();
        materialReconciliation.setUpdateTime(now);
        UserContext ctx = UserContext.get();
        String uid = ctx == null ? null : ctx.getUserId();
        uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();
        if (StringUtils.hasText(uid)) {
            materialReconciliation.setUpdateBy(uid);
            materialReconciliation
                    .setCreateBy(StringUtils.hasText(current.getCreateBy()) ? current.getCreateBy() : uid);
        } else {
            materialReconciliation.setCreateBy(current.getCreateBy());
            materialReconciliation.setUpdateBy(current.getUpdateBy());
        }
        boolean ok = materialReconciliationService.updateById(materialReconciliation);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        MaterialReconciliation current = materialReconciliationService.getById(key);
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("对账单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "物料对账单");
        String st = current.getStatus() == null ? "" : current.getStatus().trim();
        if (StringUtils.hasText(st) && !"pending".equalsIgnoreCase(st) && !UserContext.isTopAdmin()) {
            throw new IllegalStateException("当前状态不允许删除，请先退回到上一个环节");
        }
        MaterialReconciliation patch = new MaterialReconciliation();
        patch.setId(key);
        patch.setDeleteFlag(1);
        patch.setUpdateTime(java.time.LocalDateTime.now());
        boolean ok = materialReconciliationService.updateById(patch);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }
        return true;
    }

    public int backfill() {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("仅主管级别及以上可执行补数据");
        }
        return backfillFromPurchases();
    }

    @Transactional(rollbackFor = Exception.class)
    public void upsertFromPurchaseId(String purchaseId) {
        String pid = StringUtils.hasText(purchaseId) ? purchaseId.trim() : null;
        if (!StringUtils.hasText(pid)) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        MaterialPurchase purchase = materialPurchaseService.getById(pid);

        if (purchase != null) {
            TenantAssert.assertBelongsToCurrentTenant(purchase.getTenantId(), "采购单");
        }

        if (shouldCleanupByPurchase(purchase)) {
            cleanupPendingByPurchaseId(pid, now);
            return;
        }

        upsertFromPurchase(purchase, now);
    }

    private boolean shouldCleanupByPurchase(MaterialPurchase purchase) {
        if (purchase == null) {
            return true;
        }
        if (!StringUtils.hasText(purchase.getId())) {
            return true;
        }
        // 内部大货采购（factoryType=INTERNAL）与样衣一致：允许直接走 upsert 对账。
        // 外部订单采购仍保持入库回流路径，避免改变既有外部工厂流程。
        if (shouldRouteOrderLinkedPurchaseToInbound(purchase)) {
            return true;
        }
        if (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() != 0) {
            return true;
        }
        String status = purchase.getStatus() == null ? "" : purchase.getStatus().trim();
        if ("cancelled".equalsIgnoreCase(status)) {
            return true;
        }
        return resolveEffectiveQuantity(purchase) <= 0;
    }

    private boolean shouldRouteOrderLinkedPurchaseToInbound(MaterialPurchase purchase) {
        if (purchase == null || !StringUtils.hasText(purchase.getOrderId())) {
            return false;
        }
        return !isInternalFactoryPurchase(purchase);
    }

    private boolean isInternalFactoryPurchase(MaterialPurchase purchase) {
        if (purchase == null) {
            return false;
        }

        if (StringUtils.hasText(purchase.getFactoryType())) {
            return "INTERNAL".equalsIgnoreCase(purchase.getFactoryType().trim());
        }

        if (!StringUtils.hasText(purchase.getOrderId())) {
            return false;
        }

        try {
            ProductionOrder order = productionOrderService.getById(purchase.getOrderId().trim());
            return order != null
                    && StringUtils.hasText(order.getFactoryType())
                    && "INTERNAL".equalsIgnoreCase(order.getFactoryType().trim());
        } catch (Exception e) {
            log.warn("识别工厂类型失败，按非内部采购处理: purchaseId={}, orderId={}",
                    purchase.getId(), purchase.getOrderId(), e);
            return false;
        }
    }

    private void cleanupPendingByPurchaseId(String purchaseId, LocalDateTime now) {
        if (!StringUtils.hasText(purchaseId)) {
            return;
        }
        String pid = purchaseId.trim();

        MaterialReconciliation existed = materialReconciliationService.lambdaQuery()
                .select(MaterialReconciliation::getId, MaterialReconciliation::getStatus)
                .eq(MaterialReconciliation::getPurchaseId, pid)
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .orderByDesc(MaterialReconciliation::getCreateTime)
                .last("limit 1")
                .one();

        if (existed == null || !StringUtils.hasText(existed.getId())) {
            return;
        }

        String st = existed.getStatus() == null ? "" : existed.getStatus().trim();
        if (StringUtils.hasText(st) && !"pending".equalsIgnoreCase(st)) {
            return;
        }

        materialReconciliationService.removeById(existed.getId().trim());
    }

    @Transactional(rollbackFor = Exception.class)
    private int backfillFromPurchases() {
        List<MaterialPurchase> list = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .gt(MaterialPurchase::getArrivedQuantity, 0)
                .ne(MaterialPurchase::getStatus, "cancelled")
                .orderByDesc(MaterialPurchase::getUpdateTime)
                .last("LIMIT 5000")
                .list();
        if (list == null || list.isEmpty()) {
            return 0;
        }

        int touched = 0;
        LocalDateTime now = LocalDateTime.now();
        for (MaterialPurchase p : list) {
            if (p == null || !StringUtils.hasText(p.getId())) {
                continue;
            }
            if (upsertFromPurchase(p, now)) {
                touched++;
            }
        }
        return touched;
    }

    private boolean upsertFromPurchase(MaterialPurchase purchase, LocalDateTime now) {
        if (purchase == null || !StringUtils.hasText(purchase.getId())) {
            return false;
        }
        if (shouldRouteOrderLinkedPurchaseToInbound(purchase)) {
            cleanupPendingByPurchaseId(purchase.getId(), now == null ? LocalDateTime.now() : now);
            return false;
        }
        if (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() != 0) {
            return false;
        }
        String status = purchase.getStatus() == null ? "" : purchase.getStatus().trim();
        if ("cancelled".equalsIgnoreCase(status)) {
            return false;
        }

        int qty = resolveEffectiveQuantity(purchase);
        if (qty <= 0) {
            return false;
        }

        LocalDateTime t = now == null ? LocalDateTime.now() : now;
        UserContext ctx = UserContext.get();
        String uid = ctx == null ? null : ctx.getUserId();
        uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();
        BigDecimal[] prices = resolvePrices(purchase, qty);
        BigDecimal unitPrice = prices[0];
        BigDecimal totalAmount = prices[1];

        MaterialReconciliation existed = materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getPurchaseId, purchase.getId())
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .orderByDesc(MaterialReconciliation::getCreateTime)
                .last("limit 1")
                .one();

        if (existed != null) {
            return patchExistingReconciliation(existed, purchase, qty, unitPrice, totalAmount, t, uid);
        }

        MaterialReconciliation mr = buildNewReconciliation(purchase, qty, unitPrice, totalAmount, t, uid);
        return materialReconciliationService.save(mr);
    }

    private BigDecimal[] resolvePrices(MaterialPurchase purchase, int qty) {
        BigDecimal unitPrice = purchase.getUnitPrice();
        BigDecimal totalAmount = purchase.getTotalAmount();
        if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            if (qty > 0 && totalAmount != null && totalAmount.compareTo(BigDecimal.ZERO) > 0) {
                totalAmount = totalAmount.setScale(2, RoundingMode.HALF_UP);
                unitPrice = totalAmount.divide(BigDecimal.valueOf(qty), 2, RoundingMode.HALF_UP);
            } else {
                unitPrice = BigDecimal.ZERO;
            }
        }
        if (totalAmount == null || totalAmount.compareTo(BigDecimal.ZERO) <= 0) {
            totalAmount = unitPrice.multiply(BigDecimal.valueOf(qty)).setScale(2, RoundingMode.HALF_UP);
        }
        return new BigDecimal[]{unitPrice, totalAmount};
    }

    private boolean patchExistingReconciliation(MaterialReconciliation existed, MaterialPurchase purchase,
            int qty, BigDecimal unitPrice, BigDecimal totalAmount, LocalDateTime t, String uid) {
        String s = existed.getStatus() == null ? "" : existed.getStatus().trim();
        if (StringUtils.hasText(s) && !"pending".equalsIgnoreCase(s)) {
            return patchNonPendingFields(existed, purchase, t, uid);
        }

        MaterialReconciliation patch = new MaterialReconciliation();
        patch.setId(existed.getId());
        patch.setSupplierId(resolveNotBlank(purchase.getSupplierId(), "UNKNOWN_SUPPLIER"));
        patch.setSupplierName(resolveNotBlank(purchase.getSupplierName(), "未填写供应商"));
        String materialId = materialPurchaseService.resolveMaterialId(purchase);
        if (StringUtils.hasText(materialId)) {
            patch.setMaterialId(materialId.trim());
        }
        patch.setMaterialCode(resolveNotBlank(purchase.getMaterialCode(), "UNKNOWN_MATERIAL"));
        patch.setMaterialName(resolveNotBlank(purchase.getMaterialName(), "未填写物料"));
        patch.setPurchaseNo(purchase.getPurchaseNo());
        patch.setOrderId(purchase.getOrderId());
        patch.setOrderNo(purchase.getOrderNo());
        patch.setStyleId(purchase.getStyleId());
        patch.setStyleNo(purchase.getStyleNo());
        patch.setStyleName(purchase.getStyleName());
        patch.setQuantity(qty);
        patch.setUnitPrice(unitPrice);
        patch.setTotalAmount(totalAmount);
        BigDecimal deduction = existed.getDeductionAmount() == null ? BigDecimal.ZERO : existed.getDeductionAmount();
        patch.setDeductionAmount(deduction);
        patch.setFinalAmount(totalAmount.subtract(deduction));
        if (!StringUtils.hasText(existed.getReconciliationDate())) {
            patch.setReconciliationDate(LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd")));
        }
        if (!StringUtils.hasText(existed.getStatus())) {
            patch.setStatus("pending");
        }
        patch.setUpdateTime(t);
        if (StringUtils.hasText(uid)) {
            patch.setUpdateBy(uid);
            if (!StringUtils.hasText(existed.getCreateBy())) {
                patch.setCreateBy(uid);
            }
        }
        return materialReconciliationService.updateById(patch);
    }

    private boolean patchNonPendingFields(MaterialReconciliation existed, MaterialPurchase purchase,
            LocalDateTime t, String uid) {
        MaterialReconciliation patch = new MaterialReconciliation();
        patch.setId(existed.getId());
        boolean needPatch = false;
        if (!StringUtils.hasText(existed.getSupplierId()) && StringUtils.hasText(purchase.getSupplierId())) {
            patch.setSupplierId(purchase.getSupplierId().trim());
            needPatch = true;
        }
        if (!StringUtils.hasText(existed.getSupplierName()) && StringUtils.hasText(purchase.getSupplierName())) {
            patch.setSupplierName(purchase.getSupplierName().trim());
            needPatch = true;
        }
        if (!StringUtils.hasText(existed.getMaterialId())) {
            String materialId = materialPurchaseService.resolveMaterialId(purchase);
            if (StringUtils.hasText(materialId)) {
                patch.setMaterialId(materialId.trim());
                needPatch = true;
            }
        }
        if (!StringUtils.hasText(existed.getMaterialCode()) && StringUtils.hasText(purchase.getMaterialCode())) {
            patch.setMaterialCode(purchase.getMaterialCode().trim());
            needPatch = true;
        }
        if (!StringUtils.hasText(existed.getMaterialName()) && StringUtils.hasText(purchase.getMaterialName())) {
            patch.setMaterialName(purchase.getMaterialName().trim());
            needPatch = true;
        }
        if (!StringUtils.hasText(existed.getPurchaseNo()) && StringUtils.hasText(purchase.getPurchaseNo())) {
            patch.setPurchaseNo(purchase.getPurchaseNo().trim());
            needPatch = true;
        }
        if (!StringUtils.hasText(existed.getOrderId()) && StringUtils.hasText(purchase.getOrderId())) {
            patch.setOrderId(purchase.getOrderId().trim());
            needPatch = true;
        }
        if (!StringUtils.hasText(existed.getOrderNo()) && StringUtils.hasText(purchase.getOrderNo())) {
            patch.setOrderNo(purchase.getOrderNo().trim());
            needPatch = true;
        }
        if (!StringUtils.hasText(existed.getStyleId()) && StringUtils.hasText(purchase.getStyleId())) {
            patch.setStyleId(purchase.getStyleId().trim());
            needPatch = true;
        }
        if (!StringUtils.hasText(existed.getStyleNo()) && StringUtils.hasText(purchase.getStyleNo())) {
            patch.setStyleNo(purchase.getStyleNo().trim());
            needPatch = true;
        }
        if (!StringUtils.hasText(existed.getStyleName()) && StringUtils.hasText(purchase.getStyleName())) {
            patch.setStyleName(purchase.getStyleName().trim());
            needPatch = true;
        }
        if (!needPatch) {
            return false;
        }
        patch.setUpdateTime(t);
        if (StringUtils.hasText(uid)) {
            patch.setUpdateBy(uid);
        }
        return materialReconciliationService.updateById(patch);
    }

    private MaterialReconciliation buildNewReconciliation(MaterialPurchase purchase, int qty,
            BigDecimal unitPrice, BigDecimal totalAmount, LocalDateTime t, String uid) {
        MaterialReconciliation mr = new MaterialReconciliation();
        mr.setReconciliationNo(buildFinanceNo("MR", t));
        mr.setSupplierId(resolveNotBlank(purchase.getSupplierId(), "UNKNOWN_SUPPLIER"));
        mr.setSupplierName(resolveNotBlank(purchase.getSupplierName(), "未填写供应商"));
        String materialId = materialPurchaseService.resolveMaterialId(purchase);
        if (StringUtils.hasText(materialId)) {
            mr.setMaterialId(materialId.trim());
        }
        mr.setMaterialCode(resolveNotBlank(purchase.getMaterialCode(), "UNKNOWN_MATERIAL"));
        mr.setMaterialName(resolveNotBlank(purchase.getMaterialName(), "未填写物料"));
        mr.setPurchaseId(purchase.getId());
        mr.setPurchaseNo(purchase.getPurchaseNo());
        mr.setOrderId(purchase.getOrderId());
        mr.setOrderNo(purchase.getOrderNo());
        mr.setStyleId(purchase.getStyleId());
        mr.setStyleNo(purchase.getStyleNo());
        mr.setStyleName(purchase.getStyleName());
        if (StringUtils.hasText(purchase.getSourceType())) {
            mr.setSourceType(purchase.getSourceType().trim());
        }
        mr.setQuantity(qty);
        mr.setUnitPrice(unitPrice);
        mr.setTotalAmount(totalAmount);
        mr.setDeductionAmount(BigDecimal.ZERO);
        mr.setFinalAmount(totalAmount);
        mr.setReconciliationDate(LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd")));
        mr.setStatus("pending");
        mr.setDeleteFlag(0);
        mr.setCreateTime(t);
        mr.setUpdateTime(t);
        if (StringUtils.hasText(uid)) {
            mr.setCreateBy(uid);
            mr.setUpdateBy(uid);
        }
        return mr;
    }


    private int resolveEffectiveQuantity(MaterialPurchase purchase) {
        if (purchase == null) {
            return 0;
        }
        int aq = purchase.getArrivedQuantity() == null ? 0 : purchase.getArrivedQuantity().intValue();
        int pq = purchase.getPurchaseQuantity() == null ? 0 : purchase.getPurchaseQuantity().intValue();
        if (pq > 0) {
            try {
                return Math.max(0, materialPurchaseService.computeEffectiveArrivedQuantity(pq, aq));
            } catch (Exception e) {
                return Math.max(0, Math.min(Math.max(0, aq), pq));
            }
        }
        return Math.max(0, aq);
    }

    private String resolveNotBlank(String v, String fallback) {
        if (StringUtils.hasText(v)) {
            return v.trim();
        }
        return fallback;
    }

    private String buildFinanceNo(String prefix, LocalDateTime now) {
        String p = StringUtils.hasText(prefix) ? prefix.trim() : "NO";
        return distributedLockService.executeWithStrictLock(
                p + ":generateNo", 5, java.util.concurrent.TimeUnit.SECONDS,
                () -> doBuildFinanceNo(p));
    }

    private String doBuildFinanceNo(String prefix) {
        String monthPrefix = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMM"));
        String fullPrefix = prefix + monthPrefix;

        MaterialReconciliation last = materialReconciliationService.lambdaQuery()
                .likeRight(MaterialReconciliation::getReconciliationNo, fullPrefix)
                .orderByDesc(MaterialReconciliation::getReconciliationNo)
                .last("LIMIT 1")
                .one();

        int sequence = 1;
        if (last != null && last.getReconciliationNo() != null) {
            String lastNo = last.getReconciliationNo();
            try {
                String lastSequence = lastNo.substring(lastNo.length() - 4);
                sequence = Integer.parseInt(lastSequence) + 1;
            } catch (NumberFormatException e) {
                log.warn("解析对账单号序号失败: {}", lastNo, e);
            }
        }

        return String.format("%s%04d", fullPrefix, sequence);
    }
}
