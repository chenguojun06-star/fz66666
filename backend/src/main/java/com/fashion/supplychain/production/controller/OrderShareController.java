package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.dto.OrderShareResponse;
import com.fashion.supplychain.production.orchestration.OrderShareOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 客户订单分享控制器
 *
 * <p>提供两个端点：
 * <ul>
 *   <li>POST /api/production/orders/{id}/share-token — 生成分享令牌（需要登录）</li>
 *   <li>GET  /api/public/share/order/{token}          — 公开查询订单摘要（无需登录）</li>
 * </ul>
 *
 * <p>安全：公开接口在 SecurityConfig 中已配置 permitAll("/api/public/**")，
 * 响应内容仅包含 OrderShareResponse 中定义的可公开字段。
 */
@Slf4j
@RestController
public class OrderShareController {

    @Autowired
    private OrderShareOrchestrator orderShareOrchestrator;

    /**
     * 为指定订单生成分享令牌（30 天有效）
     * 前端调用后可拼接 /share/{token} 作为客户分享链接
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/api/production/orders/{id}/share-token")
    public Result<Map<String, String>> generateShareToken(@PathVariable("id") String orderId) {
        try {
            String token = orderShareOrchestrator.generateShareToken(orderId);
            return Result.success(Map.of(
                "token", token,
                "shareUrl", "/share/" + token
            ));
        } catch (SecurityException e) {
            return Result.fail("无权限分享此订单");
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 通过分享令牌获取订单公开摘要（无需登录）
     * 此接口在 SecurityConfig 中已配置 .antMatchers("/api/public/**").permitAll()
     */
    @GetMapping("/api/public/share/order/{token}")
    public Result<OrderShareResponse> getSharedOrder(@PathVariable("token") String token) {
        return orderShareOrchestrator.resolveShareOrder(token);
    }
}
