package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.entity.EcUniversalStock;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.integration.ecommerce.service.EcUniversalStockService;
import com.fashion.supplychain.integration.ecommerce.service.PlatformNotifyService;
import com.fashion.supplychain.system.service.BackendActionFlagService;
import com.fashion.supplychain.system.service.BackendActionFlagService.BackendActionKey;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;

/** 电商自动退款编排器：处理 EcommerceOrder status=5（退款中）的完整生命周期 */
@Slf4j
@Service
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class EcRefundOrchestrator {
    /** 自动审批金额阈值（元）：≤100元且未发货且开关开启时自动通过 */
    private static final BigDecimal AUTO_APPROVE_THRESHOLD = new BigDecimal("100");
    @Autowired
    private EcommerceOrderService ecommerceOrderService;
    @Autowired
    private EcUniversalStockService ecUniversalStockService;
    @Autowired(required = false)
    private PlatformNotifyService platformNotifyService;
    @Autowired
    private BackendActionFlagService backendActionFlagService;
    /** 处理退款请求：将状态置为退款中（5），记录原因后尝试自动审批 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> processRefundRequest(Long tenantId, String orderNo, String reason) {
        TenantAssert.requireTenantId();
        EcommerceOrder order = loadOrder(tenantId, orderNo);
        if (order.getStatus() != null && order.getStatus() == 5) {
            throw new IllegalStateException("订单已处于退款中: " + orderNo);
        }
        String refundReason = StringUtils.hasText(reason) ? reason : "买家申请退款";
        order.setStatus(5);
        order.setSellerRemark("退款原因: " + refundReason);
        ecommerceOrderService.updateById(order);
        log.info("[EC退款] 退款请求已创建 tenantId={} operator={} orderNo={} reason={}",
                tenantId, UserContext.tenantId(), orderNo, refundReason);
        return autoApproveRefund(tenantId, orderNo);
    }

    /** 自动审批退款：需开关开启且未发货且金额≤100元才自动通过，否则需人工审批 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> autoApproveRefund(Long tenantId, String orderNo) {
        TenantAssert.requireTenantId();
        EcommerceOrder order = loadOrder(tenantId, orderNo);
        assertRefundStatus(order, orderNo);
        BigDecimal payAmount = order.getPayAmount() != null ? order.getPayAmount() : BigDecimal.ZERO;
        boolean shipped = (order.getWarehouseStatus() != null && order.getWarehouseStatus() >= 2)
                || StringUtils.hasText(order.getTrackingNo());
        // 开关未开启时不自动审批，全部需人工处理（用户可配置）
        boolean autoApproveEnabled = backendActionFlagService.isEnabled(tenantId, BackendActionKey.AUTO_REFUND_APPROVE);
        if (!autoApproveEnabled) {
            log.info("[EC退款] 自动审批开关未开启，需人工审批 tenantId={} orderNo={}", tenantId, orderNo);
            return Map.of("orderNo", orderNo, "status", 5, "payAmount", payAmount, "shipped", shipped,
                    "message", "自动审批未开启，需人工审批");
        }
        if (!shipped && payAmount.compareTo(AUTO_APPROVE_THRESHOLD) <= 0) {
            log.info("[EC退款] 自动审批通过 tenantId={} orderNo={} amount={}", tenantId, orderNo, payAmount);
            return executeRefund(tenantId, orderNo);
        }
        log.info("[EC退款] 需人工审批 tenantId={} orderNo={} amount={} shipped={}", tenantId, orderNo, payAmount, shipped);
        return Map.of("orderNo", orderNo, "status", 5, "payAmount", payAmount, "shipped", shipped, "message", "需人工审批");
    }
    /** 执行退款：更新订单状态为已取消（4）、恢复可售库存、通知平台 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> executeRefund(Long tenantId, String orderNo) {
        TenantAssert.requireTenantId();
        EcommerceOrder order = loadOrder(tenantId, orderNo);
        assertRefundStatus(order, orderNo);
        order.setStatus(4);
        order.setCompleteTime(LocalDateTime.now());
        ecommerceOrderService.updateById(order);
        // 恢复 EcUniversalStock 可售库存（按 skuCode 找汇总行 warehouse=null）
        String skuCode = order.getSkuCode();
        if (StringUtils.hasText(skuCode)) {
            int qty = order.getQuantity() != null ? order.getQuantity() : 1;
            EcUniversalStock stock = ecUniversalStockService.getOne(new LambdaQueryWrapper<EcUniversalStock>()
                    .eq(EcUniversalStock::getTenantId, tenantId)
                    .eq(EcUniversalStock::getSkuCode, skuCode)
                    .isNull(EcUniversalStock::getWarehouse), false);
            if (stock != null) {
                int cur = stock.getAvailableStock() != null ? stock.getAvailableStock() : 0;
                stock.setAvailableStock(cur + qty);
                ecUniversalStockService.updateById(stock);
                log.info("[EC退款] 库存已恢复 tenantId={} skuCode={} restoreQty={}", tenantId, skuCode, qty);
            }
        }
        // 通知平台退款已执行（语义正确：退款回调而非发货回调，失败不阻断退款主流程）
        if (platformNotifyService != null) {
            try {
                platformNotifyService.notifyRefund(order);
            } catch (Exception e) {
                log.warn("[EC退款] 平台退款通知失败，不阻断退款: orderNo={} {}", orderNo, e.getMessage());
            }
        }
        log.info("[EC退款] 退款执行完成 tenantId={} orderNo={}", tenantId, orderNo);
        return Map.of("orderNo", orderNo, "status", 4, "message", "退款已执行");
    }

    /** 查询待处理退款列表（status=5），按创建时间倒序分页 */
    public IPage<EcommerceOrder> getPendingRefunds(Long tenantId, int page, int pageSize) {
        TenantAssert.requireTenantId();
        LambdaQueryWrapper<EcommerceOrder> wrapper = new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getTenantId, tenantId)
                .eq(EcommerceOrder::getStatus, 5)
                .orderByDesc(EcommerceOrder::getCreateTime);
        return ecommerceOrderService.page(new Page<>(page, pageSize), wrapper);
    }

    /** 拒绝退款：恢复订单至退款前状态（已发货→2/未发货→1）并记录拒绝原因 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> rejectRefund(Long tenantId, String orderNo, String reason) {
        TenantAssert.requireTenantId();
        EcommerceOrder order = loadOrder(tenantId, orderNo);
        assertRefundStatus(order, orderNo);
        Integer restoreStatus = (order.getWarehouseStatus() != null && order.getWarehouseStatus() >= 2) ? 2 : 1;
        order.setStatus(restoreStatus);
        String rejectReason = StringUtils.hasText(reason) ? reason : "不符合退款条件";
        order.setSellerRemark((order.getSellerRemark() == null ? "" : order.getSellerRemark() + " | ")
                + "退款被拒绝: " + rejectReason);
        ecommerceOrderService.updateById(order);
        log.info("[EC退款] 退款被拒绝 tenantId={} orderNo={} restoreStatus={}", tenantId, orderNo, restoreStatus);
        return Map.of("orderNo", orderNo, "status", restoreStatus, "message", "退款已拒绝");
    }

    /** 按租户+订单号加载订单（多租户隔离：tenantId 由上下文校验后传入查询） */
    private EcommerceOrder loadOrder(Long tenantId, String orderNo) {
        if (tenantId == null || !StringUtils.hasText(orderNo)) {
            throw new IllegalArgumentException("租户ID和订单号不能为空");
        }
        EcommerceOrder order = ecommerceOrderService.getOne(new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getTenantId, tenantId)
                .eq(EcommerceOrder::getOrderNo, orderNo), false);
        if (order == null) {
            throw new IllegalArgumentException("电商订单不存在或无权操作: " + orderNo);
        }
        return order;
    }
    /** 断言订单处于退款中状态（5） */
    private void assertRefundStatus(EcommerceOrder order, String orderNo) {
        if (order.getStatus() == null || order.getStatus() != 5) {
            throw new IllegalStateException("订单非退款中状态，无法操作: " + orderNo);
        }
    }
}
