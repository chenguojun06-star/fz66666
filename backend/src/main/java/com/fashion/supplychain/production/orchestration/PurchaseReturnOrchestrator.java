package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.service.PayableService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PurchaseReturn;
import com.fashion.supplychain.production.entity.PurchaseReturnItem;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.PurchaseReturnItemService;
import com.fashion.supplychain.production.service.PurchaseReturnService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 采购退货Orchestrator
 * 事务边界：创建退货单 + 更新库存 + 更新应付账款
 * 符合 P0 铁律 #1：@Transactional 只在 Orchestrator 层
 */
@Slf4j
@Service
public class PurchaseReturnOrchestrator {

    private static final DateTimeFormatter DATETIME_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    @Autowired
    private PurchaseReturnService purchaseReturnService;

    @Autowired
    private PurchaseReturnItemService purchaseReturnItemService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private PayableService payableService;

    /**
     * 创建采购退货单（事务边界）
     * @param params 退货参数：originalPurchaseId, returnType, returnReason, items(List<Map>)
     * @return 退货单ID
     */
    @Transactional(rollbackFor = Exception.class)
    public Long createReturn(Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        UserContext ctx = UserContext.get();
        String userId = ctx != null ? ctx.getUserId() : null;
        String userName = ctx != null ? ctx.getUsername() : null;

        // 1. 参数校验
        String originalPurchaseId = (String) params.get("originalPurchaseId");
        if (!StringUtils.hasText(originalPurchaseId)) {
            throw new IllegalArgumentException("originalPurchaseId不能为空");
        }

        String returnType = (String) params.get("returnType");
        if (!StringUtils.hasText(returnType)) {
            returnType = "PARTIAL";
        }

        String returnReason = (String) params.get("returnReason");
        List<Map<String, Object>> items = (List<Map<String, Object>>) params.get("items");
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("退货物料明细不能为空");
        }

        // 2. 查询原采购单
        MaterialPurchase originalPurchase = materialPurchaseService.getById(originalPurchaseId);
        if (originalPurchase == null) {
            throw new IllegalArgumentException("原采购单不存在: " + originalPurchaseId);
        }
        if (originalPurchase.getTenantId() == null || !originalPurchase.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("原采购单不属于当前租户");
        }

        // 3. 生成退货单号
        String returnNo = generateReturnNo();

        // 4. 创建退货单主表
        PurchaseReturn returnEntity = new PurchaseReturn();
        returnEntity.setTenantId(tenantId);
        returnEntity.setReturnNo(returnNo);
        returnEntity.setOriginalPurchaseId(originalPurchaseId);
        returnEntity.setOriginalPurchaseNo(originalPurchase.getPurchaseNo());
        returnEntity.setSupplierId(originalPurchase.getSupplierId());
        returnEntity.setSupplierName(originalPurchase.getSupplierName());
        returnEntity.setReturnType(returnType);
        returnEntity.setReturnReason(returnReason);
        returnEntity.setReturnStatus("PENDING");
        returnEntity.setOperatorId(userId);
        returnEntity.setOperatorName(userName);
        returnEntity.setDeleteFlag(0);

        BigDecimal totalAmount = BigDecimal.ZERO;
        List<PurchaseReturnItem> itemEntities = new ArrayList<>();

        // 5. 创建退货明细
        for (Map<String, Object> item : items) {
            String purchaseId = (String) item.get("purchaseId");
            Integer quantity = (Integer) item.get("quantity");
            if (quantity == null || quantity <= 0) {
                throw new IllegalArgumentException("退货数量必须大于0");
            }

            MaterialPurchase purchaseItem = materialPurchaseService.getById(purchaseId);
            if (purchaseItem == null || !purchaseItem.getTenantId().equals(tenantId)) {
                throw new IllegalArgumentException("采购记录不存在或不属于当前租户: " + purchaseId);
            }

            BigDecimal unitPrice = purchaseItem.getUnitPrice() != null ? purchaseItem.getUnitPrice() : BigDecimal.ZERO;
            BigDecimal amount = unitPrice.multiply(BigDecimal.valueOf(quantity));
            totalAmount = totalAmount.add(amount);

            PurchaseReturnItem itemEntity = new PurchaseReturnItem();
            itemEntity.setTenantId(tenantId);
            itemEntity.setPurchaseId(purchaseId);
            itemEntity.setMaterialId(purchaseItem.getMaterialId());
            itemEntity.setMaterialCode(purchaseItem.getMaterialCode());
            itemEntity.setMaterialName(purchaseItem.getMaterialName());
            itemEntity.setMaterialType(purchaseItem.getMaterialType());
            itemEntity.setSpec(purchaseItem.getSpecifications());
            itemEntity.setColor(purchaseItem.getColor());
            itemEntity.setSize(purchaseItem.getSize());
            itemEntity.setUnit(purchaseItem.getUnit());
            itemEntity.setQuantity(quantity);
            itemEntity.setUnitPrice(unitPrice);
            itemEntity.setAmount(amount);
            itemEntity.setReturnReason((String) item.get("returnReason"));
            itemEntities.add(itemEntity);
        }

        returnEntity.setTotalAmount(totalAmount);
        purchaseReturnService.save(returnEntity);

        // 6. 保存退货明细（设置returnId）
        Long returnId = returnEntity.getId();
        for (PurchaseReturnItem itemEntity : itemEntities) {
            itemEntity.setReturnId(returnId);
            purchaseReturnItemService.save(itemEntity);
        }

        log.info("采购退货单创建成功: returnNo={}, returnId={}, totalAmount={}", returnNo, returnId, totalAmount);
        return returnId;
    }

    /**
     * 审核退货单（事务边界）
     * @param returnId 退货单ID
     * @param approved 是否通过
     * @param reason 审核原因（驳回时必填）
     */
    @Transactional(rollbackFor = Exception.class)
    public void approveReturn(Long returnId, boolean approved, String reason) {
        Long tenantId = UserContext.tenantId();
        UserContext ctx = UserContext.get();
        String userId = ctx != null ? ctx.getUserId() : null;
        String userName = ctx != null ? ctx.getUsername() : null;

        PurchaseReturn returnEntity = purchaseReturnService.getById(returnId);
        if (returnEntity == null || !returnEntity.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("退货单不存在或不属于当前租户");
        }
        if (!"PENDING".equals(returnEntity.getReturnStatus())) {
            throw new IllegalArgumentException("退货单状态不是待审核，无法审核");
        }

        if (approved) {
            returnEntity.setReturnStatus("APPROVED");
            returnEntity.setApproveTime(LocalDateTime.now());
            returnEntity.setApproveUserId(userId);
            returnEntity.setApproveUserName(userName);
        } else {
            if (!StringUtils.hasText(reason)) {
                throw new IllegalArgumentException("驳回原因不能为空");
            }
            returnEntity.setReturnStatus("REJECTED");
            returnEntity.setApproveTime(LocalDateTime.now());
            returnEntity.setApproveUserId(userId);
            returnEntity.setApproveUserName(userName);
            returnEntity.setRemark("审核驳回: " + reason);
        }

        purchaseReturnService.updateById(returnEntity);
        log.info("采购退货单审核完成: returnId={}, approved={}, status={}", returnId, approved, returnEntity.getReturnStatus());
    }

    /**
     * 完成退货（事务边界）- 更新库存 + 更新应付账款
     * @param returnId 退货单ID
     */
    @Transactional(rollbackFor = Exception.class)
    public void completeReturn(Long returnId) {
        Long tenantId = UserContext.tenantId();
        UserContext ctx = UserContext.get();
        String userId = ctx != null ? ctx.getUserId() : null;
        String userName = ctx != null ? ctx.getUsername() : null;

        PurchaseReturn returnEntity = purchaseReturnService.getById(returnId);
        if (returnEntity == null || !returnEntity.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("退货单不存在或不属于当前租户");
        }
        if (!"APPROVED".equals(returnEntity.getReturnStatus())) {
            throw new IllegalArgumentException("退货单状态不是已审核，无法完成退货");
        }

        // 1. 查询退货明细
        List<PurchaseReturnItem> items = purchaseReturnItemService.list(
                new LambdaQueryWrapper<PurchaseReturnItem>()
                        .eq(PurchaseReturnItem::getTenantId, tenantId)
                        .eq(PurchaseReturnItem::getReturnId, returnId)
        );

        if (items.isEmpty()) {
            throw new IllegalArgumentException("退货明细为空");
        }

        // 2. 更新库存（减少库存）
        for (PurchaseReturnItem item : items) {
            MaterialPurchase purchaseItem = materialPurchaseService.getById(item.getPurchaseId());
            if (purchaseItem != null) {
                try {
                    materialStockService.decreaseStock(purchaseItem, item.getQuantity());
                    log.info("采购退货库存扣减成功: purchaseId={}, quantity={}", item.getPurchaseId(), item.getQuantity());
                } catch (Exception e) {
                    log.warn("采购退货库存扣减失败（可能库存不足或非库存物料）: purchaseId={}, err={}", item.getPurchaseId(), e.getMessage());
                    // 库存扣减失败不阻断主流程（可能物料未入库或已消耗）
                }
            }
        }

        // 3. 更新应付账款（减少应付金额）
        BigDecimal totalAmount = returnEntity.getTotalAmount();
        if (totalAmount != null && totalAmount.compareTo(BigDecimal.ZERO) > 0) {
            // 查询对应的应付账款记录（P0铁律4：必须用AND保持tenant_id隔离，禁止.or()绕过租户过滤）
            List<Payable> payables = payableService.list(
                    new LambdaQueryWrapper<Payable>()
                            .eq(Payable::getTenantId, tenantId)
                            .eq(Payable::getSupplierId, returnEntity.getSupplierId())
                            .eq(Payable::getDeleteFlag, 0)
                            .orderByDesc(Payable::getCreateTime)
            );
            if (!payables.isEmpty()) {
                // 找到最新的未付款应付账款，减少应付金额
                Payable latestPayable = payables.get(0);
                BigDecimal paidAmountDelta = totalAmount.negate(); // 负数：减少应付
                payableService.atomicAddPaidAmount(latestPayable.getId(), paidAmountDelta);
                log.info("采购退货应付账款更新成功: payableId={}, delta={}", latestPayable.getId(), paidAmountDelta);
            } else {
                log.warn("采购退货未找到对应应付账款记录，跳过应付更新: supplierId={}", returnEntity.getSupplierId());
            }
        }

        // 4. 更新退货单状态
        returnEntity.setReturnStatus("RETURNED");
        returnEntity.setReturnTime(LocalDateTime.now());
        purchaseReturnService.updateById(returnEntity);

        log.info("采购退货完成: returnId={}, returnNo={}", returnId, returnEntity.getReturnNo());
    }

    /**
     * 查询退货单列表
     */
    public List<PurchaseReturn> listReturns(Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<PurchaseReturn> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PurchaseReturn::getTenantId, tenantId);
        wrapper.eq(PurchaseReturn::getDeleteFlag, 0);

        String originalPurchaseId = (String) params.get("originalPurchaseId");
        if (StringUtils.hasText(originalPurchaseId)) {
            wrapper.eq(PurchaseReturn::getOriginalPurchaseId, originalPurchaseId);
        }

        String returnStatus = (String) params.get("returnStatus");
        if (StringUtils.hasText(returnStatus)) {
            wrapper.eq(PurchaseReturn::getReturnStatus, returnStatus);
        }

        wrapper.orderByDesc(PurchaseReturn::getCreateTime);
        return purchaseReturnService.list(wrapper);
    }

    /**
     * 查询退货单详情（含明细）
     */
    public Map<String, Object> getReturnDetail(Long returnId) {
        Long tenantId = UserContext.tenantId();
        PurchaseReturn returnEntity = purchaseReturnService.getById(returnId);
        if (returnEntity == null || !returnEntity.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("退货单不存在或不属于当前租户");
        }

        List<PurchaseReturnItem> items = purchaseReturnItemService.list(
                new LambdaQueryWrapper<PurchaseReturnItem>()
                        .eq(PurchaseReturnItem::getTenantId, tenantId)
                        .eq(PurchaseReturnItem::getReturnId, returnId)
        );

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("return", returnEntity);
        result.put("items", items);
        return result;
    }

    /**
     * 生成退货单号：PR+yyyyMMddHHmmss
     */
    private String generateReturnNo() {
        String prefix = "PR";
        String datetime = LocalDateTime.now().format(DATETIME_FMT);
        return prefix + datetime;
    }
}