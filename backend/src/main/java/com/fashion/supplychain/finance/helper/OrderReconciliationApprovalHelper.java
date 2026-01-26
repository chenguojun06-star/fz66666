package com.fashion.supplychain.finance.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.finance.entity.OrderReconciliationApproval;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.OrderReconciliationApprovalService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 订单结算审批付款辅助类
 * 订单结算审核通过后，自动按工厂汇总创建审批付款记录
 */
@Slf4j
@Component
public class OrderReconciliationApprovalHelper {

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private OrderReconciliationApprovalService orderReconciliationApprovalService;

    /**
     * 订单结算审核通过后，自动生成审批付款记录（按工厂汇总）
     * @param reconciliationId 订单结算ID
     */
    public void createApprovalOnReconciliationApproved(String reconciliationId) {
        if (reconciliationId == null || reconciliationId.trim().isEmpty()) {
            log.warn("订单结算ID为空，跳过创建审批付款记录");
            return;
        }

        // 查询订单结算记录
        ShipmentReconciliation reconciliation = shipmentReconciliationService.getById(reconciliationId);
        if (reconciliation == null) {
            log.warn("订单结算记录不存在: id={}", reconciliationId);
            return;
        }

        String factoryName = reconciliation.getCustomerName(); // 加工厂名称（本厂或加工厂）
        Integer isOwnFactory = reconciliation.getIsOwnFactory(); // 0=加工厂，1=本厂

        if (factoryName == null || factoryName.trim().isEmpty()) {
            log.warn("工厂名称为空，无法创建审批付款记录: reconciliationId={}", reconciliationId);
            return;
        }

        // 查询该工厂所有已批准的订单结算（准备汇总）
        List<ShipmentReconciliation> approvedReconciliations = shipmentReconciliationService.list(
            new LambdaQueryWrapper<ShipmentReconciliation>()
                .eq(ShipmentReconciliation::getCustomerName, factoryName)
                .eq(ShipmentReconciliation::getStatus, "approved")
        );

        if (approvedReconciliations.isEmpty()) {
            log.info("工厂{}暂无已批准的订单结算，跳过创建审批付款: factoryName={}", factoryName, factoryName);
            return;
        }

        // 检查是否已经存在该工厂的审批付款记录（pending状态）
        long existingCount = orderReconciliationApprovalService.count(
            new LambdaQueryWrapper<OrderReconciliationApproval>()
                .eq(OrderReconciliationApproval::getFactoryName, factoryName)
                .eq(OrderReconciliationApproval::getStatus, "pending")
        );

        if (existingCount > 0) {
            log.info("工厂{}已存在待处理的审批付款记录，跳过创建: factoryName={}", factoryName, factoryName);
            return;
        }

        // 汇总数据
        int orderCount = approvedReconciliations.size();
        int totalQuantity = approvedReconciliations.stream()
            .mapToInt(r -> r.getQuantity() != null ? r.getQuantity() : 0)
            .sum();
        BigDecimal totalAmount = approvedReconciliations.stream()
            .map(r -> r.getTotalAmount() != null ? r.getTotalAmount() : BigDecimal.ZERO)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        String reconciliationIds = approvedReconciliations.stream()
            .map(ShipmentReconciliation::getId)
            .collect(Collectors.joining(","));

        // 创建审批付款记录
        OrderReconciliationApproval approval = new OrderReconciliationApproval();
        approval.setFactoryName(factoryName);
        approval.setIsOwnFactory(isOwnFactory != null ? isOwnFactory : 0);
        approval.setOrderCount(orderCount);
        approval.setTotalQuantity(totalQuantity);
        approval.setTotalAmount(totalAmount);
        approval.setReconciliationIds(reconciliationIds);
        approval.setStatus("pending");
        approval.setCreateTime(LocalDateTime.now());
        approval.setUpdateTime(LocalDateTime.now());

        boolean saved = orderReconciliationApprovalService.save(approval);
        if (saved) {
            log.info("订单结算审批付款记录创建成功: factoryName={}, orderCount={}, totalAmount={}",
                factoryName, orderCount, totalAmount);
        } else {
            log.error("订单结算审批付款记录创建失败: factoryName={}", factoryName);
        }
    }
}
