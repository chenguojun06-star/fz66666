package com.fashion.supplychain.shop.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.shop.orchestration.ShopPlatformOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台级商城运营总览（P0，**只读**）。
 *
 * <p><b>权限边界（重要）：</b>只对**平台超级管理员**开放。
 * 此前有过「平台通知误开放给租户」的教训 —— 平台级视图必须显式判超管，
 * 不能用 {@code hasRole('ADMIN')} 这类会把租户管理员也算进来的判据。
 * 这里直接用 {@code UserContext.isSuperAdmin()}（等价于 JWT 的 superAdmin 标志）。
 *
 * <p>本接口只返回聚合计数与跨租户订单列表，**不做任何写操作**；
 * 真正的平台运营后台（租户/商品审核、佣金、分账）留待 P2。
 */
@Slf4j
@RestController
@RequestMapping("/api/shop/admin/platform")
public class ShopPlatformAdminController {

    private final ShopPlatformOrchestrator platformOrchestrator;

    public ShopPlatformAdminController(ShopPlatformOrchestrator platformOrchestrator) {
        this.platformOrchestrator = platformOrchestrator;
    }

    /** 平台总览：店铺 / 在架款式 / 注册用户 / 订单 计数 + 店铺列表 + 最近订单 */
    @GetMapping("/overview")
    public Result<?> overview() {
        if (!UserContext.isSuperAdmin()) {
            return Result.forbidden("仅平台管理员可查看平台总览");
        }
        return Result.success(platformOrchestrator.overview());
    }
}
