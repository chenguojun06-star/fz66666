package com.fashion.supplychain.integration.payment.orchestration;

import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.record.service.IntegrationRecordService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 支付回调编排层
 *
 * <p>负责支付回调中的数据库写操作（订单状态更新），统一管理事务边界。
 * 所有写操作都必须加 @Transactional(rollbackFor = Exception.class) 确保异常时回滚。
 */
@Slf4j
@Service
public class PaymentCallbackOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private IntegrationRecordService recordService;

    /**
     * 处理支付成功：更新生产订单状态为 pending，并追加支付备注
     *
     * @param orderNo         我方系统订单号
     * @param thirdPartyNo    第三方流水号
     * @param paymentType     支付渠道（支付宝/微信等）
     */
    @Transactional(rollbackFor = Exception.class)
    public void handlePaymentSuccess(String orderNo, String thirdPartyNo, PaymentGateway.PaymentType paymentType) {
        if (productionOrderService == null || orderNo == null) {
            return;
        }
        ProductionOrder order = productionOrderService.getByOrderNo(orderNo);
        if (order == null) {
            log.warn("[支付成功] 未找到对应生产订单: orderNo={}", orderNo);
            return;
        }
        String currentStatus = order.getStatus();
        if ("pending".equals(currentStatus) || "not_started".equals(currentStatus)) {
            order.setStatus("pending");
            order.setUpdateTime(LocalDateTime.now());
            String payRemark = "支付成功[" + paymentType.getDisplayName() + "] 流水号:" + thirdPartyNo;
            String existingRemark = order.getRemarks();
            order.setRemarks(existingRemark != null && !existingRemark.isEmpty()
                    ? existingRemark + "\n" + payRemark : payRemark);
            productionOrderService.updateById(order);
            log.info("[支付成功] 订单状态已更新: orderNo={}, status=pending, channel={}",
                    orderNo, paymentType.getDisplayName());
        } else {
            log.warn("[支付成功] 订单不在可支付状态，跳过状态更新: orderNo={}, currentStatus={}",
                    orderNo, currentStatus);
        }
    }

    /**
     * 处理支付关闭/退款：将状态为 pending 的订单标记为 cancelled
     *
     * @param orderNo      我方系统订单号
     * @param paymentType  支付渠道
     */
    @Transactional(rollbackFor = Exception.class)
    public void handlePaymentClosed(String orderNo, PaymentGateway.PaymentType paymentType) {
        if (productionOrderService == null || orderNo == null) {
            return;
        }
        ProductionOrder order = productionOrderService.getByOrderNo(orderNo);
        if (order != null && "pending".equals(order.getStatus())) {
            order.setStatus("cancelled");
            order.setUpdateTime(LocalDateTime.now());
            productionOrderService.updateById(order);
            log.info("[支付关闭] 订单已取消: orderNo={}, channel={}", orderNo, paymentType.getDisplayName());
        }
    }

    /**
     * 更新支付流水状态（独立事务，不与订单状态更新共享事务，防止支付状态因订单更新失败而丢失）
     */
    @Transactional(rollbackFor = Exception.class)
    public void updatePaymentStatus(String thirdPartyNo, String status) {
        if (recordService == null) {
            return;
        }
        recordService.updatePaymentStatus(thirdPartyNo, status, null);
    }
}
