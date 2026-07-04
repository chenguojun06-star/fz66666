package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PurchaseReturn;
import com.fashion.supplychain.production.entity.PurchaseReturnItem;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.PurchaseReturnItemService;
import com.fashion.supplychain.production.service.PurchaseReturnService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 采购退货 Orchestrator（P2#10 拆分后）
 * 事务边界：创建退货单 + 审核退货单 + 完成退货（库存+应付）
 *
 * 拆分原则（不影响数据链路）：
 *   - 查询/工具方法 → PurchaseReturnQueryHelper
 *   - 库存扣减/应付更新 → PurchaseReturnStockHelper
 *   - Orchestrator 只保留事务边界 + 流程编排，行数 ≤150
 *
 * 符合 P0 铁律 #1：@Transactional 只在 Orchestrator 层
 */
@Slf4j
@Service
public class PurchaseReturnOrchestrator {

    @Autowired
    private PurchaseReturnService purchaseReturnService;

    @Autowired
    private PurchaseReturnItemService purchaseReturnItemService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private PurchaseReturnQueryHelper queryHelper;

    @Autowired
    private PurchaseReturnStockHelper stockHelper;

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
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) params.get("items");
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("退货物料明细不能为空");
        }

        // 2. 查询原采购单（多租户校验）
        MaterialPurchase originalPurchase = materialPurchaseService.getById(originalPurchaseId);
        if (originalPurchase == null) {
            throw new IllegalArgumentException("原采购单不存在: " + originalPurchaseId);
        }
        if (originalPurchase.getTenantId() == null || !originalPurchase.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("原采购单不属于当前租户");
        }

        // 3. 生成退货单号（P1#1: 加随机后缀防碰撞）
        String returnNo = queryHelper.generateReturnNo();

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

        // 5. 批量查询所有采购记录（避免 N+1 查询，P1#5）
        List<PurchaseReturnItem> itemEntities = buildReturnItems(items, tenantId);
        BigDecimal totalAmount = itemEntities.stream()
                .map(PurchaseReturnItem::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        returnEntity.setTotalAmount(totalAmount);

        purchaseReturnService.save(returnEntity);

        // 6. 保存退货明细（设置 returnId）
        Long returnId = returnEntity.getId();
        for (PurchaseReturnItem itemEntity : itemEntities) {
            itemEntity.setReturnId(returnId);
            purchaseReturnItemService.save(itemEntity);
        }

        log.info("采购退货单创建成功: returnNo={}, returnId={}, totalAmount={}", returnNo, returnId, totalAmount);
        return returnId;
    }

    /**
     * 构建退货明细列表（批量查询采购记录，避免 N+1）
     */
    private List<PurchaseReturnItem> buildReturnItems(List<Map<String, Object>> items, Long tenantId) {
        List<String> purchaseIds = items.stream()
                .map(item -> (String) item.get("purchaseId"))
                .collect(Collectors.toList());
        List<MaterialPurchase> purchaseRecords = materialPurchaseService.listByIds(purchaseIds);
        Map<String, MaterialPurchase> purchaseMap = purchaseRecords.stream()
                .collect(Collectors.toMap(MaterialPurchase::getId, p -> p, (a, b) -> a));

        List<PurchaseReturnItem> itemEntities = new ArrayList<>();
        for (Map<String, Object> item : items) {
            String purchaseId = (String) item.get("purchaseId");
            Integer quantity = (Integer) item.get("quantity");
            if (quantity == null || quantity <= 0) {
                throw new IllegalArgumentException("退货数量必须大于0");
            }
            MaterialPurchase purchaseItem = purchaseMap.get(purchaseId);
            if (purchaseItem == null || !purchaseItem.getTenantId().equals(tenantId)) {
                throw new IllegalArgumentException("采购记录不存在或不属于当前租户: " + purchaseId);
            }
            BigDecimal unitPrice = purchaseItem.getUnitPrice() != null ? purchaseItem.getUnitPrice() : BigDecimal.ZERO;
            BigDecimal amount = unitPrice.multiply(BigDecimal.valueOf(quantity));

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
        return itemEntities;
    }

    /**
     * 审核退货单（事务边界）
     */
    @Transactional(rollbackFor = Exception.class)
    public void approveReturn(Long returnId, boolean approved, String reason) {
        Long tenantId = UserContext.tenantId();
        UserContext ctx = UserContext.get();
        String userId = ctx != null ? ctx.getUserId() : null;
        String userName = ctx != null ? ctx.getUsername() : null;

        // P1#3: 加 delete_flag=0 过滤
        PurchaseReturn returnEntity = purchaseReturnService.lambdaQuery()
                .eq(PurchaseReturn::getId, returnId)
                .eq(PurchaseReturn::getTenantId, tenantId)
                .eq(PurchaseReturn::getDeleteFlag, 0)
                .one();
        if (returnEntity == null) {
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
            // P2#6: 驳回原因结构化追加
            returnEntity.setRemark(queryHelper.appendAuditTrail(returnEntity.getRemark(), "审核驳回", userName, reason));
        }

        purchaseReturnService.updateById(returnEntity);
        log.info("采购退货单审核完成: returnId={}, approved={}, status={}", returnId, approved, returnEntity.getReturnStatus());
    }

    /**
     * 完成退货（事务边界）- 更新库存 + 更新应付账款
     */
    @Transactional(rollbackFor = Exception.class)
    public void completeReturn(Long returnId) {
        Long tenantId = UserContext.tenantId();

        // P1#3: 加 delete_flag=0 过滤
        PurchaseReturn returnEntity = purchaseReturnService.lambdaQuery()
                .eq(PurchaseReturn::getId, returnId)
                .eq(PurchaseReturn::getTenantId, tenantId)
                .eq(PurchaseReturn::getDeleteFlag, 0)
                .one();
        if (returnEntity == null) {
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

        // 2. 扣减库存（P1#4: 失败抛异常触发事务回滚）
        stockHelper.decreaseStockForItems(items);

        // 3. 冲减应付账款
        stockHelper.decreasePayable(returnEntity);

        // 4. 更新退货单状态
        returnEntity.setReturnStatus("RETURNED");
        returnEntity.setReturnTime(LocalDateTime.now());
        purchaseReturnService.updateById(returnEntity);

        log.info("采购退货完成: returnId={}, returnNo={}", returnId, returnEntity.getReturnNo());
    }

    // ─── 查询委托给 Helper（保持 API 契约不变）─────────────────────────────

    public List<PurchaseReturn> listReturns(Map<String, Object> params) {
        return queryHelper.listReturns(params);
    }

    public Map<String, Object> getReturnDetail(Long returnId) {
        return queryHelper.getReturnDetail(returnId);
    }
}
