package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.MaterialPickingItemMapper;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class MaterialPickingOrchestrator {

    @Autowired
    private MaterialPickingService materialPickingService;

    @Autowired
    private MaterialPickingItemMapper materialPickingItemMapper;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private com.fashion.supplychain.warehouse.orchestration.MaterialPickupOrchestrator materialPickupOrchestrator;

    @Autowired
    private com.fashion.supplychain.warehouse.mapper.MaterialPickupRecordMapper materialPickupRecordMapper;

    /**
     * 取消待出库领料单（仅 pending 状态可操作）。
     * 回退已锁定的库存 + 恢复关联采购单状态 + 删除领料明细与领料单。
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancelPending(String id) {
        Long tenantId = UserContext.tenantId();
        MaterialPicking picking = materialPickingService.lambdaQuery()
                .eq(MaterialPicking::getId, id)
                .eq(MaterialPicking::getTenantId, tenantId)
                .eq(MaterialPicking::getDeleteFlag, 0)
                .one();
        if (picking == null) {
            throw new java.util.NoSuchElementException("领料单不存在");
        }
        if (!UserContext.isSuperAdmin()) {
            if (tenantId == null || !tenantId.equals(picking.getTenantId())) {
                throw new IllegalStateException("无权操作此领料单");
            }
        }
        if (!"pending".equals(picking.getStatus())) {
            throw new IllegalStateException("仅待出库状态的领料单可取消");
        }

        List<MaterialPickingItem> items = materialPickingItemMapper.selectList(
                new LambdaQueryWrapper<MaterialPickingItem>()
                        .eq(MaterialPickingItem::getPickingId, id));

        for (MaterialPickingItem item : items) {
            if (item.getMaterialStockId() != null && item.getQuantity() != null && item.getQuantity() > 0) {
                try {
                    materialStockService.unlockStock(item.getMaterialStockId(), item.getQuantity());
                    log.info("[Picking] 取消待出库: 解锁库存 stockId={}, qty={}", item.getMaterialStockId(), item.getQuantity());
                } catch (Exception e) {
                    log.warn("[Picking] 取消待出库: 解锁库存失败 stockId={}, qty={}, error={}",
                            item.getMaterialStockId(), item.getQuantity(), e.getMessage());
                }
            }
        }

        String cancelPurchaseId = picking.getPurchaseId();
        if (cancelPurchaseId == null || cancelPurchaseId.isEmpty()) {
            String remark = picking.getRemark();
            if (remark != null && remark.contains("purchaseId=")) {
                cancelPurchaseId = remark.substring(remark.indexOf("purchaseId=") + "purchaseId=".length()).trim();
            }
        }
        if (cancelPurchaseId != null && !cancelPurchaseId.isEmpty()) {
            try {
                MaterialPurchase purchase = materialPurchaseService.getById(cancelPurchaseId);
                if (purchase != null && "WAREHOUSE_PENDING".equals(purchase.getStatus())) {
                    purchase.setStatus("pending");
                    purchase.setReceiverId(null);
                    purchase.setReceiverName(null);
                    purchase.setUpdateTime(java.time.LocalDateTime.now());
                    materialPurchaseService.updateById(purchase);
                    log.info("[Picking] 取消待出库: 恢复采购单状态 purchaseId={}", cancelPurchaseId);
                }
            } catch (Exception e) {
                log.warn("[Picking] 取消待出库: 恢复采购单状态失败 purchaseId={}, error={}", cancelPurchaseId, e.getMessage());
            }
        }

        materialPickingItemMapper.delete(
                new LambdaQueryWrapper<MaterialPickingItem>()
                        .eq(MaterialPickingItem::getPickingId, id));
        materialPickingService.removeById(id);
        log.info("[Picking] 取消待出库领料单: pickingNo={}", picking.getPickingNo());
    }

    /**
     * 删除指定 pickingId 下所有的领料明细。
     */
    @Transactional(rollbackFor = Exception.class)
    public void deleteItemsByPickingId(String pickingId) {
        materialPickingItemMapper.delete(
                new LambdaQueryWrapper<MaterialPickingItem>()
                        .eq(MaterialPickingItem::getPickingId, pickingId));
    }

    @Transactional(rollbackFor = Exception.class)
    public void audit(String id, Map<String, Object> body) {
        MaterialPicking picking = materialPickingService.getById(id);
        if (picking == null) throw new java.util.NoSuchElementException("领料单不存在");
        Long tenantId = UserContext.tenantId();
        if (!UserContext.isSuperAdmin()) {
            if (tenantId == null || !tenantId.equals(picking.getTenantId())) {
                throw new IllegalStateException("无权操作此领料单");
            }
        }
        if (!"completed".equals(picking.getStatus())) {
            throw new IllegalStateException("仅已出库的领料单可审核");
        }

        String action = body.get("action") == null ? "approve" : String.valueOf(body.get("action")).trim();
        String remark = body.get("remark") == null ? null : String.valueOf(body.get("remark")).trim();
        String userId = UserContext.userId();
        String userName = UserContext.username();

        if ("approve".equalsIgnoreCase(action)) {
            picking.setAuditStatus("APPROVED");
            picking.setAuditorId(userId);
            picking.setAuditorName(userName);
            picking.setAuditTime(java.time.LocalDateTime.now());
            picking.setAuditRemark(remark);
            String factoryType = resolveFactoryType(picking);
            if ("EXTERNAL".equalsIgnoreCase(factoryType)) {
                syncAuditToPickupRecords(id, remark);
                picking.setFinanceStatus("SETTLED");
                picking.setFinanceRemark(remark != null
                        ? "外发领料审核通过，已生成应收账单：" + remark.trim()
                        : "外发领料审核通过，已自动生成应收账单");
            } else {
                picking.setFinanceStatus("SETTLED");
                picking.setFinanceRemark(remark != null
                        ? "内部领料审核通过（内部平账）：" + remark
                        : "内部领料审核通过，已做内部平账处理");
                syncAuditToPickupRecords(id, remark);
            }
        } else {
            picking.setAuditStatus("REJECTED");
            picking.setAuditorId(userId);
            picking.setAuditorName(userName);
            picking.setAuditTime(java.time.LocalDateTime.now());
            picking.setAuditRemark(remark);
        }
        picking.setUpdateTime(java.time.LocalDateTime.now());
        materialPickingService.updateById(picking);
        log.info("[Picking] 审核领料单: pickingNo={}, action={}", picking.getPickingNo(), action);
    }

    private void syncAuditToPickupRecords(String pickingId, String remark) {
        try {
            List<com.fashion.supplychain.warehouse.entity.MaterialPickupRecord> pickupRecords =
                    materialPickupRecordMapper.selectList(
                            new LambdaQueryWrapper<com.fashion.supplychain.warehouse.entity.MaterialPickupRecord>()
                                    .eq(com.fashion.supplychain.warehouse.entity.MaterialPickupRecord::getSourceRecordId, pickingId)
                                    .eq(com.fashion.supplychain.warehouse.entity.MaterialPickupRecord::getDeleteFlag, 0));
            for (com.fashion.supplychain.warehouse.entity.MaterialPickupRecord pr : pickupRecords) {
                if ("PENDING".equals(pr.getAuditStatus())) {
                    try {
                        Map<String, Object> auditBody = new java.util.LinkedHashMap<>();
                        auditBody.put("action", "approve");
                        auditBody.put("remark", remark);
                        materialPickupOrchestrator.audit(pr.getId(), auditBody);
                    } catch (Exception e) {
                        log.warn("[Picking] 审核关联领取记录失败: prId={}, error={}", pr.getId(), e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[Picking] 审核时同步领取记录失败: pickingId={}, error={}", pickingId, e.getMessage());
        }
    }

    private String resolveFactoryType(MaterialPicking picking) {
        if (StringUtils.hasText(picking.getFactoryType())) return picking.getFactoryType();
        if (StringUtils.hasText(picking.getOrderId())) {
            try {
                ProductionOrder order = productionOrderService.getById(picking.getOrderId().trim());
                if (order != null && StringUtils.hasText(order.getFactoryType())) return order.getFactoryType();
            } catch (Exception e) {
                log.warn("[Picking] 解析工厂类型失败: orderId={}", picking.getOrderId(), e);
            }
        }
        return "INTERNAL";
    }
}
