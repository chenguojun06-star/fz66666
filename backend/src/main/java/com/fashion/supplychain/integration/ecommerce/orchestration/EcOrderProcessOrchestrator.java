package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcOrderSplit;
import com.fashion.supplychain.integration.ecommerce.entity.EcWarehouseAllocation;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.integration.ecommerce.service.EcOrderSplitService;
import com.fashion.supplychain.integration.ecommerce.service.EcUniversalStockService;
import com.fashion.supplychain.integration.ecommerce.service.EcWarehouseAllocationService;
import com.fashion.supplychain.integration.ecommerce.service.SmartWarehouseAllocator;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class EcOrderProcessOrchestrator {

    @Autowired
    private SmartWarehouseAllocator warehouseAllocator;

    @Autowired
    private EcWarehouseAllocationService allocationService;

    @Autowired
    private EcOrderSplitService orderSplitService;

    @Autowired
    private EcUniversalStockService universalStockService;

    @Autowired
    private EcStockOrchestrator stockOrchestrator;

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private EcommerceOrderService ecommerceOrderService;

    @Transactional(rollbackFor = Exception.class)
    public OrderProcessResult processOrder(Long tenantId, Long orderId, String orderNo,
                                           Long styleId, Long skuId, String skuCode, int quantity) {
        TenantAssert.requireTenantId();

        Long effectiveSkuId = skuId;
        Long effectiveStyleId = styleId;
        if (effectiveSkuId == null && skuCode != null) {
            ProductSku sku = productSkuService.getBySkuCode(skuCode);
            if (sku != null) {
                effectiveSkuId = sku.getId();
                effectiveStyleId = sku.getStyleId();
                log.info("[EcOrderProcessOrchestrator] 通过skuCode解析: {} -> skuId={}, styleId={}",
                        skuCode, effectiveSkuId, effectiveStyleId);
            }
        }
        if (effectiveSkuId == null) {
            log.warn("[EcOrderProcessOrchestrator] SKU无法解析: skuCode={}, styleId={}", skuCode, styleId);
            return new OrderProcessResult(false, 0, quantity, "INVALID_SKU");
        }

        universalStockService.recalculateStock(tenantId, effectiveStyleId, effectiveSkuId);

        SmartWarehouseAllocator.AllocationResult allocation =
                warehouseAllocator.allocate(tenantId, effectiveStyleId, effectiveSkuId, quantity);

        if (allocation.allocations().isEmpty()) {
            log.warn("[EcOrderProcessOrchestrator] 无库存可分配: orderNo={}", orderNo);
            stockOrchestrator.syncSkuStock(tenantId, effectiveStyleId, effectiveSkuId);
            return new OrderProcessResult(false, 0, quantity, "OUT_OF_STOCK");
        }

        int totalAllocated = 0;
        for (SmartWarehouseAllocator.WarehouseAllocation wa : allocation.allocations()) {
            EcWarehouseAllocation record = new EcWarehouseAllocation();
            record.setTenantId(tenantId);
            record.setOrderId(orderId);
            record.setOrderNo(orderNo);
            record.setSkuCode(skuCode);
            record.setWarehouse(wa.warehouse());
            record.setAllocatedQuantity(wa.quantity());
            record.setAllocationType("AUTO");
            allocationService.save(record);
            totalAllocated += wa.quantity();
            log.info("[EcOrderProcessOrchestrator] 仓库分配: orderNo={}, warehouse={}, qty={}",
                    orderNo, wa.warehouse(), wa.quantity());
        }

        // 更新订单仓库状态为"备货中"，触发 pendingOrders 扣减可售库存
        ecommerceOrderService.updateWarehouseStatus(orderId, 1);
        log.info("[EcOrderProcessOrchestrator] 订单进入备货: orderId={}, orderNo={}", orderId, orderNo);

        if (!allocation.fullyAllocated()) {
            EcOrderSplit split = new EcOrderSplit();
            split.setTenantId(tenantId);
            split.setOriginalOrderId(orderId);
            split.setOriginalOrderNo(orderNo);
            split.setSkuCode(skuCode);
            split.setSplitQuantity(allocation.unfulfilledQty());
            split.setSplitReason("PARTIAL_STOCK");
            split.setStatus(0);
            orderSplitService.save(split);
            log.info("[EcOrderProcessOrchestrator] 订单拆分: orderNo={}, 缺货={}",
                    orderNo, allocation.unfulfilledQty());
        }

        return new OrderProcessResult(allocation.fullyAllocated(), totalAllocated,
                allocation.unfulfilledQty(), allocation.fullyAllocated() ? "FULL" : "PARTIAL");
    }

    public record OrderProcessResult(boolean fullyAllocated, int allocatedQty,
                                     int unfulfilledQty, String status) {}
}
