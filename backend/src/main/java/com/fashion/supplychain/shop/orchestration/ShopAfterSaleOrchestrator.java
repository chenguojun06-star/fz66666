package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.shop.entity.ShopOrder;
import com.fashion.supplychain.shop.mapper.ShopOrderMapper;
import com.fashion.supplychain.shop.mapper.ShopPlatformMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * C 端买家售后申请（P2）。
 *
 * <p><b>为什么必须补这一环：</b>此前「售后」只有**商家代顾客登记**的入口
 * （{@code ShopAdminController} 的 after-sale/apply）—— 顾客发现自己收到的货有问题，
 * 在系统里根本无处发起，只能打电话给商家，商家再手动登记。
 * 这不是功能缺失，而是**闭环断裂**：状态机（APPLIED → APPROVED/REJECTED）早就有了，
 * 只是缺了「APPLIED 由谁触发」。
 *
 * <p>本类只做「买家发起」这一半；审批仍走商家侧既有逻辑
 * （{@code ShopAdminOrchestrator.approveAfterSale / rejectAfterSale}），
 * 不重复实现库存回补与应收冲销。
 *
 * <p><b>权限边界：</b>订单一律通过 {@code orderNo + consumerId} 双条件定位
 * （{@code findOrderForConsumer}），买家只能对自己的订单发起售后。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShopAfterSaleOrchestrator {

    private static final String REFUND_ONLY = "REFUND_ONLY";
    private static final String RETURN_REFUND = "RETURN_REFUND";

    private final ShopPlatformMapper platformMapper;
    private final ShopOrderMapper shopOrderMapper;

    /**
     * 买家申请售后（仅「已发货」订单；未发货请走取消订单）。
     *
     * @param type REFUND_ONLY 仅退款 / RETURN_REFUND 退货退款
     */
    @Transactional(rollbackFor = Exception.class)
    public void applyByConsumer(String consumerId, String orderNo, String type, String reason) {
        if (!StringUtils.hasText(orderNo)) {
            throw new IllegalArgumentException("订单号不能为空");
        }
        Map<String, Object> order = platformMapper.findOrderForConsumer(orderNo, consumerId);
        if (order == null) {
            throw new IllegalArgumentException("订单不存在");
        }
        if (!"SHIPPED".equals(String.valueOf(order.get("status")))) {
            String status = String.valueOf(order.get("status"));
            throw new IllegalArgumentException("PENDING_SHIP".equals(status)
                    ? "订单还未发货，如需取消请直接取消订单"
                    : "该订单已取消，无法申请售后");
        }
        if (!REFUND_ONLY.equals(type) && !RETURN_REFUND.equals(type)) {
            throw new IllegalArgumentException("请选择售后类型（仅退款 / 退货退款）");
        }

        String current = order.get("afterSaleStatus") == null
                ? "NONE" : String.valueOf(order.get("afterSaleStatus"));
        if ("APPLIED".equals(current)) {
            throw new IllegalArgumentException("该订单已有待处理的售后申请，请等待商家处理");
        }
        if ("APPROVED".equals(current)) {
            throw new IllegalArgumentException("该订单售后已处理完成，不能重复申请");
        }

        String trimmed = StringUtils.hasText(reason) ? reason.trim() : null;
        if (trimmed != null && trimmed.length() > 200) {
            throw new IllegalArgumentException("售后说明最多 200 字");
        }

        ShopOrder patch = new ShopOrder();
        patch.setId(String.valueOf(order.get("orderId")));
        patch.setAfterSaleStatus("APPLIED");
        patch.setAfterSaleType(type);
        patch.setAfterSaleReason(trimmed);
        patch.setAfterSaleTime(LocalDateTime.now());
        shopOrderMapper.updateById(patch);

        // 不写操作日志：日志按租户隔离，而买家身份没有租户上下文（写进去商家也看不到）。
        // 买家的诉求已经落在订单的 after_sale_reason 上，商家在订单列表即可看到。
        log.info("[ShopAfterSale] 买家申请售后 orderNo={} consumer={} type={}",
                orderNo, consumerId, type);
    }
}
