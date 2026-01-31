package com.fashion.supplychain.production.mapper;

import com.fashion.supplychain.production.dto.ProductionOrderDTO;
import com.fashion.supplychain.production.entity.ProductionOrder;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 生产订单DTO转换器
 * 负责Entity和DTO之间的转换
 */
@Component
public class ProductionOrderDtoConverter {

    /**
     * 将Entity转换为DTO
     * 排除敏感字段
     */
    public ProductionOrderDTO toDTO(ProductionOrder entity) {
        if (entity == null) {
            return null;
        }

        ProductionOrderDTO dto = new ProductionOrderDTO();
        dto.setId(entity.getId());
        dto.setOrderNo(entity.getOrderNo());
        dto.setStyleId(entity.getStyleId());
        dto.setStyleNo(entity.getStyleNo());
        dto.setStyleName(entity.getStyleName());
        dto.setFactoryName(entity.getFactoryName());
        dto.setOrderQuantity(entity.getOrderQuantity());
        dto.setCompletedQuantity(entity.getCompletedQuantity());
        dto.setProductionProgress(entity.getProductionProgress());
        dto.setStatus(entity.getStatus());
        dto.setCurrentProcessName(entity.getCurrentProcessName());
        dto.setPlannedStartTime(entity.getPlannedStartDate());
        dto.setPlannedEndTime(entity.getPlannedEndDate());
        dto.setActualStartTime(entity.getActualStartDate());
        dto.setCreateTime(entity.getCreateTime());
        dto.setUpdateTime(entity.getUpdateTime());
        dto.setWarehousingQualifiedQuantity(entity.getWarehousingQualifiedQuantity());
        dto.setOutstockQuantity(entity.getOutstockQuantity());
        dto.setInStockQuantity(entity.getInStockQuantity());
        dto.setUnqualifiedQuantity(entity.getUnqualifiedQuantity());
        dto.setRepairQuantity(entity.getRepairQuantity());
        dto.setCuttingQuantity(entity.getCuttingQuantity());
        dto.setCuttingBundleCount(entity.getCuttingBundleCount());

        return dto;
    }

    /**
     * 将Entity列表转换为DTO列表
     */
    public List<ProductionOrderDTO> toDTOList(List<ProductionOrder> entities) {
        if (entities == null) {
            return null;
        }
        return entities.stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }
}
