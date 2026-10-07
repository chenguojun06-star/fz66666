package com.fashion.supplychain.shop.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.shop.orchestration.ShopAdminOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 店铺管理接口（D-763）：租户管理员用。数据全在 ShopAdminOrchestrator，控制器薄壳。
 * 管理界面下一批接（商品资料页加「上架店铺」开关 + 财务区加「店铺订单」页签）。
 */
@Slf4j
@RestController
@RequestMapping("/api/shop/admin")
public class ShopAdminController {

    private final ShopAdminOrchestrator shopAdminOrchestrator;

    public ShopAdminController(ShopAdminOrchestrator shopAdminOrchestrator) {
        this.shopAdminOrchestrator = shopAdminOrchestrator;
    }

    /** 我的店铺配置（无则建，slug 默认 t{tenantId}，默认打烊） */
    @GetMapping("/config")
    public Result<?> config() {
        return Result.success(shopAdminOrchestrator.config());
    }

    /** 更新店铺配置（名称/公告/打烊开关） */
    @PostMapping("/config")
    public Result<?> updateConfig(@RequestBody Map<String, Object> body) {
        shopAdminOrchestrator.saveConfig(body);
        return Result.success(null);
    }

    /** 上架/下架款式 */
    @PostMapping("/listing/{styleId}")
    public Result<?> setListing(@PathVariable Long styleId, @RequestParam boolean listed) {
        try {
            shopAdminOrchestrator.setListing(styleId, listed);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** 店铺订单分页（含买家联系方式与挂账状态） */
    @PostMapping("/orders")
    public Result<?> orders(@RequestBody Map<String, Object> params) {
        return Result.success(shopAdminOrchestrator.orders(params));
    }
}
