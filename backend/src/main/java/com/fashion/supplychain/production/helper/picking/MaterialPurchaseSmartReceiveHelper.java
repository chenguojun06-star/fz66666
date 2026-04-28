package com.fashion.supplychain.production.helper.picking;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 智能一键领取（出库优先 + 缺口自动补采购）。
 *
 * <p>从原 {@code MaterialPurchasePickingHelper} 第 94 ~ 376 行剥离。
 * 维持原事务边界与业务行为：单一 {@code @Transactional} 入口
 * {@link #smartReceiveAll(Map)}，库存不足时仍走 partial / purchase 分支。
 */
@Component
@Slf4j
public class MaterialPurchaseSmartReceiveHelper {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialPickingService materialPickingService;

    @Autowired
    private MaterialPurchasePickingSupport support;

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> smartReceiveAll(Map<String, Object> body) {
        String orderNo = body == null ? null
                : (body.get("orderNo") == null ? null : String.valueOf(body.get("orderNo")).trim());
        String receiverId = body == null ? null
                : (body.get("receiverId") == null ? null : String.valueOf(body.get("receiverId")).trim());
        String receiverName = body == null ? null
                : (body.get("receiverName") == null ? null : String.valueOf(body.get("receiverName")).trim());

        if (!StringUtils.hasText(orderNo)) {
            throw new IllegalArgumentException("订单号不能为空");
        }
        if (!StringUtils.hasText(receiverId) && !StringUtils.hasText(receiverName)) {
            throw new IllegalArgumentException("领取人ID或姓名不能为空");
        }

        List<MaterialPurchase> pendingPurchases = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getOrderNo, orderNo)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(MaterialPurchase::getStatus, MaterialConstants.STATUS_PENDING)
                .list();

        if (pendingPurchases.isEmpty()) {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("outboundCount", 0);
            result.put("purchaseCount", 0);
            result.put("message", "无待处理的采购任务");
            return result;
        }

        int outboundCount = 0;
        int purchaseCount = 0;
        List<Map<String, Object>> details = new ArrayList<>();

        Map<String, List<MaterialStock>> stockCache = support.batchQueryStockByPurchases(pendingPurchases);

        for (MaterialPurchase purchase : pendingPurchases) {
            int requiredQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity().intValue() : 0;
            String stockKey = support.stockCacheKey(purchase.getMaterialCode(), purchase.getColor(), purchase.getSize());
            List<MaterialStock> stockList = stockCache.getOrDefault(stockKey, Collections.emptyList());
            int availableStock = support.calcAvailableStock(stockList);

            Map<String, Object> detail = buildDetailBase(purchase, requiredQty, availableStock);
            dispatchPurchase(purchase, receiverId, receiverName, stockList, requiredQty, availableStock, detail);

            if ("outbound".equals(detail.get("action")) || "partial".equals(detail.get("action"))) {
                outboundCount++;
            }
            if ("purchase".equals(detail.get("action")) || "partial".equals(detail.get("action"))) {
                purchaseCount++;
            }
            details.add(detail);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("outboundCount", outboundCount);
        result.put("purchaseCount", purchaseCount);
        result.put("totalCount", pendingPurchases.size());
        result.put("message", String.format("处理完成：%d项走出库，%d项走采购", outboundCount, purchaseCount));
        result.put("details", details);

        log.info("✅ 智能一键领取完成: orderNo={}, 出库={}, 采购={}", orderNo, outboundCount, purchaseCount);
        return result;
    }

    private Map<String, Object> buildDetailBase(MaterialPurchase purchase, int requiredQty, int availableStock) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("materialCode", purchase.getMaterialCode());
        detail.put("materialName", purchase.getMaterialName());
        detail.put("color", purchase.getColor());
        detail.put("size", purchase.getSize());
        detail.put("requiredQty", requiredQty);
        detail.put("availableStock", availableStock);
        return detail;
    }

    private void dispatchPurchase(MaterialPurchase purchase, String receiverId, String receiverName,
                                  List<MaterialStock> stockList, int requiredQty, int availableStock,
                                  Map<String, Object> detail) {
        if (availableStock >= requiredQty && !stockList.isEmpty()) {
            dispatchFullOutbound(purchase, receiverId, receiverName, stockList, detail);
        } else if (availableStock > 0 && !stockList.isEmpty()) {
            dispatchPartialOutbound(purchase, receiverId, receiverName, stockList, requiredQty, availableStock, detail);
        } else {
            detail.put("action", "purchase");
            detail.put("status", "pending");
            detail.put("message", "库存不足，等待采购");
        }
    }

    private void dispatchFullOutbound(MaterialPurchase purchase, String receiverId, String receiverName,
                                      List<MaterialStock> stockList, Map<String, Object> detail) {
        try {
            createOutboundPicking(purchase, receiverId, receiverName, stockList);
            detail.put("action", "outbound");
            detail.put("status", "success");
        } catch (Exception e) {
            log.error("创建出库单失败: materialCode={}, error={}", purchase.getMaterialCode(), e.getMessage());
            detail.put("action", "outbound");
            detail.put("status", "failed");
            detail.put("error", e.getMessage());
        }
    }

    private void dispatchPartialOutbound(MaterialPurchase purchase, String receiverId, String receiverName,
                                         List<MaterialStock> stockList, int requiredQty, int availableStock,
                                         Map<String, Object> detail) {
        try {
            createOutboundPicking(purchase, receiverId, receiverName, stockList, availableStock);
            int deficitQty = requiredQty - availableStock;
            createDeficitPurchase(purchase, deficitQty, receiverId);
            detail.put("action", "partial");
            detail.put("pickedQty", availableStock);
            detail.put("deficitQty", deficitQty);
            detail.put("status", "partial");
            detail.put("message", String.format("部分出库 %d%s，缺口 %d%s 已创建采购任务",
                    availableStock, purchase.getUnit() != null ? purchase.getUnit() : "",
                    deficitQty, purchase.getUnit() != null ? purchase.getUnit() : ""));
        } catch (Exception e) {
            log.error("创建部分出库单失败: materialCode={}, error={}", purchase.getMaterialCode(), e.getMessage());
            detail.put("action", "purchase");
            detail.put("status", "pending");
            detail.put("message", "部分出库失败，保持采购状态");
        }
    }

    private void createDeficitPurchase(MaterialPurchase original, int deficitQty, String receiverId) {
        MaterialPurchase deficitPurchase = new MaterialPurchase();
        deficitPurchase.setOrderId(original.getOrderId());
        deficitPurchase.setOrderNo(original.getOrderNo());
        deficitPurchase.setStyleId(original.getStyleId());
        deficitPurchase.setStyleNo(original.getStyleNo());
        deficitPurchase.setStyleName(original.getStyleName());
        deficitPurchase.setMaterialId(original.getMaterialId());
        deficitPurchase.setMaterialCode(original.getMaterialCode());
        deficitPurchase.setMaterialName(original.getMaterialName());
        deficitPurchase.setMaterialType(original.getMaterialType());
        deficitPurchase.setColor(original.getColor());
        deficitPurchase.setSize(original.getSize());
        deficitPurchase.setUnit(original.getUnit());
        deficitPurchase.setSpecifications(original.getSpecifications());
        deficitPurchase.setPurchaseQuantity(BigDecimal.valueOf(deficitQty));
        deficitPurchase.setStatus("pending");
        deficitPurchase.setRemark("部分领取补采|原任务ID=" + original.getId() + "|缺口=" + deficitQty);
        deficitPurchase.setTenantId(original.getTenantId());
        deficitPurchase.setCreatorId(receiverId);
        deficitPurchase.setCreateTime(LocalDateTime.now());
        deficitPurchase.setUpdateTime(LocalDateTime.now());
        deficitPurchase.setDeleteFlag(0);
        materialPurchaseService.save(deficitPurchase);
    }

    private void createOutboundPicking(MaterialPurchase purchase, String receiverId, String receiverName,
                                       List<MaterialStock> stockList) {
        int pickQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity().intValue() : 0;
        createOutboundPicking(purchase, receiverId, receiverName, stockList, pickQty);
    }

    private void createOutboundPicking(MaterialPurchase purchase, String receiverId, String receiverName,
                                       List<MaterialStock> stockList, int pickQty) {
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
        picking.setPurchaseId(purchase.getId() != null ? purchase.getId() : "");
        picking.setRemark("WAREHOUSE_PICK|purchaseId=" + (purchase.getId() != null ? purchase.getId() : ""));
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
            item.setUnitPrice(stock.getUnitPrice() != null ? stock.getUnitPrice() : purchase.getUnitPrice());
            item.setSpecification(stock.getSpecifications() != null ? stock.getSpecifications() : purchase.getSpecifications());
            item.setSupplierName(stock.getSupplierName());
            item.setMaterialType(stock.getMaterialType() != null ? stock.getMaterialType() : purchase.getMaterialType());
            item.setWarehouseLocation(stock.getLocation());
            item.setCreateTime(LocalDateTime.now());
            items.add(item);

            materialStockService.lockStock(stock.getId(), pickFromThis);

            remainingQty -= pickFromThis;
        }

        String pickingId = materialPickingService.savePendingPicking(picking, items);

        purchase.setStatus(MaterialConstants.STATUS_WAREHOUSE_PENDING);
        purchase.setReceiverId(receiverId);
        purchase.setReceiverName(receiverName);
        purchase.setUpdateTime(LocalDateTime.now());
        materialPurchaseService.updateById(purchase);

        log.info("✅ 智能一键领取出库单完成：pickingId={}, materialCode={}, qty={}, 已推送仓库系统",
                pickingId, purchase.getMaterialCode(), pickQty);
    }
}
