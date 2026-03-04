package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.warehouse.dto.FinishedInventoryDTO;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

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
    private final StyleInfoService styleInfoService;
    private final StyleAttachmentService styleAttachmentService;

    /** 电商订单回写（出库后自动更新平台物流状态） */
    @Lazy
    @Autowired
    private EcommerceOrderOrchestrator ecommerceOrderOrchestrator;

    /**
     * 分页查询成品库存
     */
    public IPage<FinishedInventoryDTO> getFinishedInventoryPage(Map<String, Object> params) {
        // 解析分页参数
        int page = Integer.parseInt(params.getOrDefault("page", "1").toString());
        int pageSize = Integer.parseInt(params.getOrDefault("pageSize", "20").toString());
        String orderNo = (String) params.get("orderNo");
        String styleNo = (String) params.get("styleNo");
        String warehouseLocation = (String) params.get("warehouseLocation");

        // 查询SKU表（有库存的）
        Page<ProductSku> skuPage = new Page<>(page, pageSize);
        LambdaQueryWrapper<ProductSku> wrapper = new LambdaQueryWrapper<>();
        wrapper.gt(ProductSku::getStockQuantity, 0);

        if (StringUtils.hasText(styleNo)) {
            wrapper.like(ProductSku::getStyleNo, styleNo.trim());
        }

        wrapper.orderByDesc(ProductSku::getUpdateTime);
        IPage<ProductSku> skuPageResult = productSkuService.page(skuPage, wrapper);

        // 统计每个 styleId 的当前库存总量（用于与入库汇总口径对齐）
        Map<String, Integer> stockQtyByStyleId = new HashMap<>();
        for (ProductSku sku : skuPageResult.getRecords()) {
            if (sku == null || sku.getStyleId() == null) {
                continue;
            }
            int qty = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
            stockQtyByStyleId.merge(String.valueOf(sku.getStyleId()), qty, Integer::sum);
        }

        // 收集 styleId 列表
        List<Long> styleIds = skuPageResult.getRecords().stream()
                .map(ProductSku::getStyleId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());

        // 批量查询款式信息（获取 styleName, cover 图片）
        Map<Long, StyleInfo> styleInfoMap = new HashMap<>();
        if (!styleIds.isEmpty()) {
            List<StyleInfo> styleInfoList = styleInfoService.listByIds(styleIds);
            styleInfoMap = styleInfoList.stream()
                    .collect(Collectors.toMap(StyleInfo::getId, s -> s, (a, b) -> a));
        }

        // 第二级兜底：对 cover 为空的款式，从 t_style_attachment 取第一张图
        Map<Long, String> attachCoverByStyleId = new HashMap<>();
        if (!styleInfoMap.isEmpty()) {
            List<Long> noCoverIds = styleInfoMap.values().stream()
                    .filter(s -> !StringUtils.hasText(s.getCover()))
                    .map(StyleInfo::getId)
                    .collect(Collectors.toList());
            if (!noCoverIds.isEmpty()) {
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
                            attachCoverByStyleId.putIfAbsent(sid, a.getFileUrl());
                        } catch (NumberFormatException ignored) {}
                    }
                }
            }
        }

        // 批量查询入库记录（按 styleId 分组，取最新一条）
        // 注意：t_product_warehousing 没有 color/size 列，只能按 styleId 匹配
        Map<String, ProductWarehousing> warehousingMap = new HashMap<>();
        Map<String, String> latestOperatorByStyleId = new HashMap<>();
        Map<String, String> latestWarehouseByStyleId = new HashMap<>();
        if (!styleIds.isEmpty()) {
            List<ProductWarehousing> warehousingList = productWarehousingMapper.selectList(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .in(ProductWarehousing::getStyleId,
                                    styleIds.stream().map(String::valueOf).collect(Collectors.toList()))
                            .eq(ProductWarehousing::getDeleteFlag, 0)
                            .orderByDesc(ProductWarehousing::getWarehousingEndTime)
            );

            // 按 styleId 分组，取最新的一条
            warehousingMap = warehousingList.stream()
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

            // 提取每个 styleId 的“最新非空操作人/库位”用于兜底，避免页面显示 '-'
            for (ProductWarehousing warehousing : warehousingList) {
                if (warehousing == null || !StringUtils.hasText(warehousing.getStyleId())) {
                    continue;
                }
                String styleId = warehousing.getStyleId();
                if (!latestOperatorByStyleId.containsKey(styleId)) {
                    String operatorName = StringUtils.hasText(warehousing.getWarehousingOperatorName())
                            ? warehousing.getWarehousingOperatorName()
                            : warehousing.getQualityOperatorName();
                    if (StringUtils.hasText(operatorName)) {
                        latestOperatorByStyleId.put(styleId, operatorName);
                    }
                }
                if (!latestWarehouseByStyleId.containsKey(styleId)
                        && StringUtils.hasText(warehousing.getWarehouse())) {
                    latestWarehouseByStyleId.put(styleId, warehousing.getWarehouse());
                }
                if (latestOperatorByStyleId.containsKey(styleId)
                        && latestWarehouseByStyleId.containsKey(styleId)) {
                    continue;
                }
            }
        }

        // 统计每个 styleId 的总入库数量
        Map<String, Integer> totalInboundQtyMap = new HashMap<>();
        if (!styleIds.isEmpty()) {
            List<ProductWarehousing> allWarehousing = productWarehousingMapper.selectList(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .in(ProductWarehousing::getStyleId,
                                    styleIds.stream().map(String::valueOf).collect(Collectors.toList()))
                            .eq(ProductWarehousing::getDeleteFlag, 0)
            );
            allWarehousing.forEach(w -> {
                int qty = w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0;
                totalInboundQtyMap.merge(w.getStyleId(), qty, Integer::sum);
            });
        }

        // 按款号分组，获取颜色尺码列表
        Map<String, List<ProductSku>> styleSkuMap = skuPageResult.getRecords().stream()
                .collect(Collectors.groupingBy(ProductSku::getStyleNo));

        // 组装DTO
        List<FinishedInventoryDTO> dtoList = new ArrayList<>();
        for (ProductSku sku : skuPageResult.getRecords()) {
            FinishedInventoryDTO dto = new FinishedInventoryDTO();

            // 基础SKU信息
            dto.setId(sku.getSkuCode());
            dto.setSku(sku.getSkuCode());
            dto.setStyleId(sku.getStyleId() != null ? sku.getStyleId().toString() : null);
            dto.setStyleNo(sku.getStyleNo());
            dto.setColor(sku.getColor());
            dto.setSize(sku.getSize());
            dto.setAvailableQty(sku.getStockQuantity() != null ? sku.getStockQuantity() : 0);
            dto.setLockedQty(0);
            dto.setDefectQty(0);
            dto.setCostPrice(sku.getCostPrice());     // 成本价
            dto.setSalesPrice(sku.getSalesPrice());   // 销售价

            // 从款式信息补充 styleName, styleImage
            if (sku.getStyleId() != null) {
                StyleInfo styleInfo = styleInfoMap.get(sku.getStyleId());
                if (styleInfo != null) {
                    dto.setStyleName(styleInfo.getStyleName());
                    String cover = styleInfo.getCover();
                    dto.setStyleImage(StringUtils.hasText(cover) ? cover
                            : attachCoverByStyleId.get(sku.getStyleId()));
                    // 如果款式表有订单号也取出来
                    if (StringUtils.hasText(styleInfo.getOrderNo())) {
                        dto.setOrderNo(styleInfo.getOrderNo());
                    }
                }
            }

            // 从入库记录补充信息（按 styleId 匹配）
            String styleIdStr = dto.getStyleId();
            ProductWarehousing warehousing = warehousingMap.get(styleIdStr);
            if (warehousing != null) {
                dto.setOrderId(warehousing.getOrderId());
                // 优先使用入库记录的订单号
                if (StringUtils.hasText(warehousing.getOrderNo())) {
                    dto.setOrderNo(warehousing.getOrderNo());
                }
                // 如果款式信息没有名称，用入库记录的
                if (!StringUtils.hasText(dto.getStyleName())) {
                    dto.setStyleName(warehousing.getStyleName());
                }
                dto.setWarehouseLocation(warehousing.getWarehouse());
                dto.setLastInboundDate(warehousing.getWarehousingEndTime());
                dto.setQualityInspectionNo(warehousing.getWarehousingNo());
                String latestInboundBy = StringUtils.hasText(warehousing.getWarehousingOperatorName())
                        ? warehousing.getWarehousingOperatorName()
                        : warehousing.getQualityOperatorName();
                dto.setLastInboundBy(latestInboundBy);
            }

            // 兜底：若最新记录缺少操作人/库位，回填“最新非空值”
            if (!StringUtils.hasText(dto.getLastInboundBy())) {
                dto.setLastInboundBy(latestOperatorByStyleId.get(styleIdStr));
            }
            if (!StringUtils.hasText(dto.getWarehouseLocation())) {
                dto.setWarehouseLocation(latestWarehouseByStyleId.get(styleIdStr));
            }

            // 入库总量
            Integer totalInbound = totalInboundQtyMap.get(styleIdStr);
            int inboundQty = totalInbound != null ? totalInbound : 0;
            int stockQty = stockQtyByStyleId.getOrDefault(styleIdStr, 0);
            dto.setTotalInboundQty(Math.max(inboundQty, stockQty));

            // 获取该款式的所有颜色和尺码
            List<ProductSku> styleSKUs = styleSkuMap.get(sku.getStyleNo());
            if (styleSKUs != null) {
                dto.setColors(styleSKUs.stream()
                        .map(ProductSku::getColor)
                        .filter(StringUtils::hasText)
                        .distinct()
                        .collect(Collectors.toList()));
                dto.setSizes(styleSKUs.stream()
                        .map(ProductSku::getSize)
                        .filter(StringUtils::hasText)
                        .distinct()
                        .collect(Collectors.toList()));
            }

            // 应用过滤条件
            boolean match = true;
            if (StringUtils.hasText(orderNo) && (dto.getOrderNo() == null || !dto.getOrderNo().contains(orderNo))) {
                match = false;
            }
            if (StringUtils.hasText(warehouseLocation) && (dto.getWarehouseLocation() == null || !dto.getWarehouseLocation().contains(warehouseLocation))) {
                match = false;
            }

            if (match) {
                dtoList.add(dto);
            }
        }

        // 构建分页结果
        Page<FinishedInventoryDTO> resultPage = new Page<>(page, pageSize, skuPageResult.getTotal());
        resultPage.setRecords(dtoList);
        return resultPage;
    }

    /**
     * 成品出库：扣减对应SKU库存
     *
     * @param params 包含 items 列表，每项含 sku（skuCode）和 quantity
     */
    @Transactional(rollbackFor = Exception.class)
    public void outbound(Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) params.get("items");
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("出库明细不能为空");
        }
        for (Map<String, Object> item : items) {
            String skuCode = (String) item.get("sku");
            if (!StringUtils.hasText(skuCode)) {
                throw new IllegalArgumentException("SKU编码不能为空");
            }
            int quantity = Integer.parseInt(item.getOrDefault("quantity", "0").toString());
            if (quantity <= 0) {
                throw new IllegalArgumentException("出库数量必须大于0: " + skuCode);
            }
            LambdaQueryWrapper<ProductSku> wrapper = new LambdaQueryWrapper<ProductSku>()
                    .eq(ProductSku::getSkuCode, skuCode);
            ProductSku sku = productSkuService.getOne(wrapper);
            if (sku == null) {
                throw new IllegalArgumentException("SKU不存在: " + skuCode);
            }
            int current = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
            if (current < quantity) {
                throw new IllegalArgumentException(
                        "库存不足: " + skuCode + "，可用库存:" + current + "件，申请出库:" + quantity + "件");
            }
            sku.setStockQuantity(current - quantity);
            productSkuService.updateById(sku);
        }
        // 出库后回写电商订单状态（如果同一批出库挺带了关联的生产单号 + 快递单号）
        String productionOrderNo = (String) params.get("productionOrderNo");
        String trackingNo = (String) params.get("trackingNo");
        String expressCompany = (String) params.getOrDefault("expressCompany", "");
        if (StringUtils.hasText(productionOrderNo)) {
            try {
                ecommerceOrderOrchestrator.onWarehouseOutbound(productionOrderNo, trackingNo, expressCompany);
            } catch (Exception ex) {
                log.warn("[EC回写失败不阻塞主流程] productionOrderNo={} err={}", productionOrderNo, ex.getMessage());
            }
        }
    }
}
