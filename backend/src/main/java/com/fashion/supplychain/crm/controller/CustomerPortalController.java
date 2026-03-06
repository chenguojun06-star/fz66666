package com.fashion.supplychain.crm.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.crm.orchestration.PortalTokenOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 客户追踪门户公开接口
 * 不需要 JWT 认证 —— 通过一次性令牌（token）实现客户无登录访问
 * 注意：此 Controller 使用 /api/public/** 路由，已在 SecurityConfig 中配置 permitAll，无需额外修改
 */
@Slf4j
@RestController
@RequestMapping("/api/public/portal")
public class CustomerPortalController {

    @Autowired
    private PortalTokenOrchestrator portalTokenOrchestrator;

    /**
     * 通过追踪令牌查询订单进度
     * 公开接口，客户通过链接访问，无需登录
     */
    @GetMapping("/order-status")
    public Result<Map<String, Object>> getOrderStatus(@RequestParam String token) {
        try {
            Map<String, Object> data = portalTokenOrchestrator.queryByToken(token);
            return Result.success(data);
        } catch (Exception e) {
            return Result.fail(e.getMessage());
        }
    }
}
