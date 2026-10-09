package com.fashion.supplychain.shop.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.shop.orchestration.ShopPlatformOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

/**
 * 平台级商城（公共商品池）公开接口（P0）。
 *
 * <p>免登录、跨租户只读：平台首页 / 商品池 / 店铺列表 / 类目。
 * 全部在 {@code /api/shop/public/**} 白名单内。
 */
@Slf4j
@RestController
@RequestMapping("/api/shop/public/platform")
public class ShopPlatformController {

    private final ShopPlatformOrchestrator platformOrchestrator;

    public ShopPlatformController(ShopPlatformOrchestrator platformOrchestrator) {
        this.platformOrchestrator = platformOrchestrator;
    }

    /** 平台首页：店铺 + 类目 + 精选商品 + 概览数字 */
    @GetMapping("/home")
    public Result<?> home() {
        return Result.success(platformOrchestrator.home());
    }

    /** 跨店商品池分页（keyword 关键字 / category 类目） */
    @GetMapping("/products")
    public Result<?> products(@RequestParam(defaultValue = "1") int page,
                              @RequestParam(defaultValue = "20") int pageSize,
                              @RequestParam(required = false) String keyword,
                              @RequestParam(required = false) String category) {
        return Result.success(platformOrchestrator.products(page, pageSize, keyword, category));
    }

    /** 平台店铺列表 */
    @GetMapping("/shops")
    public Result<?> shops() {
        return Result.success(platformOrchestrator.shops());
    }

    /** 平台商品池类目 */
    @GetMapping("/categories")
    public Result<?> categories() {
        return Result.success(platformOrchestrator.categories());
    }
}
