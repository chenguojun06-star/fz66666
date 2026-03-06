package com.fashion.supplychain.crm.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.CustomerPortalToken;
import com.fashion.supplychain.crm.service.PortalTokenService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;

/**
 * 客户追踪门户编排层
 * 生成/验证一次性访问令牌，供客户在无需登录情况下追踪生产进度
 */
@Slf4j
@Service
public class PortalTokenOrchestrator {

    @Autowired
    private PortalTokenService portalTokenService;

    @Autowired
    private ProductionOrderService productionOrderService;

    private static final SecureRandom RANDOM = new SecureRandom();
    /** 令牌默认有效期（天） */
    private static final int DEFAULT_EXPIRE_DAYS = 30;

    // ─── 生成令牌 ────────────────────────────────────────────────────────────

    /**
     * 为指定客户+订单生成追踪链接令牌
     * 接口需登录（内部员工操作），令牌本身供客户使用（无需登录）
     */
    @Transactional(rollbackFor = Exception.class)
    public CustomerPortalToken generateToken(String customerId, String orderId) {
        Long tenantId = UserContext.tenantId();
        UserContext ctx = UserContext.get();

        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            throw new RuntimeException("订单不存在");
        }

        // 使每个订单只保留一个有效令牌（续期逻辑：旧令牌更新过期时间而非新建）
        CustomerPortalToken existing = portalTokenService.getOne(
                new LambdaQueryWrapper<CustomerPortalToken>()
                        .eq(CustomerPortalToken::getCustomerId, customerId)
                        .eq(CustomerPortalToken::getOrderId, orderId)
                        .eq(CustomerPortalToken::getTenantId, tenantId)
                        .last("LIMIT 1"), false);

        if (existing != null) {
            // 续期：刷新过期时间
            existing.setExpireTime(LocalDateTime.now().plusDays(DEFAULT_EXPIRE_DAYS));
            portalTokenService.updateById(existing);
            log.info("[PortalTokenOrchestrator] 续期令牌 orderId={}", orderId);
            return existing;
        }

        byte[] rawBytes = new byte[32];
        RANDOM.nextBytes(rawBytes);
        String token = HexFormat.of().formatHex(rawBytes);

        CustomerPortalToken pt = new CustomerPortalToken();
        pt.setToken(token);
        pt.setCustomerId(customerId);
        pt.setOrderId(orderId);
        pt.setOrderNo(order.getOrderNo());
        pt.setTenantId(tenantId);
        pt.setExpireTime(LocalDateTime.now().plusDays(DEFAULT_EXPIRE_DAYS));
        if (ctx != null) {
            pt.setCreatorId(ctx.getUserId() == null ? null : String.valueOf(ctx.getUserId()));
            pt.setCreatorName(ctx.getUsername());
        }

        portalTokenService.save(pt);
        log.info("[PortalTokenOrchestrator] 新建令牌 token={} orderId={}", token.substring(0, 8) + "...", orderId);
        return pt;
    }

    // ─── 查询（公开，无需登录） ───────────────────────────────────────────────

    /**
     * 通过令牌获取订单概况（客户自助查看接口）
     */
    public Map<String, Object> queryByToken(String token) {
        CustomerPortalToken pt = portalTokenService.getOne(
                new LambdaQueryWrapper<CustomerPortalToken>()
                        .eq(CustomerPortalToken::getToken, token)
                        .last("LIMIT 1"), false);

        if (pt == null) {
            throw new RuntimeException("链接无效或已失效");
        }
        if (pt.getExpireTime() != null && pt.getExpireTime().isBefore(LocalDateTime.now())) {
            throw new RuntimeException("链接已过期，请联系工厂重新获取");
        }

        ProductionOrder order = productionOrderService.getById(pt.getOrderId());
        if (order == null) {
            throw new RuntimeException("订单信息不存在");
        }

        // 只暴露客户可见字段，不泄露内部业务数据
        Map<String, Object> result = new HashMap<>();
        result.put("orderNo", order.getOrderNo());
        result.put("styleName", order.getStyleName());
        result.put("orderQuantity", order.getOrderQuantity());
        result.put("completedQuantity", order.getCompletedQuantity());
        result.put("productionProgress", order.getProductionProgress());
        result.put("status", order.getStatus());
        result.put("expectedDeliveryDate", order.getPlannedEndDate());
        result.put("expireTime", pt.getExpireTime());
        return result;
    }
}
