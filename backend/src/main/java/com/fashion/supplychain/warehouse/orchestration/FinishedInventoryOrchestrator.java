package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.warehouse.dto.FinishedInventoryDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 成品库存编排层
 * 负责聚合SKU库存、入库记录等信息
 */
@Service
@RequiredArgsConstructor
public class FinishedInventoryOrchestrator {

    private final ProductSkuService productSkuService;
    private final ProductWarehousingMapper productWarehousingMapper;

    /**
     * 分页查询成品库存
     *
     * @param params 查询参数
     *               - page: 页码
     *               - pageSize: 每页数量
     *               - orderNo: 订单号（模糊搜索）
     *               - styleNo: 款号（模糊搜索）
     *               - warehouseLocation: 库位（模糊搜索）
     * @return 分页结果
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
        wrapper.gt(ProductSku::getStockQuantity, 0); // 只查询有库存的SKU

        if (StringUtils.hasText(styleNo)) {
            wrapper.like(ProductSku::getStyleNo, styleNo.trim());
        }

        wrapper.orderByDesc(ProductSku::getUpdateTime);
        IPage<ProductSku> skuPageResult = productSkuService.page(skuPage, wrapper);

        // 转换为DTO
        List<FinishedInventoryDTO> dtoList = new ArrayList<>();
        List<Long> styleIds = skuPageResult.getRecords().stream()
                .map(ProductSku::getStyleId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());

        // 批量查询入库记录（获取订单信息）
        Map<String, ProductWarehousing> warehousingMap = new HashMap<>();
        if (!styleIds.isEmpty()) {
            List<ProductWarehousing> warehousingList = productWarehousingMapper.selectList(
                    new LambdaQueryWrapper<ProductWarehousing>()
                            .in(ProductWarehousing::getStyleId, styleIds.stream().map(String::valueOf).collect(Collectors.toList()))
                            .orderByDesc(ProductWarehousing::getWarehousingEndTime)
            );

            // 按 styleId + color + size 分组，取最新的一条
            warehousingMap = warehousingList.stream()
                    .collect(Collectors.toMap(
                            w -> w.getStyleId() + "-" + w.getColor() + "-" + w.getSize(),
                            w -> w,
                            (existing, replacement) ->
                                existing.getWarehousingEndTime() != null &&
                                replacement.getWarehousingEndTime() != null &&
                                existing.getWarehousingEndTime().isAfter(replacement.getWarehousingEndTime())
                                ? existing : replacement
                    ));
        }

        // 按款号分组，获取颜色尺码列表
        Map<String, List<ProductSku>> styleSkuMap = skuPageResult.getRecords().stream()
                .collect(Collectors.groupingBy(ProductSku::getStyleNo));

        // 组装DTO
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
            dto.setLockedQty(0); // TODO: 如果有锁定库存功能，从相关表查询
            dto.setDefectQty(0);  // TODO: 从次品表查询

            // 从入库记录补充信息
            String key = dto.getStyleId() + "-" + sku.getColor() + "-" + sku.getSize();
            ProductWarehousing warehousing = warehousingMap.get(key);
            if (warehousing != null) {
                dto.setOrderId(warehousing.getOrderId());
                dto.setOrderNo(warehousing.getOrderNo());
                dto.setStyleName(warehousing.getStyleName());
                dto.setWarehouseLocation(warehousing.getWarehouse());
                dto.setLastInboundDate(warehousing.getWarehousingEndTime());
                dto.setQualityInspectionNo(warehousing.getWarehousingNo());
                dto.setLastInboundBy(warehousing.getWarehousingOperatorName());
            }

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
