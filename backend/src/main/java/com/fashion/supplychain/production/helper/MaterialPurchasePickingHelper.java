package com.fashion.supplychain.production.helper;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.MaterialOutboundLogMapper;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestratorHelper;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.mapper.MaterialPickingItemMapper;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator;
import com.fashion.supplychain.warehouse.entity.MaterialPickupRecord;
import com.fashion.supplychain.warehouse.mapper.MaterialPickupRecordMapper;
import com.fashion.supplychain.warehouse.orchestration.MaterialPickupOrchestrator;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 物料采购 — 领料/出库/仓库确认 相关方法
 * 从 MaterialPurchaseOrchestrator 拆分而来，减少主编排器行数
 */
@Component
@Slf4j
public class MaterialPurchasePickingHelper {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialPickingService materialPickingService;

    @Autowired
    private MaterialPickingItemMapper materialPickingItemMapper;

    @Autowired
    private MaterialOutboundLogMapper materialOutboundLogMapper;

    @Autowired
    private MaterialPickupOrchestrator materialPickupOrchestrator;

    @Autowired
    private MaterialPickupRecordMapper materialPickupRecordMapper;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MaterialPurchaseOrchestratorHelper helper;

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired(required = false)
    private BillAggregationOrchestrator billAggregationOrchestrator;

    @Autowired
    private ExternalFactoryMaterialDeductionHelper externalFactoryDeductionHelper;

    // ──────────────────────────────────────────────────────────────
    // 智能一键领取
    // ──────────────────────────────────────────────────────────────

    /**
     * 智能一键领取全部（优先使用库存，不足时创建采购）
     * @param body 包含 orderNo(订单号), receiverId, receiverName
     * @return 汇总结果 { outboundCount, purchaseCount, details }
     */
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
            Map<String, Object> result = new java.util.LinkedHashMap<>();
            result.put("outboundCount", 0);
            result.put("purchaseCount", 0);
            result.put("message", "无待处理的采购任务");
            return result;
        }

        int outboundCount = 0;
        int purchaseCount = 0;
        List<Map<String, Object>> details = new ArrayList<>();

        java.util.Map<String, List<MaterialStock>> stockCache = batchQueryStockByPurchases(pendingPurchases);

        for (MaterialPurchase purchase : pendingPurchases) {
            int requiredQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity().intValue() : 0;
            String stockKey = stockCacheKey(purchase.getMaterialCode(), purchase.getColor(), purchase.getSize());
            List<MaterialStock> stockList = stockCache.getOrDefault(stockKey, java.util.Collections.emptyList());
            int availableStock = calcAvailableStock(stockList);

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

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("outboundCount", outboundCount);
        result.put("purchaseCount", purchaseCount);
        result.put("totalCount", pendingPurchases.size());
        result.put("message", String.format("处理完成：%d项走出库，%d项走采购", outboundCount, purchaseCount));
        result.put("details", details);

        log.info("✅ 智能一键领取完成: orderNo={}, 出库={}, 采购={}", orderNo, outboundCount, purchaseCount);
        return result;
    }

    private List<MaterialStock> queryStockByMaterial(MaterialPurchase purchase) {
        LambdaQueryWrapper<MaterialStock> stockWrapper = new LambdaQueryWrapper<>();
        stockWrapper.eq(MaterialStock::getMaterialCode, purchase.getMaterialCode());
        if (StringUtils.hasText(purchase.getColor())) {
            stockWrapper.eq(MaterialStock::getColor, purchase.getColor());
        }
        if (StringUtils.hasText(purchase.getSize())) {
            stockWrapper.eq(MaterialStock::getSize, purchase.getSize());
        }
        return materialStockService.list(stockWrapper);
    }

    private java.util.Map<String, List<MaterialStock>> batchQueryStockByPurchases(List<MaterialPurchase> purchases) {
        java.util.Set<String> materialCodes = purchases.stream()
                .map(MaterialPurchase::getMaterialCode)
                .filter(StringUtils::hasText)
                .collect(java.util.stream.Collectors.toSet());
        if (materialCodes.isEmpty()) return java.util.Collections.emptyMap();
        List<MaterialStock> allStocks = materialStockService.list(new LambdaQueryWrapper<MaterialStock>()
                .in(MaterialStock::getMaterialCode, materialCodes));
        return allStocks.stream()
                .collect(java.util.stream.Collectors.groupingBy(
                        s -> stockCacheKey(s.getMaterialCode(), s.getColor(), s.getSize())));
    }

    private String stockCacheKey(String materialCode, String color, String size) {
        return (materialCode == null ? "" : materialCode) + "|" + (color == null ? "" : color) + "|" + (size == null ? "" : size);
    }

    private int calcAvailableStock(List<MaterialStock> stockList) {
        return stockList.stream()
            .mapToInt(stock -> {
                int qty = stock.getQuantity() != null ? stock.getQuantity() : 0;
                int locked = stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0;
                return Math.max(0, qty - locked);
            })
            .sum();
    }

    private Map<String, Object> buildDetailBase(MaterialPurchase purchase, int requiredQty, int availableStock) {
        Map<String, Object> detail = new java.util.LinkedHashMap<>();
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

    // ──────────────────────────────────────────────────────────────
    // 创建领料出库单
    // ──────────────────────────────────────────────────────────────

    /**
     * 创建领料出库单并扣减库存
     */
    private void createOutboundPicking(MaterialPurchase purchase, String receiverId, String receiverName,
                                       List<MaterialStock> stockList) {
        int pickQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity().intValue() : 0;
        createOutboundPicking(purchase, receiverId, receiverName, stockList, pickQty);
    }

    private void createOutboundPicking(MaterialPurchase purchase, String receiverId, String receiverName,
                                       List<MaterialStock> stockList, int pickQty) {
        // 1. 创建主表（MaterialPicking）—— status="pending"，等待仓库确认后再扣库存
        MaterialPicking picking = new MaterialPicking();
        picking.setPickingNo("PICK-" + System.currentTimeMillis());
        picking.setOrderId(purchase.getOrderId());
        picking.setOrderNo(purchase.getOrderNo());
        picking.setStyleId(purchase.getStyleId());
        picking.setStyleNo(purchase.getStyleNo());
        picking.setPickerId(receiverId);
        picking.setPickerName(receiverName);
        picking.setPickupType(resolvePickupType(purchase));
        picking.setUsageType(resolveUsageType(purchase));
        picking.setPickTime(LocalDateTime.now());
        picking.setStatus("pending");  // 仓库待确认出库
        picking.setPurchaseId(purchase.getId() != null ? purchase.getId() : "");
        picking.setRemark("WAREHOUSE_PICK|purchaseId=" + (purchase.getId() != null ? purchase.getId() : ""));
        picking.setCreateTime(LocalDateTime.now());
        picking.setUpdateTime(LocalDateTime.now());
        picking.setDeleteFlag(0);

        List<MaterialPickingItem> items = new ArrayList<>();

        // 2. 仅准备明细（不扣库存，仓库确认出库时再扣）
        int remainingQty = pickQty;
        for (MaterialStock stock : stockList) {
            if (remainingQty <= 0) break;

            int stockAvailable = Math.max(0,
                (stock.getQuantity() != null ? stock.getQuantity() : 0)
                - (stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0));

            if (stockAvailable <= 0) continue;

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

        // 3. 保存待出库单（不扣库存，但已锁定）
        String pickingId = materialPickingService.savePendingPicking(picking, items);

        // 4. 更新采购任务状态为「仓库待出库」（尚未完成，等仓库出库后变 completed）
        purchase.setStatus(MaterialConstants.STATUS_WAREHOUSE_PENDING);
        purchase.setReceiverId(receiverId);
        purchase.setReceiverName(receiverName);
        purchase.setUpdateTime(LocalDateTime.now());
        materialPurchaseService.updateById(purchase);

        log.info("✅ 智能一键领取出库单完成：pickingId={}, materialCode={}, qty={}, 已推送仓库系统",
            pickingId, purchase.getMaterialCode(), pickQty);
    }

    // ──────────────────────────────────────────────────────────────
    // 智能领取预览
    // ──────────────────────────────────────────────────────────────

    /**
     * 智能领取预览（不执行，仅查询库存状态）
     * 返回该订单所有物料采购任务的需求数量、仓库可用数量和当前状态，供前端显示表格
     */
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
        java.util.Map<String, List<MaterialStock>> stockCache = batchQueryStockByPurchases(allPurchases);
        for (MaterialPurchase purchase : allPurchases) {
            Map<String, Object> item = buildPurchasePreviewItem(purchase, stockCache);
            items.add(item);
            String status = purchase.getStatus() != null ? purchase.getStatus() : "";
            if (MaterialConstants.STATUS_PENDING.equals(status) || MaterialConstants.STATUS_WAREHOUSE_PENDING.equals(status)) {
                pendingCount++;
            }
        }

        List<Map<String, Object>> pickingRecords = queryExistingPickingRecords(byOrderNo, orderNo, byStyleNo, styleNo);

        Map<String, Object> result = new java.util.LinkedHashMap<>();
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

    private LambdaQueryWrapper<MaterialPurchase> buildPurchaseQueryWrapper(boolean byOrderNo, String orderNo, boolean byStyleNo, String styleNo) {
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
            purchaseWrapper.eq(MaterialPurchase::getStyleNo, styleNo.trim()).eq(MaterialPurchase::getSourceType, "sample");
        }
        purchaseWrapper.eq(MaterialPurchase::getDeleteFlag, 0);
        return purchaseWrapper;
    }

    private Map<String, Object> buildPurchasePreviewItem(MaterialPurchase purchase,
            java.util.Map<String, List<MaterialStock>> stockCache) {
        String materialCode = purchase.getMaterialCode();
        String color = purchase.getColor();
        String size = purchase.getSize();
        int requiredQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity().intValue() : 0;
        String status = purchase.getStatus() != null ? purchase.getStatus() : "";
        String stockKey = stockCacheKey(materialCode, color, size);
        int availableStock = calcAvailableStock(stockCache.getOrDefault(stockKey, java.util.Collections.emptyList()));
        boolean isPending = MaterialConstants.STATUS_PENDING.equals(status);
        int canPickQty = isPending ? Math.min(requiredQty, availableStock) : 0;
        int needPurchaseQty = isPending ? Math.max(0, requiredQty - canPickQty) : 0;

        Map<String, Object> item = new java.util.LinkedHashMap<>();
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

    private int calcAvailableStock(String materialCode, String color, String size) {
        LambdaQueryWrapper<MaterialStock> stockWrapper = new LambdaQueryWrapper<>();
        stockWrapper.eq(MaterialStock::getMaterialCode, materialCode);
        if (StringUtils.hasText(color)) stockWrapper.eq(MaterialStock::getColor, color);
        if (StringUtils.hasText(size)) stockWrapper.eq(MaterialStock::getSize, size);
        List<MaterialStock> stockList = materialStockService.list(stockWrapper);
        return stockList.stream()
            .mapToInt(stock -> {
                int qty = stock.getQuantity() != null ? stock.getQuantity() : 0;
                int locked = stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0;
                return Math.max(0, qty - locked);
            }).sum();
    }

    private List<Map<String, Object>> queryExistingPickingRecords(boolean byOrderNo, String orderNo, boolean byStyleNo, String styleNo) {
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
            java.util.List<String> pickingIds = existingPickings.stream()
                    .map(MaterialPicking::getId).filter(StringUtils::hasText).collect(java.util.stream.Collectors.toList());
            java.util.Map<String, java.util.List<MaterialPickingItem>> itemsByPicking = java.util.Collections.emptyMap();
            if (!pickingIds.isEmpty()) {
                itemsByPicking = materialPickingItemMapper.selectList(
                        new LambdaQueryWrapper<MaterialPickingItem>()
                                .in(MaterialPickingItem::getPickingId, pickingIds))
                        .stream()
                        .collect(java.util.stream.Collectors.groupingBy(MaterialPickingItem::getPickingId));
            }
            for (MaterialPicking picking : existingPickings) {
                Map<String, Object> record = new java.util.LinkedHashMap<>();
                record.put("pickingId", picking.getId());
                record.put("pickingNo", picking.getPickingNo());
                record.put("status", picking.getStatus());
                record.put("pickerName", picking.getPickerName());
                record.put("pickTime", picking.getPickTime());
                record.put("remark", picking.getRemark());
                record.put("items", itemsByPicking.getOrDefault(picking.getId(), java.util.Collections.emptyList()));
                pickingRecords.add(record);
            }
        }
        return pickingRecords;
    }

    // ──────────────────────────────────────────────────────────────
    // 单项仓库领取
    // ──────────────────────────────────────────────────────────────

    /**
     * 执行单项仓库领取（从仓库出库指定物料指定数量）
     * @param body { purchaseId, pickQty, receiverId, receiverName }
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> warehousePickSingle(Map<String, Object> body) {
        String purchaseId = ParamUtils.toTrimmedString(body == null ? null : body.get("purchaseId"));
        int pickQty = ParamUtils.toIntSafe(body == null ? null : body.get("pickQty"));
        String receiverId = ParamUtils.toTrimmedString(body == null ? null : body.get("receiverId"));
        String receiverName = ParamUtils.toTrimmedString(body == null ? null : body.get("receiverName"));

        if (!StringUtils.hasText(purchaseId)) throw new IllegalArgumentException("采购任务ID不能为空");
        if (pickQty <= 0) throw new IllegalArgumentException("领取数量必须大于0");

        MaterialPurchase purchase = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getId, purchaseId)
                .eq(MaterialPurchase::getTenantId, UserContext.tenantId())
                .one();
        if (purchase == null) throw new NoSuchElementException("采购任务不存在");
        if (MaterialConstants.STATUS_WAREHOUSE_PENDING.equals(purchase.getStatus())) {
            throw new IllegalStateException("该物料已提交仓库出库申请（待仓库确认），请勿重复提交");
        }

        String materialCode = purchase.getMaterialCode();
        int availableStock = calcAvailableStock(materialCode, purchase.getColor(), purchase.getSize());
        if (availableStock < pickQty) {
            throw new IllegalArgumentException("仓库库存不足，可用库存: " + availableStock + "，需领取: " + pickQty);
        }

        List<MaterialStock> stockList = queryStockList(materialCode, purchase.getColor(), purchase.getSize());
        String pickingId = createPendingPicking(purchase, stockList, pickQty, receiverId, receiverName);

        purchase.setStatus(MaterialConstants.STATUS_WAREHOUSE_PENDING);
        purchase.setReceiverId(receiverId);
        purchase.setReceiverName(receiverName);
        purchase.setUpdateTime(LocalDateTime.now());
        materialPurchaseService.updateById(purchase);

        int requiredQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity().intValue() : 0;
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("pickingId", pickingId);
        result.put("pickingNo", "PICK-" + System.currentTimeMillis());
        result.put("pickedQty", pickQty);
        result.put("remainingPurchaseQty", Math.max(0, requiredQty - pickQty));
        result.put("materialCode", materialCode);
        result.put("materialName", purchase.getMaterialName());
        log.info("✅ 仓库单项领取成功: pickingId={}, materialCode={}, qty={}", pickingId, materialCode, pickQty);
        return result;
    }

    private List<MaterialStock> queryStockList(String materialCode, String color, String size) {
        LambdaQueryWrapper<MaterialStock> stockWrapper = new LambdaQueryWrapper<>();
        stockWrapper.eq(MaterialStock::getMaterialCode, materialCode);
        if (StringUtils.hasText(color)) stockWrapper.eq(MaterialStock::getColor, color);
        if (StringUtils.hasText(size)) stockWrapper.eq(MaterialStock::getSize, size);
        return materialStockService.list(stockWrapper);
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
        picking.setPickupType(resolvePickupType(purchase));
        picking.setUsageType(resolveUsageType(purchase));
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
            if (remainingQty <= 0) break;
            int stockAvailable = Math.max(0,
                (stock.getQuantity() != null ? stock.getQuantity() : 0)
                - (stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0));
            if (stockAvailable <= 0) continue;
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

    // ──────────────────────────────────────────────────────────────
    // 仓库确认出库
    // ──────────────────────────────────────────────────────────────

    /**
     * 仓库确认出库（两步流第二步）
     * 实际扣减库存 + picking 状态改为 completed + 关联采购单改为 completed
     * @param pickingId 待出库单ID（status=pending 的 MaterialPicking）
     */
    @Transactional(rollbackFor = Exception.class)
    public void confirmPickingOutbound(String pickingId) {
        if (!StringUtils.hasText(pickingId)) throw new IllegalArgumentException("出库单ID不能为空");
        MaterialPicking picking = materialPickingService.getById(pickingId);
        if (picking == null || (picking.getDeleteFlag() != null && picking.getDeleteFlag() != 0)) {
            throw new java.util.NoSuchElementException("出库单不存在");
        }
        com.fashion.supplychain.common.tenant.TenantAssert.assertBelongsToCurrentTenant(picking.getTenantId(), "领料出库单");
        if (!"pending".equalsIgnoreCase(picking.getStatus())) {
            throw new IllegalStateException("该出库单状态不是待出库，当前状态: " + picking.getStatus());
        }

        List<com.fashion.supplychain.production.entity.MaterialPickingItem> items =
                materialPickingService.getItemsByPickingId(pickingId);
        int pickedTotalQty = deductStockForOutboundItems(picking, items);

        picking.setStatus("completed");
        picking.setUpdateTime(LocalDateTime.now());
        materialPickingService.updateById(picking);

        MaterialPurchase purchase = updatePurchaseAfterOutbound(picking);

        syncPickupRecordAfterOutbound(picking, purchase, items, pickedTotalQty);

        FactorySnapshot factorySnapshot = resolveFactorySnapshot(purchase, picking);
        if ("EXTERNAL".equalsIgnoreCase(factorySnapshot.factoryType)) {
            externalFactoryDeductionHelper.applyMaterialDeduction(picking, purchase, items, factorySnapshot);
        }

        log.info("✅ 仓库确认出库完成: pickingId={}, itemCount={}", pickingId, items.size());
    }

    private int deductStockForOutboundItems(MaterialPicking picking, List<com.fashion.supplychain.production.entity.MaterialPickingItem> items) {
        LocalDateTime outboundTime = LocalDateTime.now();
        int pickedTotalQty = 0;
        List<String> stockIds = items.stream()
                .map(com.fashion.supplychain.production.entity.MaterialPickingItem::getMaterialStockId)
                .filter(id -> id != null).distinct().toList();
        Map<String, MaterialStock> stockMap = stockIds.isEmpty()
                ? Map.of()
                : materialStockService.listByIds(stockIds).stream()
                        .collect(java.util.stream.Collectors.toMap(MaterialStock::getId, s -> s, (a, b) -> a));
        for (com.fashion.supplychain.production.entity.MaterialPickingItem item : items) {
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

    // ──────────────────────────────────────────────────────────────
    // 撤销出库单
    // ──────────────────────────────────────────────────────────────

    /**
     * 撤销出库单（主管以上权限）
     * 回退库存，恢复采购任务状态，需填写备注原因
     * @param body { pickingId, reason }
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> cancelPicking(Map<String, Object> body) {
        String pickingId = ParamUtils.toTrimmedString(body == null ? null : body.get("pickingId"));
        String reason = ParamUtils.toTrimmedString(body == null ? null : body.get("reason"));

        if (!StringUtils.hasText(pickingId)) throw new IllegalArgumentException("出库单ID不能为空");
        if (!StringUtils.hasText(reason)) throw new IllegalArgumentException("撤销原因不能为空");

        String currentRole = UserContext.role();
        if (currentRole == null || (!currentRole.contains("admin") && !currentRole.contains("supervisor")
                && !currentRole.contains("manager") && !currentRole.contains("主管") && !currentRole.contains("管理员"))) {
            log.warn("用户 {} 尝试撤销出库单，角色: {}", UserContext.username(), currentRole);
        }

        MaterialPicking picking = materialPickingService.getById(pickingId);
        if (picking == null || picking.getDeleteFlag() != null && picking.getDeleteFlag() == 1) {
            throw new NoSuchElementException("出库单不存在或已被删除");
        }
        com.fashion.supplychain.common.tenant.TenantAssert.assertBelongsToCurrentTenant(picking.getTenantId(), "领料出库单");
        if ("cancelled".equals(picking.getStatus())) throw new IllegalStateException("出库单已撤销，不可重复操作");

        List<MaterialPickingItem> items = materialPickingService.getItemsByPickingId(pickingId);
        boolean wasCompleted = "completed".equalsIgnoreCase(picking.getStatus());

        restoreStockForItems(items, wasCompleted);

        picking.setStatus(MaterialConstants.STATUS_CANCELLED);
        picking.setRemark("【撤销】" + reason + " | 操作人: " + UserContext.username() + " | 原备注: " + (picking.getRemark() != null ? picking.getRemark() : ""));
        picking.setUpdateTime(LocalDateTime.now());
        materialPickingService.updateById(picking);

        if (wasCompleted) externalFactoryDeductionHelper.rollbackMaterialDeduction(pickingId);

        restoreRelatedPurchaseStatus(picking.getOrderNo(), items);

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("pickingId", pickingId);
        result.put("pickingNo", picking.getPickingNo());
        result.put("status", "cancelled");
        result.put("reason", reason);
        result.put("restoredItems", items.size());
        log.info("✅ 出库单已撤销: pickingNo={}, reason={}, 回退{}项物料", picking.getPickingNo(), reason, items.size());
        return result;
    }

    private void restoreStockForItems(List<MaterialPickingItem> items, boolean wasCompleted) {
        for (MaterialPickingItem item : items) {
            if (item.getMaterialStockId() != null) {
                if (wasCompleted) {
                    materialStockService.updateStockQuantity(item.getMaterialStockId(), item.getQuantity());
                } else {
                    materialStockService.unlockStock(item.getMaterialStockId(), item.getQuantity());
                }
            }
        }
    }

    private void restoreRelatedPurchaseStatus(String orderNo, List<MaterialPickingItem> items) {
        if (!StringUtils.hasText(orderNo)) return;
        java.util.Set<String> materialCodes = items.stream()
                .map(MaterialPickingItem::getMaterialCode)
                .filter(StringUtils::hasText)
                .collect(java.util.stream.Collectors.toSet());
        if (materialCodes.isEmpty()) return;
        materialPurchaseService.lambdaUpdate()
                .eq(MaterialPurchase::getOrderNo, orderNo)
                .in(MaterialPurchase::getMaterialCode, materialCodes)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .in(MaterialPurchase::getStatus, MaterialConstants.STATUS_COMPLETED, MaterialConstants.STATUS_AWAITING_CONFIRM, MaterialConstants.STATUS_PARTIAL, MaterialConstants.STATUS_WAREHOUSE_PENDING)
                .set(MaterialPurchase::getStatus, MaterialConstants.STATUS_PENDING)
                .set(MaterialPurchase::getReceivedTime, null)
                .set(MaterialPurchase::getReceiverId, null)
                .set(MaterialPurchase::getReceiverName, null)
                .set(MaterialPurchase::getArrivedQuantity, 0)
                .set(MaterialPurchase::getUpdateTime, LocalDateTime.now())
                .update();
        log.info("✅ 采购任务已批量恢复: orderNo={}, materialCodes={}", orderNo, materialCodes);
    }

    // ──────────────────────────────────────────────────────────────
    // 内部辅助方法
    // ──────────────────────────────────────────────────────────────

    private void syncPickupRecordAfterOutbound(
            MaterialPicking picking,
            MaterialPurchase purchase,
            List<MaterialPickingItem> items,
            int pickedTotalQty) {
        if (picking == null || pickedTotalQty <= 0 || items == null || items.isEmpty()) {
            return;
        }

        FactorySnapshot factorySnapshot = resolveFactorySnapshot(purchase, picking);

        for (MaterialPickingItem item : items) {
            String itemSyncRemark = buildPickupRemark(picking, purchase) + "|itemId=" + item.getId();
            if (existsAutoSyncedPickupRecord(itemSyncRemark)) {
                log.info("syncPickupRecordAfterOutbound: 跳过重复同步, pickingId={}, itemId={}",
                        picking.getId(), item.getId());
                continue;
            }

            BigDecimal unitPrice = item.getUnitPrice() != null ? item.getUnitPrice()
                    : (purchase != null ? purchase.getUnitPrice() : null);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("pickupType", resolvePickupType(purchase, picking));
            body.put("movementType", "OUTBOUND");
            body.put("sourceType", "PICKING_OUTBOUND");
            body.put("usageType", resolveUsageType(purchase, picking));
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

    private boolean existsAutoSyncedPickupRecord(String syncRemark) {
        if (!StringUtils.hasText(syncRemark)) {
            return false;
        }
        Long count = materialPickupRecordMapper.selectCount(new LambdaQueryWrapper<MaterialPickupRecord>()
                .eq(MaterialPickupRecord::getDeleteFlag, 0)
                .eq(MaterialPickupRecord::getRemark, syncRemark)
                .last("LIMIT 1"));
        return count != null && count > 0;
    }

    private String resolvePickupType(MaterialPurchase purchase, MaterialPicking picking) {
        if (picking != null && StringUtils.hasText(picking.getPickupType())) {
            return picking.getPickupType().trim();
        }
        if (purchase == null) {
            return "INTERNAL";
        }

        String factoryType = purchase.getFactoryType();
        if (!StringUtils.hasText(factoryType) && StringUtils.hasText(purchase.getOrderId())) {
            ProductionOrder order = productionOrderService.getById(purchase.getOrderId().trim());
            if (order != null) {
                factoryType = order.getFactoryType();
            }
        }

        return StringUtils.hasText(factoryType) && "EXTERNAL".equalsIgnoreCase(factoryType.trim())
                ? "EXTERNAL"
                : "INTERNAL";
    }

    private String resolvePickupType(MaterialPurchase purchase) {
        return resolvePickupType(purchase, null);
    }

    private String resolveUsageType(MaterialPurchase purchase, MaterialPicking picking) {
        if (picking != null && StringUtils.hasText(picking.getUsageType())) {
            return picking.getUsageType().trim();
        }
        if (purchase == null || !StringUtils.hasText(purchase.getSourceType())) {
            return "BULK";
        }
        String sourceType = purchase.getSourceType().trim().toLowerCase();
        if ("sample".equals(sourceType)) {
            return "SAMPLE";
        }
        if ("stock".equals(sourceType)) {
            return "STOCK";
        }
        return "BULK";
    }

    private String resolveUsageType(MaterialPurchase purchase) {
        return resolveUsageType(purchase, null);
    }

    private String buildPickupRemark(MaterialPicking picking, MaterialPurchase purchase) {
        String sourceType = purchase == null ? null : purchase.getSourceType();
        String factoryType = purchase == null ? null : purchase.getFactoryType();
        String orderBizType = purchase == null ? null : purchase.getOrderBizType();

        if ((!StringUtils.hasText(factoryType) || !StringUtils.hasText(orderBizType))
                && purchase != null && StringUtils.hasText(purchase.getOrderId())) {
            ProductionOrder order = productionOrderService.getById(purchase.getOrderId().trim());
            if (order != null) {
                if (!StringUtils.hasText(factoryType)) {
                    factoryType = order.getFactoryType();
                }
                if (!StringUtils.hasText(orderBizType)) {
                    orderBizType = order.getOrderBizType();
                }
            }
        }

        return "AUTO_PICKUP_SYNC"
                + "|sourceType=" + (StringUtils.hasText(sourceType) ? sourceType.trim() : "unknown")
                + "|factoryType=" + (StringUtils.hasText(factoryType) ? factoryType.trim() : "unknown")
                + "|orderBizType=" + (StringUtils.hasText(orderBizType) ? orderBizType.trim() : "unknown")
                + "|purchaseId=" + (purchase != null && StringUtils.hasText(purchase.getId()) ? purchase.getId().trim() : "")
                + "|purchaseNo=" + (purchase != null && StringUtils.hasText(purchase.getPurchaseNo()) ? purchase.getPurchaseNo().trim() : "")
                + "|pickingId=" + (picking != null && StringUtils.hasText(picking.getId()) ? picking.getId().trim() : "")
                + "|pickingNo=" + (picking != null && StringUtils.hasText(picking.getPickingNo()) ? picking.getPickingNo().trim() : "");
    }

    private void recordOutboundLog(MaterialPicking picking, MaterialPickingItem item, MaterialStock stock, LocalDateTime outboundTime) {
        FactorySnapshot factorySnapshot = resolveFactorySnapshot(null, picking);
        MaterialOutboundLog outboundLog = new MaterialOutboundLog();
        outboundLog.setStockId(stock != null ? stock.getId() : item.getMaterialStockId());
        outboundLog.setOutboundNo(picking.getPickingNo());
        outboundLog.setSourceType("PICKING_OUTBOUND");
        outboundLog.setPickupType(resolvePickupType(null, picking));
        outboundLog.setUsageType(resolveUsageType(null, picking));
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

    private void pushMaterialOutboundBill(
            MaterialOutboundLog outboundLog,
            MaterialStock stock,
            MaterialPickingItem item,
            MaterialPicking picking) {
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

    private FactorySnapshot resolveFactorySnapshot(MaterialPurchase purchase, MaterialPicking picking) {
        FactorySnapshot snapshot = new FactorySnapshot();
        if (purchase != null) {
            snapshot.factoryName = purchase.getFactoryName();
            snapshot.factoryType = purchase.getFactoryType();
        }
        String orderId = purchase != null ? purchase.getOrderId() : null;
        String orderNo = purchase != null ? purchase.getOrderNo() : null;
        if (picking != null) {
            if (!StringUtils.hasText(orderId)) {
                orderId = picking.getOrderId();
            }
            if (!StringUtils.hasText(orderNo)) {
                orderNo = picking.getOrderNo();
            }
        }
        ProductionOrder order = null;
        if (StringUtils.hasText(orderId)) {
            order = productionOrderService.getById(orderId.trim());
        }
        if (order == null && StringUtils.hasText(orderNo)) {
            order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getOrderNo, orderNo.trim())
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .last("LIMIT 1")
                    .one();
        }
        if (order != null) {
            snapshot.factoryId = order.getFactoryId();
            if (!StringUtils.hasText(snapshot.factoryName)) {
                snapshot.factoryName = order.getFactoryName();
            }
            if (!StringUtils.hasText(snapshot.factoryType)) {
                snapshot.factoryType = order.getFactoryType();
            }
        }
        if (!StringUtils.hasText(snapshot.factoryType) && purchase != null && StringUtils.hasText(purchase.getFactoryType())) {
            snapshot.factoryType = purchase.getFactoryType().trim();
        }
        if (!StringUtils.hasText(snapshot.factoryName) && purchase != null && StringUtils.hasText(purchase.getFactoryName())) {
            snapshot.factoryName = purchase.getFactoryName().trim();
        }
        return snapshot;
    }

    public static class FactorySnapshot {
        public String factoryId;
        public String factoryName;
        public String factoryType;
    }
}
