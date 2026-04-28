package com.fashion.supplychain.production.helper.picking;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.helper.ExternalFactoryMaterialDeductionHelper;
import com.fashion.supplychain.production.mapper.MaterialOutboundLogMapper;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestratorHelper;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.warehouse.orchestration.MaterialPickupOrchestrator;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 仓库领取与确认出库（两步流）。
 *
 * <p>从原 {@code MaterialPurchasePickingHelper} 第 525 ~ 732 行剥离：
 * 单项仓库领取 {@link #warehousePickSingle(Map)} 与
 * 仓库确认出库 {@link #confirmPickingOutbound(String)}，
 * 其中确认出库会触发库存扣减、采购单状态推进、领料同步与外发工厂扣款。
 */
@Component
@Slf4j
public class MaterialPurchaseWarehousePickHelper {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialPickingService materialPickingService;

    @Autowired
    private MaterialOutboundLogMapper materialOutboundLogMapper;

    @Autowired
    private MaterialPickupOrchestrator materialPickupOrchestrator;

    @Autowired
    private MaterialPurchaseOrchestratorHelper helper;

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired(required = false)
    private BillAggregationOrchestrator billAggregationOrchestrator;

    @Autowired
    private ExternalFactoryMaterialDeductionHelper externalFactoryDeductionHelper;

    @Autowired
    private MaterialPurchasePickingSupport support;

    // ───────────── 单项仓库领取 ─────────────

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> warehousePickSingle(Map<String, Object> body) {
        String purchaseId = ParamUtils.toTrimmedString(body == null ? null : body.get("purchaseId"));
        int pickQty = ParamUtils.toIntSafe(body == null ? null : body.get("pickQty"));
        String receiverId = ParamUtils.toTrimmedString(body == null ? null : body.get("receiverId"));
        String receiverName = ParamUtils.toTrimmedString(body == null ? null : body.get("receiverName"));

        if (!StringUtils.hasText(purchaseId)) {
            throw new IllegalArgumentException("采购任务ID不能为空");
        }
        if (pickQty <= 0) {
            throw new IllegalArgumentException("领取数量必须大于0");
        }

        MaterialPurchase purchase = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getId, purchaseId)
                .eq(MaterialPurchase::getTenantId, UserContext.tenantId())
                .one();
        if (purchase == null) {
            throw new NoSuchElementException("采购任务不存在");
        }
        if (MaterialConstants.STATUS_WAREHOUSE_PENDING.equals(purchase.getStatus())) {
            throw new IllegalStateException("该物料已提交仓库出库申请（待仓库确认），请勿重复提交");
        }

        String materialCode = purchase.getMaterialCode();
        int availableStock = support.calcAvailableStock(materialCode, purchase.getColor(), purchase.getSize());
        if (availableStock < pickQty) {
            throw new IllegalArgumentException("仓库库存不足，可用库存: " + availableStock + "，需领取: " + pickQty);
        }

        List<MaterialStock> stockList = support.queryStockList(materialCode, purchase.getColor(), purchase.getSize());
        String pickingId = createPendingPicking(purchase, stockList, pickQty, receiverId, receiverName);

        purchase.setStatus(MaterialConstants.STATUS_WAREHOUSE_PENDING);
        purchase.setReceiverId(receiverId);
        purchase.setReceiverName(receiverName);
        purchase.setUpdateTime(LocalDateTime.now());
        materialPurchaseService.updateById(purchase);

        int requiredQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity().intValue() : 0;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("pickingId", pickingId);
        result.put("pickingNo", "PICK-" + System.currentTimeMillis());
        result.put("pickedQty", pickQty);
        result.put("remainingPurchaseQty", Math.max(0, requiredQty - pickQty));
        result.put("materialCode", materialCode);
        result.put("materialName", purchase.getMaterialName());
        log.info("✅ 仓库单项领取成功: pickingId={}, materialCode={}, qty={}", pickingId, materialCode, pickQty);
        return result;
    }

    private String createPendingPicking(MaterialPurchase purchase, List<MaterialStock> stockList,
                                        int pickQty, String receiverId, String receiverName) {
        MaterialPicking picking = new MaterialPicking();
        picking.setPickingNo("PICK-" + System.currentTimeMillis());
        picking.setOrderId(purchase.getOrderId());
        picking.setOrderNo(purchase.getOrderNo());
        picking.setStyleId(purchase.getStyleId());
        picking.setStyleNo(purchase.getStyleNo());
        picking.setPickerId(receiverId);
        picking.setPickerName(receiverName);
        picking.setPickupType(support.resolvePickupType(purchase));
        picking.setUsageType(support.resolveUsageType(purchase));
        picking.setPickTime(LocalDateTime.now());
        picking.setStatus("pending");
        picking.setPurchaseId(purchase.getId());
        picking.setRemark("WAREHOUSE_PICK|purchaseId=" + purchase.getId());
        picking.setCreateTime(LocalDateTime.now());
        picking.setUpdateTime(LocalDateTime.now());
        picking.setDeleteFlag(0);

        List<MaterialPickingItem> items = new ArrayList<>();
        int remainingQty = pickQty;
        for (MaterialStock stock : stockList) {
            if (remainingQty <= 0) {
                break;
            }
            int stockAvailable = Math.max(0,
                    (stock.getQuantity() != null ? stock.getQuantity() : 0)
                            - (stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0));
            if (stockAvailable <= 0) {
                continue;
            }
            int pickFromThis = Math.min(remainingQty, stockAvailable);

            MaterialPickingItem item = new MaterialPickingItem();
            item.setMaterialStockId(stock.getId());
            item.setMaterialId(stock.getMaterialId());
            item.setMaterialCode(stock.getMaterialCode());
            item.setMaterialName(stock.getMaterialName());
            item.setColor(stock.getColor());
            item.setSize(stock.getSize());
            item.setQuantity(pickFromThis);
            item.setUnit(stock.getUnit());
            item.setCreateTime(LocalDateTime.now());
            items.add(item);
            materialStockService.lockStock(stock.getId(), pickFromThis);
            remainingQty -= pickFromThis;
        }
        return materialPickingService.savePendingPicking(picking, items);
    }

    // ───────────── 仓库确认出库 ─────────────

    @Transactional(rollbackFor = Exception.class)
    public void confirmPickingOutbound(String pickingId) {
        if (!StringUtils.hasText(pickingId)) {
            throw new IllegalArgumentException("出库单ID不能为空");
        }
        MaterialPicking picking = materialPickingService.getById(pickingId);
        if (picking == null || (picking.getDeleteFlag() != null && picking.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("出库单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(picking.getTenantId(), "领料出库单");
        if (!"pending".equalsIgnoreCase(picking.getStatus())) {
            throw new IllegalStateException("该出库单状态不是待出库，当前状态: " + picking.getStatus());
        }

        List<MaterialPickingItem> items = materialPickingService.getItemsByPickingId(pickingId);
        int pickedTotalQty = deductStockForOutboundItems(picking, items);

        picking.setStatus("completed");
        picking.setUpdateTime(LocalDateTime.now());
        materialPickingService.updateById(picking);

        MaterialPurchase purchase = updatePurchaseAfterOutbound(picking);

        syncPickupRecordAfterOutbound(picking, purchase, items, pickedTotalQty);

        MaterialPurchasePickingSupport.FactorySnapshot factorySnapshot = support.resolveFactorySnapshot(purchase, picking);
        if ("EXTERNAL".equalsIgnoreCase(factorySnapshot.factoryType)) {
            externalFactoryDeductionHelper.applyMaterialDeduction(picking, purchase, items, factorySnapshot);
        }

        log.info("✅ 仓库确认出库完成: pickingId={}, itemCount={}", pickingId, items.size());
    }

    private int deductStockForOutboundItems(MaterialPicking picking, List<MaterialPickingItem> items) {
        LocalDateTime outboundTime = LocalDateTime.now();
        int pickedTotalQty = 0;
        List<String> stockIds = items.stream()
                .map(MaterialPickingItem::getMaterialStockId)
                .filter(id -> id != null).distinct().toList();
        Map<String, MaterialStock> stockMap = stockIds.isEmpty()
                ? Map.of()
                : materialStockService.listByIds(stockIds).stream()
                        .collect(java.util.stream.Collectors.toMap(MaterialStock::getId, s -> s, (a, b) -> a));
        for (MaterialPickingItem item : items) {
            if (item.getQuantity() != null && item.getQuantity() > 0) {
                pickedTotalQty += item.getQuantity();
                MaterialStock stock = null;
                if (item.getMaterialStockId() != null) {
                    stock = stockMap.get(item.getMaterialStockId());
                    if (stock != null) {
                        materialStockService.decreaseStockAndUnlock(item.getMaterialStockId(), item.getQuantity());
                    }
                } else {
                    materialStockService.decreaseStock(
                            item.getMaterialId(), item.getColor(), item.getSize(), item.getQuantity());
                }
                recordOutboundLog(picking, item, stock, outboundTime);
            }
        }
        return pickedTotalQty;
    }

    private MaterialPurchase updatePurchaseAfterOutbound(MaterialPicking picking) {
        MaterialPurchase purchase = null;
        String associatedPurchaseId = picking.getPurchaseId();
        if (!StringUtils.hasText(associatedPurchaseId)) {
            String remark = picking.getRemark();
            if (StringUtils.hasText(remark) && remark.contains("purchaseId=")) {
                associatedPurchaseId = remark.substring(remark.indexOf("purchaseId=") + "purchaseId=".length()).trim();
            }
        }
        if (StringUtils.hasText(associatedPurchaseId)) {
            purchase = materialPurchaseService.lambdaQuery()
                    .eq(MaterialPurchase::getId, associatedPurchaseId)
                    .eq(MaterialPurchase::getTenantId, UserContext.tenantId())
                    .one();
            if (purchase != null) {
                purchase.setStatus(MaterialConstants.STATUS_AWAITING_CONFIRM);
                purchase.setReceivedTime(LocalDateTime.now());
                purchase.setUpdateTime(LocalDateTime.now());
                materialPurchaseService.updateById(purchase);
                try {
                    if (StringUtils.hasText(purchase.getOrderId())) {
                        helper.recomputeAndUpdateMaterialArrivalRate(purchase.getOrderId(), productionOrderOrchestrator);
                    }
                } catch (Exception e) {
                    log.warn("confirmPickingOutbound: 同步订单面料到货率失败, purchaseId={}", associatedPurchaseId, e);
                }
            }
        }
        return purchase;
    }

    private void syncPickupRecordAfterOutbound(MaterialPicking picking, MaterialPurchase purchase,
                                               List<MaterialPickingItem> items, int pickedTotalQty) {
        if (picking == null || pickedTotalQty <= 0 || items == null || items.isEmpty()) {
            return;
        }

        MaterialPurchasePickingSupport.FactorySnapshot factorySnapshot = support.resolveFactorySnapshot(purchase, picking);

        for (MaterialPickingItem item : items) {
            String itemSyncRemark = support.buildPickupRemark(picking, purchase) + "|itemId=" + item.getId();
            if (support.existsAutoSyncedPickupRecord(itemSyncRemark)) {
                log.info("syncPickupRecordAfterOutbound: 跳过重复同步, pickingId={}, itemId={}",
                        picking.getId(), item.getId());
                continue;
            }

            BigDecimal unitPrice = item.getUnitPrice() != null ? item.getUnitPrice()
                    : (purchase != null ? purchase.getUnitPrice() : null);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("pickupType", support.resolvePickupType(purchase, picking));
            body.put("movementType", "OUTBOUND");
            body.put("sourceType", "PICKING_OUTBOUND");
            body.put("usageType", support.resolveUsageType(purchase, picking));
            body.put("sourceRecordId", picking.getId());
            body.put("sourceDocumentNo", picking.getPickingNo());
            body.put("factoryId", factorySnapshot.factoryId);
            body.put("factoryName", factorySnapshot.factoryName);
            body.put("factoryType", factorySnapshot.factoryType);
            body.put("orderNo", purchase != null ? purchase.getOrderNo() : picking.getOrderNo());
            body.put("styleNo", purchase != null ? purchase.getStyleNo() : picking.getStyleNo());
            body.put("materialId", item.getMaterialId() != null ? item.getMaterialId()
                    : (purchase != null ? purchase.getMaterialId() : null));
            body.put("materialCode", item.getMaterialCode() != null ? item.getMaterialCode()
                    : (purchase != null ? purchase.getMaterialCode() : null));
            body.put("materialName", item.getMaterialName() != null ? item.getMaterialName()
                    : (purchase != null ? purchase.getMaterialName() : null));
            body.put("materialType", item.getMaterialType() != null ? item.getMaterialType()
                    : (purchase != null ? purchase.getMaterialType() : null));
            body.put("color", item.getColor() != null ? item.getColor()
                    : (purchase != null ? purchase.getColor() : null));
            body.put("specification", item.getSpecification() != null ? item.getSpecification()
                    : (purchase != null ? purchase.getSpecifications() : null));
            body.put("fabricComposition", item.getFabricComposition() != null ? item.getFabricComposition()
                    : (purchase != null ? purchase.getFabricComposition() : null));
            body.put("fabricWidth", item.getFabricWidth() != null ? item.getFabricWidth()
                    : (purchase != null ? purchase.getFabricWidth() : null));
            body.put("fabricWeight", purchase != null ? purchase.getFabricWeight() : null);
            body.put("unit", item.getUnit() != null ? item.getUnit()
                    : (purchase != null ? purchase.getUnit() : null));
            body.put("quantity", item.getQuantity() != null ? item.getQuantity() : 0);
            body.put("unitPrice", unitPrice);
            body.put("receiverId", picking.getPickerId());
            body.put("receiverName", picking.getPickerName());
            body.put("issuerId", UserContext.userId());
            body.put("issuerName", UserContext.username());
            body.put("warehouseLocation", item.getWarehouseLocation());
            body.put("remark", itemSyncRemark);

            try {
                materialPickupOrchestrator.create(body);
            } catch (Exception e) {
                log.warn("syncPickupRecordAfterOutbound: 同步item失败, itemId={}, error={}", item.getId(), e.getMessage());
            }
        }
    }

    private void recordOutboundLog(MaterialPicking picking, MaterialPickingItem item,
                                   MaterialStock stock, LocalDateTime outboundTime) {
        MaterialPurchasePickingSupport.FactorySnapshot factorySnapshot = support.resolveFactorySnapshot(null, picking);
        MaterialOutboundLog outboundLog = new MaterialOutboundLog();
        outboundLog.setStockId(stock != null ? stock.getId() : item.getMaterialStockId());
        outboundLog.setOutboundNo(picking.getPickingNo());
        outboundLog.setSourceType("PICKING_OUTBOUND");
        outboundLog.setPickupType(support.resolvePickupType(null, picking));
        outboundLog.setUsageType(support.resolveUsageType(null, picking));
        outboundLog.setOrderId(picking.getOrderId());
        outboundLog.setOrderNo(picking.getOrderNo());
        outboundLog.setStyleId(picking.getStyleId());
        outboundLog.setStyleNo(picking.getStyleNo());
        outboundLog.setFactoryId(factorySnapshot.factoryId);
        outboundLog.setFactoryName(factorySnapshot.factoryName);
        outboundLog.setFactoryType(factorySnapshot.factoryType);
        outboundLog.setPickingId(picking.getId());
        outboundLog.setPickingNo(picking.getPickingNo());
        outboundLog.setMaterialCode(stock != null ? stock.getMaterialCode() : item.getMaterialCode());
        outboundLog.setMaterialName(stock != null ? stock.getMaterialName() : item.getMaterialName());
        outboundLog.setQuantity(item.getQuantity());
        outboundLog.setOperatorId(StringUtils.hasText(UserContext.userId()) ? UserContext.userId() : picking.getPickerId());
        outboundLog.setOperatorName(StringUtils.hasText(UserContext.username()) ? UserContext.username() : picking.getPickerName());
        outboundLog.setReceiverId(picking.getPickerId());
        outboundLog.setReceiverName(picking.getPickerName());
        outboundLog.setWarehouseLocation(stock != null ? stock.getLocation() : null);
        outboundLog.setRemark("仓库确认出库|pickingNo=" + picking.getPickingNo());
        outboundLog.setOutboundTime(outboundTime);
        outboundLog.setCreateTime(outboundTime);
        outboundLog.setDeleteFlag(0);
        materialOutboundLogMapper.insert(outboundLog);
        pushMaterialOutboundBill(outboundLog, stock, item, picking);

        if (stock != null && StringUtils.hasText(stock.getId())) {
            MaterialStock patch = new MaterialStock();
            patch.setId(stock.getId());
            patch.setLastOutboundDate(outboundTime);
            patch.setUpdateTime(outboundTime);
            materialStockService.updateById(patch);
        }
    }

    private void pushMaterialOutboundBill(MaterialOutboundLog outboundLog, MaterialStock stock,
                                          MaterialPickingItem item, MaterialPicking picking) {
        if (billAggregationOrchestrator == null || outboundLog == null) {
            return;
        }
        try {
            BigDecimal unitPrice = stock != null ? stock.getUnitPrice() : item.getUnitPrice();
            int qty = item.getQuantity() != null ? item.getQuantity() : 0;
            if (unitPrice == null || qty <= 0) {
                return;
            }
            BigDecimal amount = unitPrice.multiply(BigDecimal.valueOf(qty));
            if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                return;
            }

            BillAggregationOrchestrator.BillPushRequest req = new BillAggregationOrchestrator.BillPushRequest();
            req.setBillType("PAYABLE");
            req.setBillCategory("MATERIAL");
            req.setSourceType("MATERIAL_OUTBOUND");
            req.setSourceId(outboundLog.getId());
            req.setSourceNo(outboundLog.getOutboundNo());

            String supplierId = stock != null ? stock.getSupplierId() : null;
            String supplierName = stock != null ? stock.getSupplierName() : null;
            if (StringUtils.hasText(supplierId) || StringUtils.hasText(supplierName)) {
                req.setCounterpartyType("SUPPLIER");
                req.setCounterpartyId(supplierId);
                req.setCounterpartyName(supplierName);
            } else {
                req.setCounterpartyType("FACTORY");
                req.setCounterpartyId(outboundLog.getFactoryId());
                req.setCounterpartyName(outboundLog.getFactoryName());
            }

            req.setOrderId(outboundLog.getOrderId());
            req.setOrderNo(outboundLog.getOrderNo());
            req.setStyleNo(outboundLog.getStyleNo());
            req.setAmount(amount);
            req.setRemark("物料出库自动入账|pickingNo=" + (picking != null ? picking.getPickingNo() : "")
                    + "|material=" + outboundLog.getMaterialCode() + "|qty=" + qty);
            billAggregationOrchestrator.pushBill(req);
        } catch (Exception e) {
            log.warn("物料出库推送账单失败（不阻塞主流程）: outboundNo={}", outboundLog.getOutboundNo(), e);
        }
    }

}
