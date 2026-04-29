package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.warehouse.dto.FinishedInventoryDTO;
import com.fashion.supplychain.warehouse.helper.FinishedOutstockHelper;
import com.fashion.supplychain.common.UserContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 成品库存编排层
 * 负责聚合SKU库存、入库记录、款式信息
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FinishedInventoryOrchestrator {

    private final ProductSkuService productSkuService;
    private final ProductWarehousingMapper productWarehousingMapper;
    private final ProductOutstockService productOutstockService;
    private final ProductionOrderService productionOrderService;
    private final StyleInfoService styleInfoService;
    private final StyleAttachmentService styleAttachmentService;

    @Autowired
    private FinishedOutstockHelper finishedOutstockHelper;

    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.orchestration.WarehouseIntelligenceOrchestrator warehouseIntelligenceOrchestrator;

    /**
     * 分页查询成品库存
     */
    public IPage<FinishedInventoryDTO> getFinishedInventoryPage(Map<String, Object> params) {
        int page = Integer.parseInt(params.getOrDefault("page", "1").toString());
        int pageSize = Integer.parseInt(params.getOrDefault("pageSize", "20").toString());
        String orderNo = (String) params.get("orderNo");
        String styleNo = (String) params.get("styleNo");
        String warehouseLocation = (String) params.get("warehouseLocation");
        String keyword = params.get("keyword") == null ? null : String.valueOf(params.get("keyword")).trim();
        String parentOrgUnitId = params.get("parentOrgUnitId") == null ? null : String.valueOf(params.get("parentOrgUnitId")).trim();
        String factoryType = params.get("factoryType") == null ? null : String.valueOf(params.get("factoryType")).trim();

        IPage<ProductSku> skuPageResult = querySkuPage(page, pageSize, styleNo);
        if (skuPageResult.getRecords().isEmpty()) {
            return new Page<>(page, pageSize);
        }
        InventoryLookupContext ctx = buildLookupContext(skuPageResult);
        List<FinishedInventoryDTO> dtoList = buildFilteredDTOs(
                skuPageResult, ctx, orderNo, parentOrgUnitId, factoryType, warehouseLocation, keyword);
        Page<FinishedInventoryDTO> resultPage = new Page<>(page, pageSize, dtoList.size());
        resultPage.setRecords(dtoList);
        return resultPage;
    }

    private static class InventoryLookupContext {
        Map<Long, StyleInfo> styleInfoMap = new HashMap<>();
        Map<Long, String> attachCoverByStyleId = new HashMap<>();
        Map<String, ProductWarehousing> warehousingMap = new HashMap<>();
        Map<String, String> latestOperatorByStyleId = new HashMap<>();
        Map<String, String> latestWarehouseByStyleId = new HashMap<>();
        Map<String, ProductionOrder> orderById = new HashMap<>();
        Map<String, ProductionOrder> orderByNo = new HashMap<>();
        Map<String, ProductOutstock> latestOutstockByStyleId = new HashMap<>();
        Map<String, ProductOutstock> latestOutstockByStyleNo = new HashMap<>();
        Map<String, Integer> totalInboundQtyMap = new HashMap<>();
        Map<String, List<ProductSku>> styleSkuMap = new HashMap<>();
    }

    private IPage<ProductSku> querySkuPage(int page, int pageSize, String styleNo) {
        Long tid = UserContext.tenantId();
        Page<ProductSku> skuPage = new Page<>(page, pageSize);
        LambdaQueryWrapper<ProductSku> wrapper = new LambdaQueryWrapper<>();
        wrapper.gt(ProductSku::getStockQuantity, 0);
        wrapper.eq(ProductSku::getTenantId, tid);
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            List<String> factoryStyleNos = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getFactoryId, ctxFactoryId)
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .select(ProductionOrder::getStyleNo)
                    .list()
                    .stream()
                    .map(ProductionOrder::getStyleNo)
                    .filter(StringUtils::hasText)
                    .distinct()
                    .collect(Collectors.toList());
            if (factoryStyleNos.isEmpty()) {
                return new Page<>(page, pageSize);
            }
            wrapper.in(ProductSku::getStyleNo, factoryStyleNos);
        }
        if (StringUtils.hasText(styleNo)) {
            wrapper.like(ProductSku::getStyleNo, styleNo.trim());
        }
        wrapper.orderByDesc(ProductSku::getUpdateTime);
        return productSkuService.page(skuPage, wrapper);
    }

    private InventoryLookupContext buildLookupContext(IPage<ProductSku> skuPageResult) {
        InventoryLookupContext ctx = new InventoryLookupContext();
        List<Long> styleIds = skuPageResult.getRecords().stream()
                .map(ProductSku::getStyleId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        List<String> styleNos = skuPageResult.getRecords().stream()
                .map(ProductSku::getStyleNo)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(Collectors.toList());
        batchLoadStyleInfoAndCovers(ctx, styleIds);
        batchLoadWarehousingRecords(ctx, styleIds);
        batchLoadProductionOrders(ctx);
        batchLoadOutstockRecords(ctx, styleIds, styleNos);
        computeTotalInboundQty(ctx, styleIds);
        ctx.styleSkuMap = skuPageResult.getRecords().stream()
                .collect(Collectors.groupingBy(ProductSku::getStyleNo));
        return ctx;
    }

    private void batchLoadStyleInfoAndCovers(InventoryLookupContext ctx, List<Long> styleIds) {
        if (styleIds.isEmpty()) {
            return;
        }
        List<StyleInfo> styleInfoList = styleInfoService.listByIds(styleIds);
        ctx.styleInfoMap = styleInfoList.stream()
                .collect(Collectors.toMap(StyleInfo::getId, s -> s, (a, b) -> a));
        List<Long> noCoverIds = ctx.styleInfoMap.values().stream()
                .filter(s -> !StringUtils.hasText(s.getCover()))
                .map(StyleInfo::getId)
                .collect(Collectors.toList());
        if (noCoverIds.isEmpty()) {
            return;
        }
        try {
            List<StyleAttachment> attachments = styleAttachmentService.list(
                    new LambdaQueryWrapper<StyleAttachment>()
                            .in(StyleAttachment::getStyleId, noCoverIds.stream()
                                    .map(String::valueOf).collect(Collectors.toList()))
                            .like(StyleAttachment::getFileType, "image")
                            .eq(StyleAttachment::getStatus, "active")
                            .orderByAsc(StyleAttachment::getCreateTime));
            if (attachments != null) {
                for (StyleAttachment a : attachments) {
                    if (a == null || !StringUtils.hasText(a.getFileUrl())) continue;
                    try {
                        Long sid = Long.valueOf(a.getStyleId());
                        ctx.attachCoverByStyleId.putIfAbsent(sid, a.getFileUrl());
                    } catch (NumberFormatException e) {
                        log.debug("styleId解析失败: {}", a.getStyleId());
                    }
                }
            }
        } catch (Exception e) {
            log.error("[FinishedInventory] 查询款式附件失败（t_style_attachment 可能缺列），跳过封面填充: {}", e.getMessage());
        }
    }

    private void batchLoadWarehousingRecords(InventoryLookupContext ctx, List<Long> styleIds) {
        if (styleIds.isEmpty()) {
            return;
        }
        List<ProductWarehousing> warehousingList = productWarehousingMapper.selectList(
                new LambdaQueryWrapper<ProductWarehousing>()
                    .select(
                        ProductWarehousing::getStyleId,
                        ProductWarehousing::getOrderId,
                        ProductWarehousing::getOrderNo,
                        ProductWarehousing::getStyleName,
                        ProductWarehousing::getWarehouse,
                        ProductWarehousing::getWarehousingEndTime,
                        ProductWarehousing::getWarehousingNo,
                        ProductWarehousing::getWarehousingOperatorName,
                        ProductWarehousing::getQualityOperatorName,
                        ProductWarehousing::getQualifiedQuantity,
                        ProductWarehousing::getDeleteFlag)
                        .in(ProductWarehousing::getStyleId,
                                styleIds.stream().map(String::valueOf).collect(Collectors.toList()))
                        .eq(ProductWarehousing::getDeleteFlag, 0)
                        .orderByDesc(ProductWarehousing::getWarehousingEndTime)
        );
        ctx.warehousingMap = warehousingList.stream()
                .collect(Collectors.toMap(
                        ProductWarehousing::getStyleId,
                        w -> w,
                        (existing, replacement) -> {
                            if (existing.getWarehousingEndTime() != null
                                    && replacement.getWarehousingEndTime() != null) {
                                return existing.getWarehousingEndTime()
                                        .isAfter(replacement.getWarehousingEndTime())
                                        ? existing : replacement;
                            }
                            return existing.getWarehousingEndTime() != null ? existing : replacement;
                        }
                ));
        for (ProductWarehousing warehousing : warehousingList) {
            if (warehousing == null || !StringUtils.hasText(warehousing.getStyleId())) {
                continue;
            }
            String styleId = warehousing.getStyleId();
            if (!ctx.latestOperatorByStyleId.containsKey(styleId)) {
                String operatorName = StringUtils.hasText(warehousing.getWarehousingOperatorName())
                        ? warehousing.getWarehousingOperatorName()
                        : warehousing.getQualityOperatorName();
                if (StringUtils.hasText(operatorName)) {
                    ctx.latestOperatorByStyleId.put(styleId, operatorName);
                }
            }
            if (!ctx.latestWarehouseByStyleId.containsKey(styleId)
                    && StringUtils.hasText(warehousing.getWarehouse())) {
                ctx.latestWarehouseByStyleId.put(styleId, warehousing.getWarehouse());
            }
            if (ctx.latestOperatorByStyleId.containsKey(styleId)
                    && ctx.latestWarehouseByStyleId.containsKey(styleId)) {
                continue;
            }
        }
    }

    private void batchLoadProductionOrders(InventoryLookupContext ctx) {
        Set<String> orderIds = new HashSet<>();
        Set<String> orderNos = new HashSet<>();
        ctx.warehousingMap.values().forEach(item -> {
            if (item != null && StringUtils.hasText(item.getOrderId())) {
                orderIds.add(item.getOrderId());
            }
            if (item != null && StringUtils.hasText(item.getOrderNo())) {
                orderNos.add(item.getOrderNo());
            }
        });
        ctx.styleInfoMap.values().forEach(item -> {
            if (item != null && StringUtils.hasText(item.getOrderNo())) {
                orderNos.add(item.getOrderNo());
            }
        });
        if (!orderIds.isEmpty()) {
            loadProductionOrdersByIdsSafely(orderIds, "finished-inventory-listByIds").forEach(order -> {
                ctx.orderById.put(order.getId(), order);
                if (StringUtils.hasText(order.getOrderNo())) {
                    ctx.orderByNo.put(order.getOrderNo(), order);
                }
            });
        }
        if (!orderNos.isEmpty()) {
            loadProductionOrdersByNosSafely(orderNos, "finished-inventory-listByOrderNo").forEach(order -> {
                if (StringUtils.hasText(order.getOrderNo())) {
                    ctx.orderByNo.put(order.getOrderNo(), order);
                }
            });
        }
    }

    private void batchLoadOutstockRecords(InventoryLookupContext ctx, List<Long> styleIds, List<String> styleNos) {
        if (!styleIds.isEmpty()) {
            try {
                productOutstockService.list(new LambdaQueryWrapper<ProductOutstock>()
                                .in(ProductOutstock::getStyleId,
                                        styleIds.stream().map(String::valueOf).collect(Collectors.toList()))
                                .eq(ProductOutstock::getDeleteFlag, 0)
                                .orderByDesc(ProductOutstock::getCreateTime))
                        .forEach(outstock -> {
                            if (outstock != null && StringUtils.hasText(outstock.getStyleId())) {
                                ctx.latestOutstockByStyleId.putIfAbsent(outstock.getStyleId(), outstock);
                            }
                        });
            } catch (Exception e) {
                log.error("[FinishedInventory] 查询出库记录(byStyleId)失败（t_product_outstock 可能不存在），跳过: {}", e.getMessage());
            }
        }
        if (!styleNos.isEmpty()) {
            try {
                productOutstockService.list(new LambdaQueryWrapper<ProductOutstock>()
                                .in(ProductOutstock::getStyleNo, styleNos)
                                .eq(ProductOutstock::getDeleteFlag, 0)
                                .orderByDesc(ProductOutstock::getCreateTime))
                        .forEach(outstock -> {
                            if (outstock != null && StringUtils.hasText(outstock.getStyleNo())) {
                                ctx.latestOutstockByStyleNo.putIfAbsent(outstock.getStyleNo(), outstock);
                            }
                        });
            } catch (Exception e) {
                log.error("[FinishedInventory] 查询出库记录(byStyleNo)失败（t_product_outstock 可能不存在），跳过: {}", e.getMessage());
            }
        }
    }

    private void computeTotalInboundQty(InventoryLookupContext ctx, List<Long> styleIds) {
        if (styleIds.isEmpty()) {
            return;
        }
        List<ProductWarehousing> allWarehousing = productWarehousingMapper.selectList(
                new LambdaQueryWrapper<ProductWarehousing>()
                    .select(
                        ProductWarehousing::getStyleId,
                        ProductWarehousing::getQualifiedQuantity,
                        ProductWarehousing::getDeleteFlag)
                        .in(ProductWarehousing::getStyleId,
                                styleIds.stream().map(String::valueOf).collect(Collectors.toList()))
                        .eq(ProductWarehousing::getDeleteFlag, 0)
        );
        allWarehousing.forEach(w -> {
            int qty = w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0;
            ctx.totalInboundQtyMap.merge(w.getStyleId(), qty, Integer::sum);
        });
    }

    private List<FinishedInventoryDTO> buildFilteredDTOs(
            IPage<ProductSku> skuPageResult, InventoryLookupContext ctx,
            String orderNo, String parentOrgUnitId, String factoryType,
            String warehouseLocation, String keyword) {
        List<FinishedInventoryDTO> dtoList = new ArrayList<>();
        for (ProductSku sku : skuPageResult.getRecords()) {
            FinishedInventoryDTO dto = buildSingleDTO(sku, ctx);
            if (matchesFilter(dto, orderNo, parentOrgUnitId, factoryType, warehouseLocation, keyword)) {
                dtoList.add(dto);
            }
        }
        return dtoList;
    }

    private FinishedInventoryDTO buildSingleDTO(ProductSku sku, InventoryLookupContext ctx) {
        FinishedInventoryDTO dto = new FinishedInventoryDTO();
        dto.setId(sku.getSkuCode());
        dto.setSku(sku.getSkuCode());
        dto.setStyleId(sku.getStyleId() != null ? sku.getStyleId().toString() : null);
        dto.setStyleNo(sku.getStyleNo());
        dto.setColor(sku.getColor());
        dto.setSize(sku.getSize());
        dto.setAvailableQty(sku.getStockQuantity() != null ? sku.getStockQuantity() : 0);
        dto.setLockedQty(0);
        dto.setDefectQty(0);
        dto.setCostPrice(sku.getCostPrice());
        dto.setSalesPrice(sku.getSalesPrice());
        if (sku.getStyleId() != null) {
            StyleInfo si = ctx.styleInfoMap.get(sku.getStyleId());
            if (si != null) {
                dto.setStyleName(si.getStyleName());
                dto.setStyleImage(StringUtils.hasText(si.getCover()) ? si.getCover()
                        : ctx.attachCoverByStyleId.get(sku.getStyleId()));
                if (StringUtils.hasText(si.getOrderNo())) {
                    dto.setOrderNo(si.getOrderNo());
                }
            }
        }
        String styleIdStr = dto.getStyleId();
        ProductWarehousing wh = ctx.warehousingMap.get(styleIdStr);
        if (wh != null) {
            dto.setOrderId(wh.getOrderId());
            if (StringUtils.hasText(wh.getOrderNo())) dto.setOrderNo(wh.getOrderNo());
            if (!StringUtils.hasText(dto.getStyleName())) dto.setStyleName(wh.getStyleName());
            dto.setWarehouseLocation(wh.getWarehouse());
            dto.setLastInboundDate(wh.getWarehousingEndTime());
            dto.setQualityInspectionNo(wh.getWarehousingNo());
            dto.setLastInboundBy(StringUtils.hasText(wh.getWarehousingOperatorName())
                    ? wh.getWarehousingOperatorName() : wh.getQualityOperatorName());
            dto.setLastInboundQty(wh.getQualifiedQuantity());
        }
        ProductionOrder order = StringUtils.hasText(dto.getOrderId())
                ? ctx.orderById.get(dto.getOrderId()) : ctx.orderByNo.get(dto.getOrderNo());
        if (order == null && StringUtils.hasText(dto.getOrderNo())) {
            order = ctx.orderByNo.get(dto.getOrderNo());
        }
        if (order != null) {
            dto.setFactoryName(order.getFactoryName());
            dto.setFactoryType(order.getFactoryType());
            dto.setOrgUnitId(order.getOrgUnitId());
            dto.setParentOrgUnitId(order.getParentOrgUnitId());
            dto.setParentOrgUnitName(order.getParentOrgUnitName());
            dto.setOrgPath(order.getOrgPath());
        }
        if (!StringUtils.hasText(dto.getLastInboundBy())) {
            dto.setLastInboundBy(ctx.latestOperatorByStyleId.get(styleIdStr));
        }
        if (!StringUtils.hasText(dto.getWarehouseLocation())) {
            dto.setWarehouseLocation(ctx.latestWarehouseByStyleId.get(styleIdStr));
        }
        ProductOutstock os = StringUtils.hasText(styleIdStr)
                ? ctx.latestOutstockByStyleId.get(styleIdStr) : null;
        if (os == null && StringUtils.hasText(dto.getStyleNo())) {
            os = ctx.latestOutstockByStyleNo.get(dto.getStyleNo());
        }
        if (os != null) {
            dto.setLastOutboundDate(os.getCreateTime());
            dto.setLastOutstockNo(os.getOutstockNo());
            dto.setLastOutboundBy(StringUtils.hasText(os.getOperatorName())
                    ? os.getOperatorName() : os.getCreatorName());
        }
        Integer totalInbound = ctx.totalInboundQtyMap.get(styleIdStr);
        dto.setTotalInboundQty(totalInbound != null ? totalInbound : 0);
        List<ProductSku> styleSKUs = ctx.styleSkuMap.get(sku.getStyleNo());
        if (styleSKUs != null) {
            dto.setColors(styleSKUs.stream().map(ProductSku::getColor)
                    .filter(StringUtils::hasText).distinct().collect(Collectors.toList()));
            dto.setSizes(styleSKUs.stream().map(ProductSku::getSize)
                    .filter(StringUtils::hasText).distinct().collect(Collectors.toList()));
        }
        return dto;
    }

    private boolean matchesFilter(FinishedInventoryDTO dto, String orderNo,
            String parentOrgUnitId, String factoryType, String warehouseLocation, String keyword) {
        if (StringUtils.hasText(orderNo) && (dto.getOrderNo() == null || !dto.getOrderNo().contains(orderNo))) {
            return false;
        }
        if (StringUtils.hasText(parentOrgUnitId) && !parentOrgUnitId.equals(dto.getParentOrgUnitId())) {
            return false;
        }
        if (StringUtils.hasText(factoryType) && !factoryType.equalsIgnoreCase(dto.getFactoryType())) {
            return false;
        }
        if (StringUtils.hasText(warehouseLocation) && (dto.getWarehouseLocation() == null || !dto.getWarehouseLocation().contains(warehouseLocation))) {
            return false;
        }
        if (StringUtils.hasText(keyword)) {
            String factoryTypeLabel = "INTERNAL".equalsIgnoreCase(dto.getFactoryType()) ? "内部" : "EXTERNAL".equalsIgnoreCase(dto.getFactoryType()) ? "外部" : "";
            String combined = String.join(" ",
                    Optional.ofNullable(dto.getOrderNo()).orElse(""),
                    Optional.ofNullable(dto.getStyleNo()).orElse(""),
                    Optional.ofNullable(dto.getStyleName()).orElse(""),
                    Optional.ofNullable(dto.getSku()).orElse(""),
                    Optional.ofNullable(dto.getFactoryName()).orElse(""),
                    Optional.ofNullable(dto.getParentOrgUnitName()).orElse(""),
                    Optional.ofNullable(dto.getOrgPath()).orElse(""),
                    factoryTypeLabel
            ).toLowerCase(Locale.ROOT);
            if (!combined.contains(keyword.toLowerCase(Locale.ROOT))) {
                return false;
            }
        }
        return true;
    }


    private List<ProductionOrder> loadProductionOrdersByIdsSafely(Set<String> orderIds, String scene) {
        if (orderIds == null || orderIds.isEmpty()) {
            return Collections.emptyList();
        }
        try {
            return productionOrderService.listByIds(orderIds);
        } catch (Exception ex) {
            log.error("[{}] 按ID加载生产订单失败，跳过订单补充字段，orderIds={}", scene, orderIds, ex);
            return Collections.emptyList();
        }
    }

    private List<ProductionOrder> loadProductionOrdersByNosSafely(Set<String> orderNos, String scene) {
        if (orderNos == null || orderNos.isEmpty()) {
            return Collections.emptyList();
        }
        try {
            return productionOrderService.list(new LambdaQueryWrapper<ProductionOrder>()
                    .in(ProductionOrder::getOrderNo, orderNos)
                    .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0)));
        } catch (Exception ex) {
            log.error("[{}] 按单号加载生产订单失败，跳过订单补充字段，orderNos={}", scene, orderNos, ex);
            return Collections.emptyList();
        }
    }

    /**
     * 成品出库：扣减对应SKU库存
     * @deprecated 建议直接注入 {@link FinishedOutstockHelper} 调用
     */
    @Transactional(rollbackFor = Exception.class)
    public void outbound(Map<String, Object> params) {
        finishedOutstockHelper.outbound(params);
    }

    /**
     * QR码扫码出库
     * @deprecated 建议直接注入 {@link FinishedOutstockHelper} 调用
     */
    @Transactional(rollbackFor = Exception.class)
    public void qrcodeOutbound(Map<String, Object> params) {
        finishedOutstockHelper.qrcodeOutbound(params);
    }

    /**
     * 分页查询出库记录
     * @deprecated 建议直接注入 {@link FinishedOutstockHelper} 调用
     */
    public IPage<ProductOutstock> listOutstockRecords(Map<String, Object> params) {
        return finishedOutstockHelper.listOutstockRecords(params);
    }

    /**
     * 确认收款
     * @deprecated 建议直接注入 {@link FinishedOutstockHelper} 调用
     */
    @Transactional(rollbackFor = Exception.class)
    public void confirmPayment(String id, BigDecimal paidAmount) {
        finishedOutstockHelper.confirmPayment(id, paidAmount);
    }

    /**
     * 审批单条出库记录
     * @deprecated 建议直接注入 {@link FinishedOutstockHelper} 调用
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> approveOutstock(String id, String remark) {
        return finishedOutstockHelper.approveOutstock(id, remark);
    }

    /**
     * 批量审批出库记录
     * @deprecated 建议直接注入 {@link FinishedOutstockHelper} 调用
     */
    @Transactional(rollbackFor = Exception.class)
    public List<Map<String, Object>> batchApproveOutstocks(List<String> ids, String remark) {
        return finishedOutstockHelper.batchApproveOutstocks(ids, remark);
    }

    private String trimToNull(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return StringUtils.hasText(text) ? text : null;
    }
}
