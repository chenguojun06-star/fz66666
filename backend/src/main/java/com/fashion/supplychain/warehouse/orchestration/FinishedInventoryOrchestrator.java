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
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 成品库存编排层
 * 负责聚合SKU库存、入库记录、款式信息
 */
@Service
@RequiredArgsConstructor
public class FinishedInventoryOrchestrator {

    private final ProductSkuService productSkuService;
    private final ProductWarehousingMapper productWarehousingMapper;
    private final StyleInfoService styleInfoService;
    private final StyleAttachmentService styleAttachmentService;

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
                dto.setLastInboundBy(warehousing.getWarehousingOperatorName());
            }

            // 入库总量
            Integer totalInbound = totalInboundQtyMap.get(styleIdStr);
            dto.setTotalInboundQty(totalInbound != null ? totalInbound : 0);

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
}
