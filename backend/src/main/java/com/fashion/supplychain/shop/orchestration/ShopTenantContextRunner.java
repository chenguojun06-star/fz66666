package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.common.UserContext;
import org.springframework.stereotype.Component;

import java.util.function.Supplier;

/**
 * 以指定租户身份执行（公开 C 端接口的通用手段）。
 *
 * <p>C 端公开接口没有 {@code UserContext}，而租户侧既有编排器（下单、取消订单、发货…）
 * 全都依赖 {@code UserContext.tenantId()} 做归属校验与数据隔离 ——
 * 例如 {@code ShopAdminOrchestrator.requireOrder} 里直接
 * {@code UserContext.tenantId().equals(order.getTenantId())}，上下文为 null 会 NPE。
 *
 * <p>因此公开接口在调用这些编排器前，必须**先按业务数据解析出真实租户**，
 * 再临时构造上下文执行，结束后恢复原上下文（可能是 null）。
 *
 * <p>安全性：租户 id 一律来自**已校验归属的业务数据**（如按 orderNo + consumerId
 * 查到的订单），绝不来自请求参数。
 */
@Component
public class ShopTenantContextRunner {

    /**
     * 以 tenantId 身份执行并返回结果。
     *
     * @param operator 操作人展示名（写进操作日志，如「买家1234」）
     */
    public <T> T run(Long tenantId, String operator, Supplier<T> action) {
        UserContext previous = UserContext.get();
        try {
            UserContext ctx = new UserContext();
            ctx.setTenantId(tenantId);
            ctx.setUserId(operator);
            ctx.setUsername(operator);
            UserContext.set(ctx);
            return action.get();
        } finally {
            if (previous != null) {
                UserContext.set(previous);
            } else {
                UserContext.clear();
            }
        }
    }

    /** 无返回值版本 */
    public void runVoid(Long tenantId, String operator, Runnable action) {
        run(tenantId, operator, () -> {
            action.run();
            return null;
        });
    }
}
