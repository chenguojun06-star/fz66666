package com.fashion.supplychain.integration.ecommerce.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.integration.ecommerce.entity.EcUniversalStock;
import com.fashion.supplychain.warehouse.entity.WarehouseLocation;
import com.fashion.supplychain.warehouse.service.WarehouseLocationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class SmartWarehouseAllocator {

    @Autowired
    private EcUniversalStockService universalStockService;

    @Autowired
    private WarehouseLocationService warehouseLocationService;

    public AllocationResult allocate(Long tenantId, Long styleId, Long skuId, int requiredQty) {
        List<EcUniversalStock> stocks = universalStockService.list(new LambdaQueryWrapper<EcUniversalStock>()
                .eq(EcUniversalStock::getTenantId, tenantId)
                .eq(EcUniversalStock::getSkuId, skuId)
                .gt(EcUniversalStock::getAvailableStock, 0)
                .orderByDesc(EcUniversalStock::getAvailableStock));

        if (stocks.isEmpty()) {
            log.warn("[SmartWarehouseAllocator] 无可用库存: skuId={}", skuId);
            return AllocationResult.noStock();
        }

        List<WarehouseAllocation> allocations = new ArrayList<>();
        int remaining = requiredQty;

        for (EcUniversalStock stock : stocks) {
            if (remaining <= 0) break;
            int allocQty = Math.min(remaining, stock.getAvailableStock());
            allocations.add(new WarehouseAllocation(stock.getWarehouse(), allocQty, stock.getAvailableStock()));
            remaining -= allocQty;
        }

        boolean fullyAllocated = remaining <= 0;
        log.info("[SmartWarehouseAllocator] 分配结果: skuId={}, 需要={}, 已分配={}, 需拆单={}",
                skuId, requiredQty, requiredQty - remaining, !fullyAllocated);
        return new AllocationResult(fullyAllocated, allocations, remaining);
    }

    public record AllocationResult(boolean fullyAllocated, List<WarehouseAllocation> allocations, int unfulfilledQty) {
        public static AllocationResult noStock() {
            return new AllocationResult(false, Collections.emptyList(), 0);
        }
    }

    public record WarehouseAllocation(String warehouse, int quantity, int availableInWarehouse) {}
}
