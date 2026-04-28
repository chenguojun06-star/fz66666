package com.fashion.supplychain.production.helper.picking;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialPickingItemMapper;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 智能领取预览（只读，不执行任何写操作）。
 *
 * <p>从原 {@code MaterialPurchasePickingHelper} 第 378 ~ 522 行剥离。
 */
@Component
@Slf4j
public class MaterialPurchasePreviewHelper {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private MaterialPickingService materialPickingService;

    @Autowired
    private MaterialPickingItemMapper materialPickingItemMapper;

    @Autowired
    private MaterialPurchasePickingSupport support;

    public Map<String, Object> previewSmartReceive(String orderNo, String styleNo) {
        boolean byOrderNo = StringUtils.hasText(orderNo) && !"-".equals(orderNo.trim());
        boolean byStyleNo = !byOrderNo && StringUtils.hasText(styleNo) && !"-".equals(styleNo.trim());
        if (!byOrderNo && !byStyleNo) {
            throw new IllegalArgumentException("订单号或款号不能同时为空");
        }

        LambdaQueryWrapper<MaterialPurchase> purchaseWrapper = buildPurchaseQueryWrapper(byOrderNo, orderNo, byStyleNo, styleNo);
        List<MaterialPurchase> allPurchases = materialPurchaseService.list(purchaseWrapper);

        List<Map<String, Object>> items = new ArrayList<>();
        int pendingCount = 0;
        Map<String, List<MaterialStock>> stockCache = support.batchQueryStockByPurchases(allPurchases);
        for (MaterialPurchase purchase : allPurchases) {
            Map<String, Object> item = buildPurchasePreviewItem(purchase, stockCache);
            items.add(item);
            String status = purchase.getStatus() != null ? purchase.getStatus() : "";
            if (MaterialConstants.STATUS_PENDING.equals(status) || MaterialConstants.STATUS_WAREHOUSE_PENDING.equals(status)) {
                pendingCount++;
            }
        }

        List<Map<String, Object>> pickingRecords = queryExistingPickingRecords(byOrderNo, orderNo, byStyleNo, styleNo);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderNo", byOrderNo ? orderNo.trim() : "");
        result.put("styleNo", byStyleNo ? styleNo.trim() : "");
        result.put("sourceType", byStyleNo ? "sample" : "bulk");
        result.put("materials", items);
        result.put("pickingRecords", pickingRecords);
        result.put("totalRequired", items.stream().mapToInt(i -> (int) i.get("requiredQty")).sum());
        result.put("totalAvailable", items.stream().mapToInt(i -> (int) i.get("availableStock")).sum());
        result.put("pendingCount", pendingCount);
        result.put("totalCount", items.size());
        return result;
    }

    private LambdaQueryWrapper<MaterialPurchase> buildPurchaseQueryWrapper(boolean byOrderNo, String orderNo,
                                                                          boolean byStyleNo, String styleNo) {
        LambdaQueryWrapper<MaterialPurchase> purchaseWrapper = new LambdaQueryWrapper<>();
        purchaseWrapper.select(
                MaterialPurchase::getId, MaterialPurchase::getMaterialCode, MaterialPurchase::getMaterialName,
                MaterialPurchase::getMaterialType, MaterialPurchase::getColor, MaterialPurchase::getSize,
                MaterialPurchase::getPurchaseQuantity, MaterialPurchase::getStatus, MaterialPurchase::getUnit,
                MaterialPurchase::getArrivedQuantity, MaterialPurchase::getSourceType,
                MaterialPurchase::getOrderNo, MaterialPurchase::getStyleNo);
        if (byOrderNo) {
            purchaseWrapper.eq(MaterialPurchase::getOrderNo, orderNo.trim());
        } else {
            purchaseWrapper.eq(MaterialPurchase::getStyleNo, styleNo.trim())
                    .eq(MaterialPurchase::getSourceType, "sample");
        }
        purchaseWrapper.eq(MaterialPurchase::getDeleteFlag, 0);
        return purchaseWrapper;
    }

    private Map<String, Object> buildPurchasePreviewItem(MaterialPurchase purchase,
                                                        Map<String, List<MaterialStock>> stockCache) {
        String materialCode = purchase.getMaterialCode();
        String color = purchase.getColor();
        String size = purchase.getSize();
        int requiredQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity().intValue() : 0;
        String status = purchase.getStatus() != null ? purchase.getStatus() : "";
        String stockKey = support.stockCacheKey(materialCode, color, size);
        int availableStock = support.calcAvailableStock(stockCache.getOrDefault(stockKey, Collections.emptyList()));
        boolean isPending = MaterialConstants.STATUS_PENDING.equals(status);
        int canPickQty = isPending ? Math.min(requiredQty, availableStock) : 0;
        int needPurchaseQty = isPending ? Math.max(0, requiredQty - canPickQty) : 0;

        Map<String, Object> item = new LinkedHashMap<>();
        item.put("purchaseId", purchase.getId());
        item.put("materialCode", materialCode);
        item.put("materialName", purchase.getMaterialName());
        item.put("materialType", purchase.getMaterialType());
        item.put("color", color != null ? color : "");
        item.put("size", size != null ? size : "");
        item.put("requiredQty", requiredQty);
        item.put("availableStock", availableStock);
        item.put("purchaseStatus", status);
        item.put("canPickQty", canPickQty);
        item.put("needPurchaseQty", needPurchaseQty);
        item.put("unit", purchase.getUnit());
        item.put("arrivedQuantity", purchase.getArrivedQuantity() != null ? purchase.getArrivedQuantity() : 0);
        return item;
    }

    private List<Map<String, Object>> queryExistingPickingRecords(boolean byOrderNo, String orderNo,
                                                                 boolean byStyleNo, String styleNo) {
        LambdaQueryWrapper<MaterialPicking> pickingWrapper = new LambdaQueryWrapper<>();
        pickingWrapper.select(MaterialPicking::getId, MaterialPicking::getPickingNo,
                MaterialPicking::getStatus, MaterialPicking::getPickerName,
                MaterialPicking::getPickTime, MaterialPicking::getRemark);
        if (byOrderNo) {
            pickingWrapper.eq(MaterialPicking::getOrderNo, orderNo.trim());
        } else {
            pickingWrapper.eq(MaterialPicking::getStyleNo, styleNo.trim());
        }
        pickingWrapper.eq(MaterialPicking::getDeleteFlag, 0).orderByDesc(MaterialPicking::getCreateTime);
        List<MaterialPicking> existingPickings = materialPickingService.list(pickingWrapper);

        List<Map<String, Object>> pickingRecords = new ArrayList<>();
        if (!existingPickings.isEmpty()) {
            List<String> pickingIds = existingPickings.stream()
                    .map(MaterialPicking::getId).filter(StringUtils::hasText).collect(Collectors.toList());
            Map<String, List<MaterialPickingItem>> itemsByPicking = Collections.emptyMap();
            if (!pickingIds.isEmpty()) {
                itemsByPicking = materialPickingItemMapper.selectList(
                                new LambdaQueryWrapper<MaterialPickingItem>()
                                        .in(MaterialPickingItem::getPickingId, pickingIds))
                        .stream()
                        .collect(Collectors.groupingBy(MaterialPickingItem::getPickingId));
            }
            for (MaterialPicking picking : existingPickings) {
                Map<String, Object> record = new LinkedHashMap<>();
                record.put("pickingId", picking.getId());
                record.put("pickingNo", picking.getPickingNo());
                record.put("status", picking.getStatus());
                record.put("pickerName", picking.getPickerName());
                record.put("pickTime", picking.getPickTime());
                record.put("remark", picking.getRemark());
                record.put("items", itemsByPicking.getOrDefault(picking.getId(), Collections.emptyList()));
                pickingRecords.add(record);
            }
        }
        return pickingRecords;
    }
}
