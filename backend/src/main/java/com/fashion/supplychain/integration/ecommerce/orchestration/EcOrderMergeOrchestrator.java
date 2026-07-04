package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 电商订单合单编排器（Phase 2 订单深加工）
 *
 * 对标聚水潭合单功能：同收货人+同平台的多笔待发货订单合并成一个包裹发货，节省运费。
 *
 * 设计原则（不破坏数据链路）：
 *   - 不新增合单表，复用订单的 receiverName+receiverPhone+receiverAddress 做分组
 *   - 合单 = 批量发货，给多个订单设置同一个快递单号
 *   - 每个订单仍独立扣减库存、独立记录收入流水
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class EcOrderMergeOrchestrator {

    @Autowired
    private EcommerceOrderService ecOrderService;

    @Autowired
    private EcommerceOrderOrchestrator ecommerceOrderOrchestrator;

    /**
     * 扫描可合单的订单组（同收货人+同平台+待发货）
     * 返回：每组包含 ≥2 笔订单
     */
    public List<MergeGroup> scanMergeCandidates(Long tenantId) {
        TenantAssert.requireTenantId();

        // 查询待发货订单（status=1 待发货，warehouseStatus<2 未出库）
        List<EcommerceOrder> pending = ecOrderService.list(new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getTenantId, tenantId)
                .eq(EcommerceOrder::getStatus, 1)
                .lt(EcommerceOrder::getWarehouseStatus, 2));

        // 按收货人+平台分组（同收货人+同平台才能合单）
        Map<String, List<EcommerceOrder>> grouped = pending.stream()
                .filter(o -> StringUtils.hasText(o.getReceiverName())
                        && StringUtils.hasText(o.getReceiverPhone())
                        && StringUtils.hasText(o.getSourcePlatformCode()))
                .collect(Collectors.groupingBy(this::mergeKey));

        // 只返回 ≥2 笔的组（有合单价值）
        return grouped.values().stream()
                .filter(list -> list.size() >= 2)
                .map(this::toMergeGroup)
                .sorted(Comparator.comparingInt(MergeGroup::totalQuantity).reversed())
                .collect(Collectors.toList());
    }

    /**
     * 批量合单发货：给多笔订单设置同一快递单号
     * 每个订单独立扣减库存、独立记录流水，只是共享快递单号
     * 不加 @Transactional：部分订单失败不影响其他订单（directOutbound 自带事务）
     */
    public MergeResult batchOutbound(Long tenantId, List<Long> orderIds,
                                     String trackingNo, String expressCompany) {
        TenantAssert.requireTenantId();
        if (orderIds == null || orderIds.isEmpty()) {
            throw new IllegalArgumentException("订单ID列表不能为空");
        }
        if (!StringUtils.hasText(trackingNo) || !StringUtils.hasText(expressCompany)) {
            throw new IllegalArgumentException("快递单号和快递公司不能为空");
        }

        List<EcommerceOrder> orders = ecOrderService.list(new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getTenantId, tenantId)
                .in(EcommerceOrder::getId, orderIds));
        if (orders.size() != orderIds.size()) {
            throw new IllegalStateException("部分订单不存在或无权操作");
        }

        // 校验：必须同收货人+同平台
        Set<String> receivers = orders.stream().map(this::mergeKey).collect(Collectors.toSet());
        if (receivers.size() > 1) {
            throw new IllegalStateException("合单订单必须同收货人+同平台");
        }

        int success = 0;
        List<Long> failedIds = new ArrayList<>();
        for (EcommerceOrder order : orders) {
            try {
                // 复用 directOutbound：扣减库存+记收入流水+回传平台+设置快递单号
                // 合单 = 同一快递单号的多笔订单分别发货
                ecommerceOrderOrchestrator.directOutbound(order.getId(), trackingNo, expressCompany);
                success++;
                log.info("[EcOrderMerge] 合单发货: orderNo={}, trackingNo={}", order.getOrderNo(), trackingNo);
            } catch (Exception e) {
                failedIds.add(order.getId());
                log.error("[EcOrderMerge] 合单发货失败: orderNo={}, err={}", order.getOrderNo(), e.getMessage());
            }
        }

        log.info("[EcOrderMerge] 合单完成: trackingNo={}, 成功={}, 失败={}", trackingNo, success, failedIds.size());
        return new MergeResult(success, failedIds, trackingNo, orders.size());
    }

    /** 合单分组键：收货人+电话+平台 */
    private String mergeKey(EcommerceOrder o) {
        return (o.getReceiverName() == null ? "" : o.getReceiverName()) + "|"
                + (o.getReceiverPhone() == null ? "" : o.getReceiverPhone()) + "|"
                + (o.getSourcePlatformCode() == null ? "" : o.getSourcePlatformCode());
    }

    private MergeGroup toMergeGroup(List<EcommerceOrder> orders) {
        EcommerceOrder first = orders.get(0);
        int totalQty = orders.stream().mapToInt(o -> o.getQuantity() != null ? o.getQuantity() : 0).sum();
        List<MergeOrderItem> items = orders.stream()
                .map(o -> new MergeOrderItem(o.getId(), o.getOrderNo(), o.getSkuCode(),
                        o.getQuantity(), o.getTotalAmount()))
                .collect(Collectors.toList());
        return new MergeGroup(first.getReceiverName(), first.getReceiverPhone(),
                first.getSourcePlatformCode(), items.size(), totalQty, items);
    }

    /** 合单候选组 */
    public record MergeGroup(String receiverName, String receiverPhone, String platform,
                             int orderCount, int totalQuantity, List<MergeOrderItem> orders) {}

    public record MergeOrderItem(Long orderId, String orderNo, String skuCode,
                                  Integer quantity, java.math.BigDecimal totalAmount) {}

    public record MergeResult(int successCount, List<Long> failedOrderIds,
                               String trackingNo, int totalCount) {
        public boolean allSuccess() { return failedOrderIds.isEmpty(); }
    }
}
