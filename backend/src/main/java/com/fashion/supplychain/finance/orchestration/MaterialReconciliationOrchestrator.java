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
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;
import java.time.format.DateTimeFormatter;

@Service
public class MaterialReconciliationOrchestrator {

    @Autowired
    private MaterialReconciliationService materialReconciliationService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderService productionOrderService;

    public IPage<MaterialReconciliation> list(Map<String, Object> params) {
        IPage<MaterialReconciliation> page = materialReconciliationService.queryPage(params);
        if (page != null) {
            fillProductionCompletedQuantity(page.getRecords());
            fillMaterialImageUrl(page.getRecords());
        }
        return page;
    }

    public MaterialReconciliation getById(String id) {
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

        // 获取所有采购单ID
        List<String> purchaseIds = records.stream()
                .map(MaterialReconciliation::getPurchaseId)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());

        if (purchaseIds.isEmpty()) {
            return;
        }

        // 批量查询采购单
        Map<String, String> coverByPurchaseId = new HashMap<>();
        Map<String, String> purchaserByPurchaseId = new HashMap<>();
        Map<String, String> unitByPurchaseId = new HashMap<>();
        Map<String, BigDecimal> unitPriceByPurchaseId = new HashMap<>();
        Map<String, Integer> arrivedQuantityByPurchaseId = new HashMap<>();
        Map<String, String> sourceTypeByPurchaseId = new HashMap<>();
        try {
            List<MaterialPurchase> purchases = materialPurchaseService.listByIds(purchaseIds);
            if (purchases != null) {
                for (MaterialPurchase p : purchases) {
                    if (p != null && StringUtils.hasText(p.getId())) {
                        String pid = p.getId().trim();
                        // 填充款式封面
                        if (StringUtils.hasText(p.getStyleCover())) {
                            coverByPurchaseId.put(pid, p.getStyleCover().trim());
                        }
                        // 填充采购员姓名（从领取人获取）
                        if (StringUtils.hasText(p.getReceiverName())) {
                            purchaserByPurchaseId.put(pid, p.getReceiverName().trim());
                        }
                        // 填充单位
                        if (StringUtils.hasText(p.getUnit())) {
                            unitByPurchaseId.put(pid, p.getUnit().trim());
                        }
                        // 填充单价
                        if (p.getUnitPrice() != null) {
                            unitPriceByPurchaseId.put(pid, p.getUnitPrice());
                        }
                        // 填充到货数量
                        if (p.getArrivedQuantity() != null) {
                            arrivedQuantityByPurchaseId.put(pid, p.getArrivedQuantity());
                        }
                        // 填充采购类型
                        if (StringUtils.hasText(p.getSourceType())) {
                            sourceTypeByPurchaseId.put(pid, p.getSourceType().trim());
                        }
                    }
                }
            }
        } catch (Exception e) {
            // 忽略错误，图片URL、采购员、单位、单价、到货数量、采购类型为可选字段
        }

        // 填充图片URL、采购员姓名、单位、单价、到货数量、采购类型
        for (MaterialReconciliation r : records) {
            if (r != null && StringUtils.hasText(r.getPurchaseId())) {
                String pid = r.getPurchaseId().trim();
                r.setMaterialImageUrl(coverByPurchaseId.get(pid));
                r.setPurchaserName(purchaserByPurchaseId.get(pid));
                r.setUnit(unitByPurchaseId.get(pid));
                // 用采购单的到货数量覆盖quantity字段
                Integer arrivedQty = arrivedQuantityByPurchaseId.get(pid);
                if (arrivedQty != null) {
                    r.setQuantity(arrivedQty);
                }
                // 用采购单的采购类型覆盖sourceType字段
                String sourceType = sourceTypeByPurchaseId.get(pid);
                if (StringUtils.hasText(sourceType)) {
                    r.setSourceType(sourceType);
                }
                // 强制用采购单的单价覆盖（物料对账的单价必须来自采购单，不能使用款式报价）
                BigDecimal purchaseUnitPrice = unitPriceByPurchaseId.get(pid);
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

    public boolean save(MaterialReconciliation materialReconciliation) {
        if (materialReconciliation == null) {
            throw new IllegalArgumentException("参数错误");
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
        patch.setUpdateTime(LocalDateTime.now());
        UserContext ctx = UserContext.get();
        String uid = ctx == null ? null : ctx.getUserId();
        uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();
        if (StringUtils.hasText(uid)) {
            patch.setUpdateBy(uid);
            if (!StringUtils.hasText(current.getCreateBy())) {
                patch.setCreateBy(uid);
            }
        }
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
        if (StringUtils.hasText(purchase.getOrderId()) || StringUtils.hasText(purchase.getOrderNo())) {
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

        MaterialReconciliation patch = new MaterialReconciliation();
        patch.setId(existed.getId().trim());
        patch.setDeleteFlag(1);
        patch.setUpdateTime(now == null ? LocalDateTime.now() : now);
        materialReconciliationService.updateById(patch);
    }

    @Transactional(rollbackFor = Exception.class)
    private int backfillFromPurchases() {
        List<MaterialPurchase> list = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .gt(MaterialPurchase::getArrivedQuantity, 0)
                .ne(MaterialPurchase::getStatus, "cancelled")
                .orderByDesc(MaterialPurchase::getUpdateTime)
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
        if (StringUtils.hasText(purchase.getOrderId()) || StringUtils.hasText(purchase.getOrderNo())) {
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

        MaterialReconciliation existed = materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getPurchaseId, purchase.getId())
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .orderByDesc(MaterialReconciliation::getCreateTime)
                .last("limit 1")
                .one();

        if (existed != null) {
            String s = existed.getStatus() == null ? "" : existed.getStatus().trim();
            if (StringUtils.hasText(s) && !"pending".equalsIgnoreCase(s)) {
                MaterialReconciliation patch = new MaterialReconciliation();
                patch.setId(existed.getId());
                boolean needPatch = false;

                if (!StringUtils.hasText(existed.getSupplierId()) && StringUtils.hasText(purchase.getSupplierId())) {
                    patch.setSupplierId(purchase.getSupplierId().trim());
                    needPatch = true;
                }
                if (!StringUtils.hasText(existed.getSupplierName())
                        && StringUtils.hasText(purchase.getSupplierName())) {
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
                if (!StringUtils.hasText(existed.getMaterialCode())
                        && StringUtils.hasText(purchase.getMaterialCode())) {
                    patch.setMaterialCode(purchase.getMaterialCode().trim());
                    needPatch = true;
                }
                if (!StringUtils.hasText(existed.getMaterialName())
                        && StringUtils.hasText(purchase.getMaterialName())) {
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

            BigDecimal deduction = existed.getDeductionAmount() == null ? BigDecimal.ZERO
                    : existed.getDeductionAmount();
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
        return materialReconciliationService.save(mr);
    }

    private int resolveEffectiveQuantity(MaterialPurchase purchase) {
        if (purchase == null) {
            return 0;
        }
        int aq = purchase.getArrivedQuantity() == null ? 0 : purchase.getArrivedQuantity();
        int pq = purchase.getPurchaseQuantity() == null ? 0 : purchase.getPurchaseQuantity();
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
        LocalDateTime t = now == null ? LocalDateTime.now() : now;
        String ts = t.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS"));
        int rand = ThreadLocalRandom.current().nextInt(1000, 10000);
        return p + ts + rand;
    }
}
