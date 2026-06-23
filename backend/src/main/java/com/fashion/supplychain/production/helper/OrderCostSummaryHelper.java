package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.warehouse.entity.MaterialPickupRecord;
import com.fashion.supplychain.warehouse.mapper.MaterialPickupRecordMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

/**
 * 订单成本汇总Helper
 * 
 * 内部工厂：物料成本汇总到订单（平账）
 * 外部工厂：物料成本作为扣款
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderCostSummaryHelper {

    private final ProductionOrderService productionOrderService;
    private final MaterialPickupRecordMapper materialPickupRecordMapper;

    /**
     * 汇总订单成本
     * 内部工厂：物料成本汇总到订单的 material_cost 字段
     * 外部工厂：物料成本作为扣款（已在 ExternalFactoryMaterialDeductionHelper 处理）
     */
    @Transactional(rollbackFor = Exception.class)
    public void summaryOrderMaterialCost(String orderNo) {
        Long tenantId = UserContext.tenantId();
        
        // 1. 查询订单
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getOrderNo, orderNo)
                .eq(ProductionOrder::getTenantId, tenantId)
                .one();
        
        if (order == null) {
            log.warn("[OrderCostSummary] 订单不存在: {}", orderNo);
            return;
        }

        // 2. 只处理内部工厂订单
        if (!"INTERNAL".equals(order.getFactoryType())) {
            log.info("[OrderCostSummary] 外部工厂订单不汇总物料成本: {} (factoryType={})", orderNo, order.getFactoryType());
            return;
        }

        // 3. 查询该订单所有未汇总的物料领取记录（内部工厂）
        List<MaterialPickupRecord> records = materialPickupRecordMapper.selectUnsettledByOrderNo(orderNo, tenantId, "INTERNAL");
        
        if (records.isEmpty()) {
            log.info("[OrderCostSummary] 订单无待汇总物料成本: {}", orderNo);
            return;
        }

        // 4. 计算总成本
        BigDecimal totalMaterialCost = records.stream()
                .map(r -> r.getAmount() != null ? r.getAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 5. 更新订单成本
        BigDecimal currentMaterialCost = order.getMaterialCost() != null ? order.getMaterialCost() : BigDecimal.ZERO;
        BigDecimal newMaterialCost = currentMaterialCost.add(totalMaterialCost);
        
        // 计算总成本 = 加工费 + 面辅料成本
        BigDecimal factoryUnitPrice = order.getFactoryUnitPrice() != null ? order.getFactoryUnitPrice() : BigDecimal.ZERO;
        Integer orderQuantity = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
        BigDecimal processingCost = factoryUnitPrice.multiply(BigDecimal.valueOf(orderQuantity));
        BigDecimal totalCost = processingCost.add(newMaterialCost);

        productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, order.getId())
                .eq(ProductionOrder::getTenantId, tenantId)
                .set(ProductionOrder::getMaterialCost, newMaterialCost)
                .set(ProductionOrder::getTotalCost, totalCost)
                .update();

        // 6. 标记物料记录已汇总
        for (MaterialPickupRecord record : records) {
            materialPickupRecordMapper.markCostSettled(record.getId(), tenantId);
        }

        log.info("[OrderCostSummary] 订单成本汇总完成: {} -> materialCost={}, totalCost={}", 
                orderNo, newMaterialCost, totalCost);
    }

    /**
     * 汇总所有内部工厂订单的成本（批量）
     */
    @Transactional(rollbackFor = Exception.class)
    public int summaryAllInternalOrders() {
        Long tenantId = UserContext.tenantId();
        
        // 查询所有有未汇总物料成本的内部订单
        List<String> orderNos = materialPickupRecordMapper.selectUnsettledOrderNos(tenantId, "INTERNAL");
        
        int count = 0;
        for (String orderNo : orderNos) {
            try {
                summaryOrderMaterialCost(orderNo);
                count++;
            } catch (Exception e) {
                log.error("[OrderCostSummary] 汇总失败: {}", orderNo, e);
            }
        }
        
        log.info("[OrderCostSummary] 批量汇总完成: 共处理 {} 个订单", count);
        return count;
    }
}