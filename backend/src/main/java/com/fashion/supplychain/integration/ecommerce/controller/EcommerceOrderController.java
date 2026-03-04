package com.fashion.supplychain.integration.ecommerce.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 电商平台订单接口
 *
 * Webhook（平台→我方）:
 *   POST /api/ecommerce/webhook/{platform}   平台推送新销售订单
 *
 * 内部管理:
 *   POST /api/ecommerce/orders/list          查询电商订单列表
 *   POST /api/ecommerce/orders/{id}/link     手动关联生产订单
 */
@Slf4j
@RestController
@RequestMapping("/api/ecommerce")
@PreAuthorize("isAuthenticated()")
public class EcommerceOrderController {

    @Autowired
    private EcommerceOrderOrchestrator orchestrator;

    /**
     * 平台 Webhook：接收销售订单
     * 各平台在开放后台填写此地址: https://your-domain/api/ecommerce/webhook/{platform}
     * platform: TAOBAO / JD / DOUYIN / PINDUODUO / XIAOHONGSHU / WECHAT_SHOP / SHOPIFY / TMALL
     */
    @PostMapping("/webhook/{platform}")
    public Result<Map<String, Object>> receiveWebhook(
            @PathVariable String platform,
            @RequestBody Map<String, Object> body) {
        try {
            Map<String, Object> result = orchestrator.receiveOrder(platform, body);
            return Result.success(result);
        } catch (Exception e) {
            log.error("[EC Webhook 失败] platform={} err={}", platform, e.getMessage());
            return Result.fail("接收失败: " + e.getMessage());
        }
    }

    /**
     * 查询电商订单列表（分页）
     * body: { page, pageSize, platform, status, keyword }
     */
    @PostMapping("/orders/list")
    public Result<IPage<EcommerceOrder>> listOrders(@RequestBody Map<String, Object> params) {
        try {
            return Result.success(orchestrator.listOrders(params));
        } catch (Exception e) {
            log.error("[EC列表失败] {}", e.getMessage());
            return Result.fail("查询失败: " + e.getMessage());
        }
    }

    /**
     * 手动关联生产订单
     * body: { productionOrderNo }
     */
    @PostMapping("/orders/{id}/link")
    public Result<Void> linkProductionOrder(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        try {
            String productionOrderNo = (String) body.get("productionOrderNo");
            orchestrator.linkProductionOrder(id, productionOrderNo);
            return Result.success(null);
        } catch (Exception e) {
            log.error("[EC关联失败] id={} err={}", id, e.getMessage());
            return Result.fail("关联失败: " + e.getMessage());
        }
    }

    /**
     * 现货直接出库（无需生产订单，已有库存直接发货）
     * body: { trackingNo, expressCompany }
     */
    @PostMapping("/orders/{id}/direct-outbound")
    public Result<Void> directOutbound(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        try {
            String trackingNo = (String) body.get("trackingNo");
            String expressCompany = (String) body.get("expressCompany");
            orchestrator.directOutbound(id, trackingNo, expressCompany);
            return Result.success(null);
        } catch (Exception e) {
            log.error("[EC直接出库失败] id={} err={}", id, e.getMessage());
            return Result.fail("出库失败: " + e.getMessage());
        }
    }
}
