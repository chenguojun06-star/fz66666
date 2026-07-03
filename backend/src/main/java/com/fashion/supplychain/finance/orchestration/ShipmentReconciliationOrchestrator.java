package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.DeductionItem;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.helper.ShipmentReconciliationLogAppendHelper;
import com.fashion.supplychain.finance.mapper.DeductionItemMapper;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.finance.service.impl.BaseReconciliationServiceImpl;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

@Service("financeShipmentReconciliationOrchestrator")
@Slf4j
public class ShipmentReconciliationOrchestrator {

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired(required = false)
    private DistributedLockService distributedLockService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private DeductionItemMapper deductionItemMapper;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private BillAggregationOrchestrator billAggregationOrchestrator;

    @Autowired
    private ShipmentReconciliationLogAppendHelper logAppendHelper;

    /**
     * 计算工序成本（从Phase 5 ScanRecord汇总）
     * 数据来源：该订单下所有ScanRecord的scanCost求和
     */
    public BigDecimal calculateScanCost(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            return BigDecimal.ZERO;
        }
        try {
            List<ScanRecord> records = scanRecordMapper.selectList(
                new LambdaQueryWrapper<ScanRecord>()
                    .eq(ScanRecord::getOrderId, orderId)
                    .isNull(ScanRecord::getFactoryId)
                    .ne(ScanRecord::getScanType, "orchestration")
                    .eq(ScanRecord::getScanResult, "success")
                    .isNotNull(ScanRecord::getScanCost)
            );
            return records.stream()
                .map(ScanRecord::getScanCost)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        } catch (Exception e) {
            log.warn("Failed to calculate scan cost for order: {}", orderId, e);
            return BigDecimal.ZERO;
        }
    }

    /**
     * 填充利润信息
     */
    public void fillProfitInfo(ShipmentReconciliation shipment) {
        if (shipment == null) {
            return;
        }
        BigDecimal scanCost = calculateScanCost(shipment.getOrderId());
        shipment.setScanCost(scanCost);
        BigDecimal materialCost = shipment.getMaterialCost();
        if (materialCost == null) {
            materialCost = BigDecimal.ZERO;
        }
        BigDecimal totalCost = scanCost.add(materialCost);
        shipment.setTotalCost(totalCost);
        BigDecimal finalAmount = shipment.getFinalAmount();
        if (finalAmount == null) {
            finalAmount = BigDecimal.ZERO;
        }
        BigDecimal profit = finalAmount.subtract(totalCost);
        // 允许负利润（亏损订单），便于管理层发现问题订单
        shipment.setProfitAmount(profit);
        if (finalAmount.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal margin = profit
                .divide(finalAmount, 4, RoundingMode.HALF_UP)
                .multiply(new BigDecimal("100"))
                .setScale(2, RoundingMode.HALF_UP);
            shipment.setProfitMargin(margin);
        } else {
            shipment.setProfitMargin(BigDecimal.ZERO);
        }
    }

    public IPage<ShipmentReconciliation> list(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            return new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
        }
        IPage<ShipmentReconciliation> page = shipmentReconciliationService.queryPage(params);
        if (page != null && page.getRecords() != null) {
            fillProductionCompletedQuantity(page.getRecords());
            for (ShipmentReconciliation record : page.getRecords()) {
                fillProfitInfo(record);
            }
        }
        return page;
    }

    public List<ShipmentReconciliation> listAll() {
        // 工厂账号不可查看出货对账
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            return java.util.Collections.emptyList();
        }
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        return shipmentReconciliationService.list(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ShipmentReconciliation>()
                        .eq(ShipmentReconciliation::getTenantId, tenantId)
                        .last("LIMIT 5000"));
    }

    public ShipmentReconciliation getById(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        com.fashion.supplychain.common.tenant.TenantAssert.assertTenantContext();
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        ShipmentReconciliation r = shipmentReconciliationService.lambdaQuery()
                .eq(ShipmentReconciliation::getId, key)
                .eq(ShipmentReconciliation::getTenantId, tenantId)
                .one();
        if (r == null) {
            throw new NoSuchElementException("对账单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(r.getTenantId(), "成品对账单");
        fillProductionCompletedQuantity(List.of(r));
        fillProfitInfo(r);
        return r;
    }

    private void fillProductionCompletedQuantity(List<ShipmentReconciliation> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        List<String> orderIds = records.stream()
                .map(ShipmentReconciliation::getOrderId)
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
            log.warn("Failed to query production orders for shipment reconciliation: orderIdsCount={}",
                    orderIds == null ? 0 : orderIds.size(),
                    e);
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

        for (ShipmentReconciliation r : records) {
            if (r == null || !StringUtils.hasText(r.getOrderId())) {
                continue;
            }
            Integer v = completedByOrderId.get(r.getOrderId().trim());
            r.setProductionCompletedQuantity(v);
        }
    }

    @org.springframework.transaction.annotation.Transactional
    public boolean save(ShipmentReconciliation shipmentReconciliation) {
        TenantAssert.assertTenantContext();
        if (shipmentReconciliation == null) {
            throw new IllegalArgumentException("参数错误");
        }
        if (shipmentReconciliation.getTenantId() == null) {
            shipmentReconciliation.setTenantId(UserContext.tenantId());
        }
        if (!StringUtils.hasText(shipmentReconciliation.getReconciliationNo())) {
            shipmentReconciliation.setReconciliationNo(generateReconciliationNo());
        }
        fillProfitInfo(shipmentReconciliation);
        LocalDateTime now = LocalDateTime.now();
        UserContext ctx = UserContext.get();
        String uid = ctx == null ? null : ctx.getUserId();
        uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();

        shipmentReconciliation.setStatus("pending");
        shipmentReconciliation.setCreateTime(now);
        shipmentReconciliation.setUpdateTime(now);
        if (StringUtils.hasText(uid)) {
            BaseReconciliationServiceImpl.ReconciliationEntity audit = shipmentReconciliation;
            audit.setCreateBy(uid);
            audit.setUpdateBy(uid);
        }
        boolean ok = shipmentReconciliationService.save(shipmentReconciliation);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        logAppendHelper.appendCreate(shipmentReconciliation, UserContext.username());

        // 推送应收账单到 BillAggregation（出货对账单生成后自动应收）
        pushReceivableBill(shipmentReconciliation);

        return true;
    }

    @org.springframework.transaction.annotation.Transactional
    public boolean update(ShipmentReconciliation shipmentReconciliation) {
        if (shipmentReconciliation == null || !StringUtils.hasText(shipmentReconciliation.getId())) {
            throw new IllegalArgumentException("参数错误");
        }
        String id = shipmentReconciliation.getId().trim();
        shipmentReconciliation.setId(id);
        ShipmentReconciliation current = shipmentReconciliationService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("对账单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "成品对账单");
        String st = current.getStatus() == null ? "" : current.getStatus().trim();
        if (StringUtils.hasText(st) && !"pending".equalsIgnoreCase(st) && !UserContext.isTopAdmin()) {
            throw new IllegalStateException("当前状态不允许修改，请先退回到上一个环节");
        }

        shipmentReconciliation.setReconciliationNo(current.getReconciliationNo());
        shipmentReconciliation.setStatus(current.getStatus());
        shipmentReconciliation.setVerifiedAt(current.getVerifiedAt());
        shipmentReconciliation.setApprovedAt(current.getApprovedAt());
        shipmentReconciliation.setPaidAt(current.getPaidAt());
        shipmentReconciliation.setReReviewAt(current.getReReviewAt());
        shipmentReconciliation.setReReviewReason(current.getReReviewReason());
        shipmentReconciliation.setCreateTime(current.getCreateTime());

        LocalDateTime now = LocalDateTime.now();
        shipmentReconciliation.setUpdateTime(now);
        UserContext ctx = UserContext.get();
        String uid = ctx == null ? null : ctx.getUserId();
        uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();
        BaseReconciliationServiceImpl.ReconciliationEntity audit = shipmentReconciliation;
        BaseReconciliationServiceImpl.ReconciliationEntity currentAudit = current;
        if (StringUtils.hasText(uid)) {
            audit.setUpdateBy(uid);
            audit.setCreateBy(StringUtils.hasText(currentAudit.getCreateBy()) ? currentAudit.getCreateBy() : uid);
        } else {
            audit.setCreateBy(currentAudit.getCreateBy());
            audit.setUpdateBy(currentAudit.getUpdateBy());
        }
        boolean ok = shipmentReconciliationService.updateById(shipmentReconciliation);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        logAppendHelper.appendUpdate(shipmentReconciliation, UserContext.username());
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        ShipmentReconciliation current = shipmentReconciliationService.getById(key);
        if (current == null) {
            throw new NoSuchElementException("对账单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "成品对账单");
        String st = current.getStatus() == null ? "" : current.getStatus().trim();
        if (StringUtils.hasText(st) && !"pending".equalsIgnoreCase(st) && !UserContext.isTopAdmin()) {
            throw new IllegalStateException("当前状态不允许删除，请先退回到上一个环节");
        }
        boolean ok = shipmentReconciliationService.removeById(key);
        if (!ok) {
            if (shipmentReconciliationService.getById(key) == null) {
                log.warn("[RECON-DELETE] id={} already deleted, idempotent success", key);
                return true;
            }
            throw new IllegalStateException("删除失败");
        }
        logAppendHelper.appendDelete(current, UserContext.username());
        return true;
    }

    public int backfill() {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("仅主管级别及以上可执行补数据");
        }
        return productionOrderOrchestrator.backfillFinanceRecords();
    }

    public List<DeductionItem> getDeductionItems(String reconciliationId) {
        String rid = StringUtils.hasText(reconciliationId) ? reconciliationId.trim() : null;
        if (!StringUtils.hasText(rid)) {
            throw new IllegalArgumentException("参数错误");
        }
        return deductionItemMapper.selectByReconciliationId(rid, com.fashion.supplychain.common.UserContext.tenantId());
    }

    /**
     * 根据订单ID获取出货对账单
     */
    public ShipmentReconciliation getByOrderId(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        return shipmentReconciliationService.lambdaQuery()
                .eq(ShipmentReconciliation::getOrderId, orderId.trim())
                .eq(ShipmentReconciliation::getTenantId, tenantId)
                .last("LIMIT 1")
                .one();
    }

    /**
     * 根据订单ID获取扣款明细
     */
    public List<DeductionItem> getDeductionItemsByOrderId(String orderId) {
        ShipmentReconciliation recon = getByOrderId(orderId);
        if (recon == null) {
            throw new NoSuchElementException("该订单没有对账单，请先确认订单是否已生成对账单");
        }
        return deductionItemMapper.selectByReconciliationId(recon.getId(), UserContext.tenantId());
    }

    /**
     * 根据订单ID保存扣款明细
     */
    @Transactional(rollbackFor = Exception.class)
    public void saveDeductionItemsByOrderId(String orderId, List<DeductionItem> items) {
        ShipmentReconciliation recon = getByOrderId(orderId);
        if (recon == null) {
            throw new NoSuchElementException("该订单没有对账单，请先确认订单是否已生成对账单");
        }
        saveDeductionItems(recon.getId(), items);
    }

    @Transactional(rollbackFor = Exception.class)
    public void saveDeductionItems(String reconciliationId, List<DeductionItem> items) {
        String rid = StringUtils.hasText(reconciliationId) ? reconciliationId.trim() : null;
        if (!StringUtils.hasText(rid)) {
            throw new IllegalArgumentException("参数错误");
        }

        ShipmentReconciliation current = shipmentReconciliationService.getById(rid);
        if (current == null) {
            throw new NoSuchElementException("对账单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(current.getTenantId(), "成品对账单");

        String st = current.getStatus() == null ? "" : current.getStatus().trim();
        if (StringUtils.hasText(st) && !"pending".equalsIgnoreCase(st) && !UserContext.isTopAdmin()) {
            throw new IllegalStateException("当前状态不允许修改，请先退回到上一个环节");
        }

        // 按类型分类汇总：SUPPLEMENT = 补款（增加金额），其余 = 扣款（减少金额）
        BigDecimal totalDeduction = BigDecimal.ZERO;
        BigDecimal totalSupplement = BigDecimal.ZERO;
        if (items != null) {
            for (DeductionItem it : items) {
                if (it == null) {
                    continue;
                }
                BigDecimal amt = it.getDeductionAmount() == null ? BigDecimal.ZERO : it.getDeductionAmount();
                if (amt.compareTo(BigDecimal.ZERO) < 0) {
                    throw new IllegalArgumentException("扣补款金额不能为负数");
                }
                if ("SUPPLEMENT".equalsIgnoreCase(it.getDeductionType())) {
                    totalSupplement = totalSupplement.add(amt);
                } else {
                    totalDeduction = totalDeduction.add(amt);
                }
            }
        }

        BigDecimal unitPrice = current.getUnitPrice() == null ? BigDecimal.ZERO : current.getUnitPrice();
        int qty = current.getQuantity() == null ? 0 : current.getQuantity();
        BigDecimal totalAmount = unitPrice.multiply(BigDecimal.valueOf(qty)).setScale(2, java.math.RoundingMode.HALF_UP);
        BigDecimal deductionAmount = totalDeduction.subtract(totalSupplement).setScale(2, java.math.RoundingMode.HALF_UP);
        BigDecimal finalAmount = totalAmount.subtract(totalDeduction).add(totalSupplement).setScale(2, java.math.RoundingMode.HALF_UP);

        ShipmentReconciliation patch = new ShipmentReconciliation();
        patch.setId(rid);
        patch.setTotalAmount(totalAmount);
        patch.setDeductionAmount(deductionAmount);
        patch.setFinalAmount(finalAmount);
        patch.setUpdateTime(LocalDateTime.now());
        UserContext ctx = UserContext.get();
        String uid = ctx == null ? null : ctx.getUserId();
        uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();
        BaseReconciliationServiceImpl.ReconciliationEntity patchAudit = patch;
        BaseReconciliationServiceImpl.ReconciliationEntity currentAudit = current;
        if (uid != null) {
            patchAudit.setUpdateBy(uid);
            patchAudit.setCreateBy(StringUtils.hasText(currentAudit.getCreateBy()) ? currentAudit.getCreateBy() : uid);
        } else {
            patchAudit.setCreateBy(currentAudit.getCreateBy());
            patchAudit.setUpdateBy(currentAudit.getUpdateBy());
        }

        boolean ok = shipmentReconciliationService.updateById(patch);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        deductionItemMapper.delete(new LambdaQueryWrapper<DeductionItem>()
                .eq(DeductionItem::getReconciliationId, rid)
                .ne(DeductionItem::getDeductionType, "MATERIAL_PICKUP"));

        if (items != null) {
            for (DeductionItem it : items) {
                if (it == null) {
                    continue;
                }
                String type = it.getDeductionType() == null ? "" : it.getDeductionType().trim();
                if ("MATERIAL_PICKUP".equalsIgnoreCase(type)) {
                    continue;
                }
                String desc = it.getDescription() == null ? "" : it.getDescription().trim();
                BigDecimal amt = it.getDeductionAmount() == null ? BigDecimal.ZERO : it.getDeductionAmount();
                if (!StringUtils.hasText(type) && !StringUtils.hasText(desc) && amt.compareTo(BigDecimal.ZERO) == 0) {
                    continue;
                }
                DeductionItem row = new DeductionItem();
                row.setReconciliationId(rid);
                row.setDeductionType(type);
                row.setDeductionAmount(amt);
                row.setDescription(desc);
                deductionItemMapper.insert(row);
            }
        }

        List<DeductionItem> allItems = deductionItemMapper.selectByReconciliationId(rid, UserContext.tenantId());
        BigDecimal autoDeduction = BigDecimal.ZERO;
        BigDecimal manualDeduction = BigDecimal.ZERO;
        BigDecimal supplementAmount = BigDecimal.ZERO;
        if (allItems != null) {
            for (DeductionItem di : allItems) {
                BigDecimal amt = di.getDeductionAmount() != null ? di.getDeductionAmount() : BigDecimal.ZERO;
                if ("SUPPLEMENT".equalsIgnoreCase(di.getDeductionType())) {
                    supplementAmount = supplementAmount.add(amt);
                } else if ("MATERIAL_PICKUP".equalsIgnoreCase(di.getDeductionType())) {
                    autoDeduction = autoDeduction.add(amt);
                } else {
                    manualDeduction = manualDeduction.add(amt);
                }
            }
        }
        BigDecimal netDeduction = autoDeduction.add(manualDeduction).subtract(supplementAmount);
        BigDecimal recalculatedFinal = totalAmount.subtract(autoDeduction).subtract(manualDeduction).add(supplementAmount);

        if (deductionAmount.compareTo(netDeduction) != 0 || finalAmount.compareTo(recalculatedFinal) != 0) {
            patch.setDeductionAmount(netDeduction);
            patch.setFinalAmount(recalculatedFinal);
            shipmentReconciliationService.updateById(patch);
        }

        // 推送扣款明细作为独立账单（让对方也能看到每笔扣款）
        pushDeductionBills(rid, allItems, current);

        // 同步更新 BillAggregation 应收账单金额（扣款变更后联动）
        syncBillAggregationAmount(current.getId(), current.getOrderId(), recalculatedFinal);
    }

    /**
     * 推送扣款明细作为独立账单（让对方也能看到每笔扣款）
     */
    private void pushDeductionBills(String reconciliationId, List<DeductionItem> items, ShipmentReconciliation recon) {
        if (items == null || items.isEmpty() || billAggregationOrchestrator == null) {
            return;
        }
        try {
            // 先删除该对账单已推送的扣款账单（幂等性）
            billAggregationOrchestrator.cancelBySource("SHIPMENT_RECONCILIATION_DEDUCTION", reconciliationId);
            
            // 推送每笔扣款作为独立账单
            for (DeductionItem item : items) {
                if (item == null || item.getDeductionAmount() == null || item.getDeductionAmount().compareTo(BigDecimal.ZERO) <= 0) {
                    continue;
                }
                // SUPPLEMENT 是补款，不作为扣款账单
                if ("SUPPLEMENT".equalsIgnoreCase(item.getDeductionType())) {
                    continue;
                }
                
                BillAggregationOrchestrator.BillPushRequest req = new BillAggregationOrchestrator.BillPushRequest();
                req.setBillType("RECEIVABLE");  // 扣款也是应收（我们要向对方收取扣款金额）
                req.setBillCategory("DEDUCTION");
                req.setSourceType("SHIPMENT_RECONCILIATION_DEDUCTION");
                req.setSourceId(item.getId() != null ? item.getId().toString() : reconciliationId + "_" + System.nanoTime());
                req.setSourceNo(recon.getReconciliationNo() + "-" + item.getDeductionType());
                req.setCounterpartyType("CUSTOMER");
                req.setCounterpartyId(recon.getCustomerId());
                req.setCounterpartyName(recon.getCustomerName());
                req.setOrderId(recon.getOrderId());
                req.setOrderNo(recon.getOrderNo());
                req.setStyleNo(recon.getStyleNo());
                req.setAmount(item.getDeductionAmount());
                req.setRemark(buildDeductionDescription(item));
                req.setSettlementMonth(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM")));
                billAggregationOrchestrator.pushBill(req);
            }
            log.info("[ShipmentRecon] 推送扣款明细账单: reconciliationId={}, count={}", reconciliationId, items.size());
        } catch (Exception e) {
            log.warn("[ShipmentRecon] 推送扣款明细账单失败: reconciliationId={}, err={}", reconciliationId, e.getMessage());
        }
    }

    /**
     * 构建扣款描述
     */
    private String buildDeductionDescription(DeductionItem item) {
        String type = item.getDeductionType();
        String desc = item.getDescription();
        StringBuilder sb = new StringBuilder();
        if ("QUALITY_DEFECT".equalsIgnoreCase(type)) {
            sb.append("次品扣款");
        } else if ("PRODUCT_SCRAP".equalsIgnoreCase(type)) {
            sb.append("报废扣款");
        } else if ("MATERIAL_PICKUP".equalsIgnoreCase(type)) {
            sb.append("领料扣款");
        } else {
            sb.append("其他扣款");
        }
        if (StringUtils.hasText(desc)) {
            sb.append("：").append(desc);
        }
        return sb.toString();
    }

    /**
     * 同步更新 BillAggregation 应收账单金额
     */
    private void syncBillAggregationAmount(String reconciliationId, String orderId, BigDecimal newAmount) {
        if (newAmount == null || newAmount.compareTo(BigDecimal.ZERO) < 0) {
            return;
        }
        try {
            billAggregationOrchestrator.syncAmountBySource("SHIPMENT_RECONCILIATION", reconciliationId, newAmount);
            log.info("[ShipmentRecon] 同步应收账单金额: reconciliationId={}, newAmount={}", reconciliationId, newAmount);
        } catch (Exception e) {
            log.warn("[ShipmentRecon] 同步应收账单金额失败: reconciliationId={}, err={}", reconciliationId, e.getMessage());
        }
    }

    private String generateReconciliationNo() {
        if (distributedLockService == null) {
            return doGenerateReconciliationNo();
        }
        return distributedLockService.executeWithStrictLock(
                "shipmentReconciliation:generateNo", 5, TimeUnit.SECONDS,
                this::doGenerateReconciliationNo);
    }

    private String doGenerateReconciliationNo() {
        String monthPrefix = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMM"));
        String prefix = "SR" + monthPrefix;

        LambdaQueryWrapper<ShipmentReconciliation> wrapper = new LambdaQueryWrapper<>();
        wrapper.likeRight(ShipmentReconciliation::getReconciliationNo, prefix)
               .orderByDesc(ShipmentReconciliation::getReconciliationNo)
               .last("LIMIT 1");

        ShipmentReconciliation last = shipmentReconciliationService.getOne(wrapper);

        int sequence = 1;
        if (last != null && last.getReconciliationNo() != null) {
            String lastNo = last.getReconciliationNo();
            String lastSequence = lastNo.substring(lastNo.length() - 4);
            try {
                sequence = Integer.parseInt(lastSequence) + 1;
            } catch (NumberFormatException e) {
                log.warn("解析出货对账单号序号失败: {}", lastNo, e);
            }
        }

        return String.format("%s%04d", prefix, sequence);
    }

    /**
     * 推送出货应收账单到 BillAggregation
     * 出货对账单生成后自动推送应收账单，用于向客户收款
     */
    private void pushReceivableBill(ShipmentReconciliation recon) {
        if (recon == null || recon.getFinalAmount() == null || recon.getFinalAmount().compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        try {
            BillAggregationOrchestrator.BillPushRequest req = new BillAggregationOrchestrator.BillPushRequest();
            req.setBillType("RECEIVABLE");
            req.setBillCategory("SHIPMENT");
            req.setSourceType("SHIPMENT_RECONCILIATION");
            req.setSourceId(recon.getId());
            req.setSourceNo(recon.getReconciliationNo());
            req.setCounterpartyType("CUSTOMER");
            req.setCounterpartyId(recon.getCustomerId());
            req.setCounterpartyName(recon.getCustomerName());
            req.setOrderId(recon.getOrderId());
            req.setOrderNo(recon.getOrderNo());
            req.setStyleNo(recon.getStyleNo());
            req.setAmount(recon.getFinalAmount());
            req.setSettlementMonth(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM")));
            billAggregationOrchestrator.pushBill(req);
            log.info("[ShipmentRecon] 推送应收账单: reconciliationNo={}, amount={}",
                    recon.getReconciliationNo(), recon.getFinalAmount());
        } catch (Exception e) {
            log.warn("[ShipmentRecon] 推送应收账单失败: reconciliationNo={}, err={}",
                    recon.getReconciliationNo(), e.getMessage());
        }
    }
}
