package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.helper.MaterialReconciliationLogAppendHelper;
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

    @Autowired
    private MaterialReconciliationLogAppendHelper logAppendHelper;

    @Autowired(required = false)
    private BillAggregationOrchestrator billAggregationOrchestrator;

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
        Long tenantId = UserContext.tenantId();
        MaterialReconciliation r = materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getId, key)
                .eq(MaterialReconciliation::getTenantId, tenantId)
                .one();
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
        logAppendHelper.appendCreate(materialReconciliation, UserContext.username());
        return true;
    }

    @org.springframework.transaction.annotation.Transactional
    public boolean update(MaterialReconciliation materialReconciliation) {
        if (materialReconciliation == null || !StringUtils.hasText(materialReconciliation.getId())) {
            throw new IllegalArgumentException("参数错误");
        }
        String id = materialReconciliation.getId().trim();
        materialReconciliation.setId(id);
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        MaterialReconciliation current = materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getId, id)
                .eq(MaterialReconciliation::getTenantId, tenantId)
                .one();
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
        logAppendHelper.appendUpdate(materialReconciliation, UserContext.username());
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        MaterialReconciliation current = materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getId, key)
                .eq(MaterialReconciliation::getTenantId, tenantId)
                .one();
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
        // P0 修复：已审批物料对账单删除时反向账单，防止 BillAggregation/Payable 悬挂
        if (billAggregationOrchestrator != null) {
            try {
                billAggregationOrchestrator.reverseBySource(
                        com.fashion.supplychain.finance.constant.BillConstants.SOURCE_MATERIAL_RECONCILIATION,
                        key,
                        "物料对账单删除");
            } catch (Exception e) {
                log.warn("[MaterialReconciliation] 删除反向账单失败 id={}, err={}", key, e.getMessage());
            }
        }
        logAppendHelper.appendDelete(current, UserContext.username());
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
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LocalDateTime now = LocalDateTime.now();
        MaterialPurchase purchase = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getId, pid)
                .eq(MaterialPurchase::getTenantId, tenantId)
                .one();

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

    /**
     * 判定该采购是否属于「内部工厂采购」（内部采购才生成物料对账单）。
     *
     * <p>D-252 修正：判定口径由「必须等于 INTERNAL」改为「只有明确 EXTERNAL 才是外发」。
     *
     * <p>原因：线上大量历史订单 factory_type 为 NULL（本厂 / 未标注工厂，见 D-243 数据分布：
     * 「本厂」5 条、「最美服装工厂」2 条均为 NULL）。旧逻辑下 NULL → 判为非内部 →
     * {@link #shouldRouteOrderLinkedPurchaseToInbound} 返回 true → 对账被整批跳过，
     * 表现为「物料对账页面看不到大货采购」。
     *
     * <p>业务口径：外发工厂的面料款走加工费扣款（D-133 方案A），
     * 本厂与未标注工厂走物料对账。因此 NULL 必须按内部处理，否则对账整批丢失。
     */
    private boolean isInternalFactoryPurchase(MaterialPurchase purchase) {
        if (purchase == null) {
            return false;
        }

        if (StringUtils.hasText(purchase.getFactoryType())) {
            return !"EXTERNAL".equalsIgnoreCase(purchase.getFactoryType().trim());
        }

        if (!StringUtils.hasText(purchase.getOrderId())) {
            return false;
        }

        try {
            Long tenantId = UserContext.tenantId();
            ProductionOrder order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getId, purchase.getOrderId().trim())
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .one();
            // 订单缺失或 factory_type 未标注（NULL）→ 按内部处理，保证对账不丢
            if (order == null || !StringUtils.hasText(order.getFactoryType())) {
                return true;
            }
            return !"EXTERNAL".equalsIgnoreCase(order.getFactoryType().trim());
        } catch (Exception e) {
            log.warn("识别工厂类型失败，按内部采购处理（保证对账不丢）: purchaseId={}, orderId={}",
                    purchase.getId(), purchase.getOrderId(), e);
            return true;
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

    /**
     * 补生成对账：扫描「已到货」的采购单，为缺失对账单的补生成。
     *
     * <p>D-259 修复两个缺陷：
     * <ol>
     *   <li><b>P0 跨租户</b>：原实现 lambdaQuery 不带 tenantId，会扫全表并为<b>其他租户</b>的采购
     *       建对账（upsertFromPurchase 内部也不校验租户归属），违反 P0 铁律 #7。
     *       现限定当前租户；upsertFromPurchase 内再加一道归属校验兜底。</li>
     *   <li><b>老数据永远补不到</b>：原实现 {@code LIMIT 5000} 且按 updateTime 倒序，
     *       采购超过 5000 条时，排在后面的历史数据（恰恰是最需要补的存量）永远扫不到。
     *       现改为分页全量遍历（每页 500，上限 40 页 = 20000 条保护）。</li>
     * </ol>
     */
    @Transactional(rollbackFor = Exception.class)
    private int backfillFromPurchases() {
        Long tenantId = UserContext.tenantId();
        LocalDateTime now = LocalDateTime.now();
        int touched = 0;
        final int pageSize = 500;
        final int maxPages = 40;

        for (int pageNo = 1; pageNo <= maxPages; pageNo++) {
            com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialPurchase> wrapper =
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialPurchase>()
                            .eq(MaterialPurchase::getDeleteFlag, 0)
                            .gt(MaterialPurchase::getArrivedQuantity, 0)
                            .ne(MaterialPurchase::getStatus, "cancelled")
                            .eq(tenantId != null, MaterialPurchase::getTenantId, tenantId)
                            .orderByAsc(MaterialPurchase::getCreateTime);

            com.baomidou.mybatisplus.extension.plugins.pagination.Page<MaterialPurchase> page =
                    materialPurchaseService.page(
                            new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(pageNo, pageSize),
                            wrapper);
            List<MaterialPurchase> list = page == null ? null : page.getRecords();
            if (list == null || list.isEmpty()) {
                break;
            }
            for (MaterialPurchase p : list) {
                if (p == null || !StringUtils.hasText(p.getId())) {
                    continue;
                }
                // D-267：先恢复被误删（逻辑删除）的对账，再补缺失的；
                // 全程 allowCleanup=false，补生成绝不删除任何历史对账
                if (restoreDeletedReconciliation(p, now)) {
                    touched++;
                    continue;
                }
                if (upsertFromPurchase(p, now, false)) {
                    touched++;
                }
            }
            if (list.size() < pageSize) {
                break;
            }
        }
        log.info("[MaterialReconciliation] 补生成对账完成 tenantId={} touched={}", tenantId, touched);
        return touched;
    }

    /**
     * 对单个采购做对账 upsert（实时同步链路用：允许按最新口径清理不符合条件的 pending 对账）。
     */
    /**
     * D-267 数据自愈：恢复该采购被逻辑删除的历史对账单。
     *
     * <p>事故背景：用户点「补生成对账」后，backfill 对所有「外发订单采购」执行
     * {@link #cleanupPendingByPurchaseId}，10 条历史大货对账被逻辑删除（delete_flag=1）。
     * 这些对账是用户正在使用的历史单据，补生成语义上不该删除它们。
     *
     * <p>全局配置了逻辑删除（{@code logic-delete-field: deleteFlag}），
     * 因此 removeById 实际是 {@code UPDATE ... SET delete_flag=1}，数据仍在库中，可恢复。
     *
     * @return true 表示成功恢复了一条
     */
    private boolean restoreDeletedReconciliation(MaterialPurchase purchase, LocalDateTime now) {
        if (purchase == null || !StringUtils.hasText(purchase.getId())) {
            return false;
        }
        try {
            MaterialReconciliation deleted = materialReconciliationService.lambdaQuery()
                    .eq(MaterialReconciliation::getPurchaseId, purchase.getId().trim())
                    .eq(MaterialReconciliation::getDeleteFlag, 1)
                    .orderByDesc(MaterialReconciliation::getCreateTime)
                    .last("limit 1")
                    .one();
            if (deleted == null || !StringUtils.hasText(deleted.getId())) {
                return false;
            }
            materialReconciliationService.lambdaUpdate()
                    .eq(MaterialReconciliation::getId, deleted.getId().trim())
                    .set(MaterialReconciliation::getDeleteFlag, 0)
                    .set(MaterialReconciliation::getUpdateTime, now == null ? LocalDateTime.now() : now)
                    .update();
            log.info("[MaterialReconciliation] 恢复被误删的对账 reconciliationId={} purchaseId={} purchaseNo={}",
                    deleted.getId(), purchase.getId(), purchase.getPurchaseNo());
            return true;
        } catch (Exception e) {
            log.warn("[MaterialReconciliation] 恢复误删对账失败 purchaseId={}: {}", purchase.getId(), e.getMessage());
            return false;
        }
    }

    /**
     * 对单个采购做对账 upsert（实时同步链路用：允许按最新口径清理不符合条件的 pending 对账）。
     */
    private boolean upsertFromPurchase(MaterialPurchase purchase, LocalDateTime now) {
        return upsertFromPurchase(purchase, now, true);
    }

    /**
     * @param allowCleanup 是否允许清理（逻辑删除）不符合条件的 pending 对账。
     *                     <b>backfill（补生成）必须传 false</b>：D-267 事故——用户点「补生成对账」后，
     *                     10 条历史大货对账被 backfill 以「外发订单走加工费扣款」为由删除。
     *                     「补」的语义是补齐缺失的，批量删除历史单据属数据丢失事故。
     */
    private boolean upsertFromPurchase(MaterialPurchase purchase, LocalDateTime now, boolean allowCleanup) {
        if (purchase == null || !StringUtils.hasText(purchase.getId())) {
            return false;
        }
        // P0 铁律 #7 兜底：任何路径（含 backfill 批量）都不得为跨租户的采购生成对账
        Long ctxTenantId = UserContext.tenantId();
        if (ctxTenantId != null && purchase.getTenantId() != null
                && !java.util.Objects.equals(ctxTenantId, purchase.getTenantId())) {
            log.warn("[MaterialReconciliation] 拒绝为跨租户采购生成对账 purchaseId={} purchaseTenant={} ctxTenant={}",
                    purchase.getId(), purchase.getTenantId(), ctxTenantId);
            return false;
        }
        if (shouldRouteOrderLinkedPurchaseToInbound(purchase)) {
            if (allowCleanup) {
                cleanupPendingByPurchaseId(purchase.getId(), now == null ? LocalDateTime.now() : now);
            }
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
        int pq = purchase.getPurchaseQuantity() == null ? 0 : purchase.getPurchaseQuantity().intValue();
        if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            // 无单价：按采购数量（而非到货量）从采购总额反推真实单价，避免部分到货时单价虚高
            if (pq > 0 && totalAmount != null && totalAmount.compareTo(BigDecimal.ZERO) > 0) {
                unitPrice = totalAmount.divide(BigDecimal.valueOf(pq), 2, RoundingMode.HALF_UP);
            } else {
                unitPrice = BigDecimal.ZERO;
            }
        }
        // 金额一律按「单价 × 对账数量」重算：对账数量是封顶到货量，
        // 直接沿用采购全额会造成部分到货时应付虚增
        totalAmount = unitPrice.multiply(BigDecimal.valueOf(qty)).setScale(2, RoundingMode.HALF_UP);
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
        if (StringUtils.hasText(purchase.getSourceType())) {
            patch.setSourceType(purchase.getSourceType().trim());
        }
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
        if (!StringUtils.hasText(existed.getSourceType()) && StringUtils.hasText(purchase.getSourceType())) {
            patch.setSourceType(purchase.getSourceType().trim());
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
