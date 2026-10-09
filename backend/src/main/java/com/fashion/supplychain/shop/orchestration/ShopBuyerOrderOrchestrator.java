package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.shop.mapper.ShopPlatformMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Map;

/**
 * C 端买家对订单的操作（P2）。
 *
 * <p><b>为什么需要「买家取消订单」：</b>与买家售后同一类断裂 ——
 * 取消订单的实现（回补库存 + 撤销应收 + 状态留痕）早已完整，
 * 但入口只在**商家侧**（{@code ShopAdminController} 的 orders/{id}/cancel）。
 * 顾客下错单、地址填错，在系统里取消不了，只能打电话。
 *
 * <p><b>复用而非重写：</b>取消涉及三个反向动作（库存回补、应收撤销、状态留痕），
 * 一旦另写一份必然与商家侧逻辑漂移。这里按「订单真实租户」构造上下文，
 * 直接调用商家侧既有 {@code ShopAdminOrchestrator.cancelOrder} ——
 * 行为、台账、操作日志与商家自己取消**完全一致**（日志操作人显示为「买家xxxx」）。
 *
 * <p><b>权限边界：</b>订单一律 {@code orderNo + consumerId} 双条件定位。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShopBuyerOrderOrchestrator {

    private final ShopPlatformMapper platformMapper;
    private final ShopAdminOrchestrator shopAdminOrchestrator;
    private final ShopTenantContextRunner tenantContextRunner;

    /** 买家取消订单（仅待发货） */
    public void cancelByConsumer(String consumerId, String orderNo, String reason) {
        if (!StringUtils.hasText(orderNo)) {
            throw new IllegalArgumentException("订单号不能为空");
        }
        Map<String, Object> order = platformMapper.findOrderForConsumer(orderNo, consumerId);
        if (order == null) {
            throw new IllegalArgumentException("订单不存在");
        }
        String status = String.valueOf(order.get("status"));
        if (!"PENDING_SHIP".equals(status)) {
            throw new IllegalArgumentException("SHIPPED".equals(status)
                    ? "订单已发货，不能取消；如不需要请在订单详情里申请售后"
                    : "订单已取消，无需重复操作");
        }

        Long tenantId = order.get("tenantId") == null
                ? null : Long.valueOf(String.valueOf(order.get("tenantId")));
        if (tenantId == null) {
            throw new IllegalArgumentException("订单数据异常，请联系店铺客服");
        }
        String reasonText = StringUtils.hasText(reason) ? reason.trim() : "买家主动取消";
        if (reasonText.length() > 200) {
            throw new IllegalArgumentException("取消原因最多 200 字");
        }

        String operator = "买家" + tail(String.valueOf(order.get("phone")), 4);
        String orderId = String.valueOf(order.get("orderId"));
        // 以该订单所属店铺的身份执行既有取消逻辑（库存回补 + 应收撤销 + 留痕）
        tenantContextRunner.runVoid(tenantId, operator,
                () -> shopAdminOrchestrator.cancelOrder(orderId, reasonText));

        log.info("[ShopBuyerOrder] 买家取消订单 orderNo={} consumer={} 原因={}",
                orderNo, consumerId, reasonText);
    }

    private static String tail(String s, int n) {
        if (s == null || s.length() <= n) {
            return "";
        }
        return s.substring(s.length() - n);
    }
}
