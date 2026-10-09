package com.fashion.supplychain.shop.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.shop.orchestration.ShopCartOrchestrator;
import com.fashion.supplychain.shop.orchestration.ShopCheckoutOrchestrator;
import com.fashion.supplychain.shop.orchestration.ShopConsumerTokenSupport;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 平台级跨店购物车与结算接口（P1）。
 *
 * <p>与 {@link ShopConsumerController} 同属 {@code /api/shop/public/**} 白名单，
 * 身份一律靠独立请求头 {@code X-Shop-Token} 解析（消费者 id 不接受请求参数，
 * 防越权操作他人购物车）。
 *
 * <p>业务全在两个编排器，本控制器只做参数解析与 Result 包装（规则6）。
 */
@Slf4j
@RestController
@RequestMapping("/api/shop/public/me")
public class ShopCartController {

    private final ShopCartOrchestrator cartOrchestrator;
    private final ShopCheckoutOrchestrator checkoutOrchestrator;
    private final ShopConsumerTokenSupport tokenSupport;

    public ShopCartController(ShopCartOrchestrator cartOrchestrator,
                              ShopCheckoutOrchestrator checkoutOrchestrator,
                              ShopConsumerTokenSupport tokenSupport) {
        this.cartOrchestrator = cartOrchestrator;
        this.checkoutOrchestrator = checkoutOrchestrator;
        this.tokenSupport = tokenSupport;
    }

    /** 购物车（按店铺分组 + 失效原因） */
    @GetMapping("/cart")
    public Result<?> cart(HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        try {
            return Result.success(cartOrchestrator.cart(consumerId));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** 加购（同 SKU 累加数量） */
    @PostMapping("/cart")
    public Result<?> addToCart(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        Long skuId;
        try {
            skuId = body.get("skuId") == null ? null
                    : Long.valueOf(String.valueOf(body.get("skuId")).trim());
        } catch (NumberFormatException e) {
            return Result.fail(400, "商品规格参数不正确");
        }
        try {
            cartOrchestrator.add(consumerId, skuId, parseInt(body.get("quantity")));
            return Result.successMessage("已加入购物车");
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** 改数量（<=0 视为删除该行） */
    @PostMapping("/cart/{cartItemId}/quantity")
    public Result<?> updateQuantity(@PathVariable String cartItemId,
                                    @RequestBody Map<String, Object> body,
                                    HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        try {
            cartOrchestrator.updateQuantity(consumerId, cartItemId, parseInt(body.get("quantity")));
            return Result.successMessage("已更新");
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** 删除一行 */
    @PostMapping("/cart/{cartItemId}/delete")
    public Result<?> removeFromCart(@PathVariable String cartItemId, HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        try {
            cartOrchestrator.remove(consumerId, cartItemId);
            return Result.successMessage("已移出购物车");
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** 清空购物车 */
    @PostMapping("/cart/clear")
    public Result<?> clearCart(HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        try {
            cartOrchestrator.clear(consumerId);
            return Result.successMessage("购物车已清空");
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /**
     * 结算：按店铺逐张下单（一张订单只含一个店铺）。
     * body: {customerName, phone, address, remark?, tenantIds?}
     */
    @PostMapping("/checkout")
    public Result<?> checkout(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        try {
            return Result.success(checkoutOrchestrator.checkout(
                    consumerId,
                    str(body.get("customerName")),
                    str(body.get("phone")),
                    str(body.get("address")),
                    str(body.get("remark")),
                    toTenantIds(body.get("tenantIds"))));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    private List<Long> toTenantIds(Object raw) {
        List<Long> ids = new ArrayList<>();
        if (!(raw instanceof List<?> list)) {
            return ids;
        }
        for (Object v : list) {
            if (v == null) {
                continue;
            }
            try {
                ids.add(Long.valueOf(String.valueOf(v).trim()));
            } catch (NumberFormatException ignored) {
                // 单个脏值跳过，不因它让整次结算失败
            }
        }
        return ids;
    }

    private int parseInt(Object v) {
        if (v == null) {
            return 0;
        }
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private String str(Object v) {
        return v == null ? null : String.valueOf(v).trim();
    }
}
