package com.fashion.supplychain.shop.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.shop.orchestration.ShopPlatformGovernanceOrchestrator;
import com.fashion.supplychain.shop.orchestration.ShopPlatformOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

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

    private final ShopPlatformGovernanceOrchestrator governanceOrchestrator;

    public ShopPlatformAdminController(ShopPlatformOrchestrator platformOrchestrator,
                                       ShopPlatformGovernanceOrchestrator governanceOrchestrator) {
        this.platformOrchestrator = platformOrchestrator;
        this.governanceOrchestrator = governanceOrchestrator;
    }

    /** 平台总览：店铺 / 在架款式 / 注册用户 / 订单 计数 + 店铺列表 + 最近订单 */
    @GetMapping("/overview")
    public Result<?> overview() {
        if (!UserContext.isSuperAdmin()) {
            return Result.forbidden("仅平台管理员可查看平台总览");
        }
        return Result.success(platformOrchestrator.overview());
    }

    /**
     * 平台全站商品（跨租户）。含**已下架**，可按在架状态过滤。
     *
     * <p>之所以要能看到已下架的：治理是双向的，下架之后还得能恢复 ——
     * 只列在架商品的话，被下架的商品就「消失」了，平台反而失去了恢复它的入口。
     *
     * @param listedOnly 不传=全部 / true=只看在架 / false=只看已下架
     */
    @GetMapping("/products")
    public Result<?> products(@RequestParam(defaultValue = "1") int page,
                              @RequestParam(defaultValue = "20") int pageSize,
                              @RequestParam(required = false) String keyword,
                              @RequestParam(required = false) Boolean listedOnly) {
        if (!UserContext.isSuperAdmin()) {
            return Result.forbidden("仅平台管理员可查看全站商品");
        }
        return Result.success(
                governanceOrchestrator.adminStyles(page, pageSize, keyword, listedOnly));
    }

    /**
     * 平台一键下架某商品（跨租户）——**发布即上架 + 事后巡检 + 违规下架**，
     * 不做前置审核（前置审核会让商家上架变慢、平台还要背审核人力）。
     *
     * <p>必须填原因：原因会随通知发给商家。不告诉商家为什么被下架，
     * 商家只会反复重新上架，治理变成猫鼠游戏。
     */
    @PostMapping("/listing/takedown")
    public Result<?> takedown(@RequestBody Map<String, Object> body) {
        if (!UserContext.isSuperAdmin()) {
            return Result.forbidden("仅平台管理员可下架商品");
        }
        try {
            return Result.success(governanceOrchestrator.takedown(
                    longOf(body.get("styleId")), strOf(body.get("reason"))));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** 平台恢复上架（下架必须可逆，否则等于平台能一键把别人的生意做没） */
    @PostMapping("/listing/relist")
    public Result<?> relist(@RequestBody Map<String, Object> body) {
        if (!UserContext.isSuperAdmin()) {
            return Result.forbidden("仅平台管理员可恢复上架");
        }
        try {
            return Result.success(governanceOrchestrator.relist(longOf(body.get("styleId"))));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    private Long longOf(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String strOf(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}
