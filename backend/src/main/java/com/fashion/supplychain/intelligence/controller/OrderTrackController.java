package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.dto.OrderTrackResponse;
import com.fashion.supplychain.intelligence.orchestration.OrderTrackPortalOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 客户进度门户 Controller
 * 认证端点：生成/撤销分享 token
 * 公开端点：/api/public/** 已在 SecurityConfig 配置为 permitAll，无需额外注解
 */
@RestController
public class OrderTrackController {

    @Autowired
    private OrderTrackPortalOrchestrator orderTrackPortalOrchestrator;

    /**
     * 生成订单分享链接 token（需登录）
     * 请求体：{ "orderId": "xxx" }
     * 规则：固定 1 小时有效，过期自动失效
     */
    @PostMapping("/api/intelligence/order-track/generate-token")
    @PreAuthorize("isAuthenticated()")
    public Result<String> generateToken(@RequestBody Map<String, Object> req) {
        String orderId = (String) req.get("orderId");
        String token = orderTrackPortalOrchestrator.generateToken(orderId);
        return Result.success(token);
    }

    /**
     * 撤销订单分享 token（需登录）
     */
    @DeleteMapping("/api/intelligence/order-track/revoke/{orderId}")
    @PreAuthorize("isAuthenticated()")
    public Result<String> revokeToken(@PathVariable String orderId) {
        orderTrackPortalOrchestrator.revokeToken(orderId);
        return Result.success("分享链接已撤销");
    }

    /**
     * 通过 token 查询订单进度（公开端点，无需登录）
     * SecurityConfig 中 /api/public/** 已设为 permitAll
     */
    @GetMapping("/api/public/order-track/{token}")
    public Result<OrderTrackResponse> queryByToken(@PathVariable String token) {
        OrderTrackResponse resp = orderTrackPortalOrchestrator.queryByToken(token);
        return Result.success(resp);
    }
}
