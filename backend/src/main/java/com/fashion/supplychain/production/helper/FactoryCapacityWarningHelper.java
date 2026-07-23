package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 工厂产能预警 Helper（无状态）
 *
 * <p>职责：
 * <ul>
 *   <li>清理 factory_capacity:{tenantId} Redis 缓存（订单变更后立即失效）</li>
 *   <li>异步产能预警：下单后检查工厂负载，超阈值则记录 warning 日志</li>
 * </ul>
 *
 * <p>设计原则：
 * <ul>
 *   <li>不阻断主流程（所有异常 catch 后仅记录日志）</li>
 *   <li>不抛异常（预警失败不影响订单创建）</li>
 *   <li>复用 FactoryCapacityOrchestrator 的缓存 key 约定</li>
 * </ul>
 */
@Component
@Slf4j
public class FactoryCapacityWarningHelper {

    /** 与 FactoryCapacityOrchestrator.CACHE_KEY_PREFIX 对齐 */
    private static final String CACHE_KEY_PREFIX = "factory_capacity:";

    /** 工厂负载预警阈值：在制订单总件数超过此值则 warning */
    private static final int OVERLOAD_QUANTITY_THRESHOLD = 5000;
    /** 工厂负载预警阈值：在制订单数超过此值则 warning */
    private static final int OVERLOAD_ORDER_THRESHOLD = 20;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;

    /**
     * 清理工厂产能雷达缓存（订单变更后调用，使下次查询强制刷新）
     */
    public void evictFactoryCapacityCache(Long tenantId) {
        if (stringRedisTemplate == null || tenantId == null) return;
        try {
            stringRedisTemplate.delete(CACHE_KEY_PREFIX + tenantId);
        } catch (Exception e) {
            log.debug("[工厂产能预警] 清理缓存失败: tenantId={}", tenantId);
        }
    }

    /**
     * 异步产能预警：检查工厂负载，超阈值则记录 warning
     * 不抛异常，不阻断主流程。
     *
     * @param factoryName 工厂名（可为空）
     * @param tenantId 租户ID
     */
    public void warnIfOverloaded(String factoryName, Long tenantId) {
        if (factoryName == null || factoryName.isBlank() || tenantId == null) return;
        try {
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.eq("tenant_id", tenantId)
              .eq("factory_name", factoryName)
              .eq("delete_flag", 0)
              .notIn("status", OrderStatusConstants.TERMINAL_STATUSES);
            List<ProductionOrder> orders = productionOrderService.list(qw);
            if (orders.isEmpty()) return;

            int totalQty = orders.stream()
                    .mapToInt(o -> o.getOrderQuantity() != null ? o.getOrderQuantity() : 0)
                    .sum();
            int orderCount = orders.size();

            if (totalQty > OVERLOAD_QUANTITY_THRESHOLD || orderCount > OVERLOAD_ORDER_THRESHOLD) {
                log.warn("[工厂产能预警] 工厂【{}】负载较高：在制 {} 单 / 共 {} 件（阈值：{}单 或 {}件），"
                        + "新订单可能需要排队，建议关注交期",
                        factoryName, orderCount, totalQty,
                        OVERLOAD_ORDER_THRESHOLD, OVERLOAD_QUANTITY_THRESHOLD);
            }
        } catch (Exception e) {
            log.debug("[工厂产能预警] 检查失败（不影响主流程）: factoryName={}, err={}", factoryName, e.getMessage());
        }
    }
}
