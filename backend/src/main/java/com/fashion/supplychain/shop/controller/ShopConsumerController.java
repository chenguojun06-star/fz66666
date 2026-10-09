package com.fashion.supplychain.shop.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.shop.orchestration.ShopAfterSaleOrchestrator;
import com.fashion.supplychain.shop.orchestration.ShopBuyerOrderOrchestrator;
import com.fashion.supplychain.shop.orchestration.ShopConsumerOrchestrator;
import com.fashion.supplychain.shop.orchestration.ShopConsumerTokenSupport;
import com.fashion.supplychain.shop.orchestration.ShopReviewOrchestrator;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 平台级 C 端消费者账号接口（P0 / P2）。
 *
 * <p>全部在 {@code /api/shop/public/**} 白名单内（免 Spring Security 鉴权），
 * 身份靠独立请求头 {@code X-Shop-Token}（见 {@link ShopConsumerTokenSupport}），
 * 与员工账号体系完全隔离。
 *
 * <p>业务全部在编排器，本控制器只做参数解析与 Result 包装
 * （规则6：Controller 不直接依赖多个 Service）。
 */
@Slf4j
@RestController
@RequestMapping("/api/shop/public")
public class ShopConsumerController {

    private final ShopConsumerOrchestrator consumerOrchestrator;
    private final ShopBuyerOrderOrchestrator buyerOrderOrchestrator;
    private final ShopAfterSaleOrchestrator afterSaleOrchestrator;
    private final ShopReviewOrchestrator reviewOrchestrator;
    private final ShopConsumerTokenSupport tokenSupport;

    public ShopConsumerController(ShopConsumerOrchestrator consumerOrchestrator,
                                  ShopBuyerOrderOrchestrator buyerOrderOrchestrator,
                                  ShopAfterSaleOrchestrator afterSaleOrchestrator,
                                  ShopReviewOrchestrator reviewOrchestrator,
                                  ShopConsumerTokenSupport tokenSupport) {
        this.consumerOrchestrator = consumerOrchestrator;
        this.buyerOrderOrchestrator = buyerOrderOrchestrator;
        this.afterSaleOrchestrator = afterSaleOrchestrator;
        this.reviewOrchestrator = reviewOrchestrator;
        this.tokenSupport = tokenSupport;
    }

    /* ── 注册 / 登录 ── */

    /** 注册：手机号 + 密码（+ 可选昵称）→ 直接返回登录令牌 */
    @PostMapping("/auth/register")
    public Result<?> register(@RequestBody Map<String, Object> body) {
        try {
            return Result.success(consumerOrchestrator.register(
                    str(body.get("phone")), str(body.get("password")), str(body.get("nickname"))));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** 登录：手机号 + 密码 */
    @PostMapping("/auth/login")
    public Result<?> login(@RequestBody Map<String, Object> body) {
        try {
            return Result.success(consumerOrchestrator.login(
                    str(body.get("phone")), str(body.get("password"))));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /* ── 我的 ── */

    /** 个人资料 */
    @GetMapping("/me")
    public Result<?> me(HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        try {
            return Result.success(consumerOrchestrator.profile(consumerId));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** 修改昵称 / 头像 */
    @PostMapping("/me")
    public Result<?> updateMe(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        try {
            consumerOrchestrator.updateProfile(consumerId, str(body.get("nickname")), str(body.get("avatar")));
            return Result.successMessage("已保存");
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /* ── 收货地址簿（平台级，跨店复用） ── */

    @GetMapping("/me/addresses")
    public Result<?> addresses(HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        try {
            return Result.success(consumerOrchestrator.addresses(consumerId));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    @PostMapping("/me/addresses")
    public Result<?> saveAddress(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        try {
            return Result.success(Map.of("id", consumerOrchestrator.saveAddress(consumerId, body)));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    @PostMapping("/me/addresses/{id}/default")
    public Result<?> setDefaultAddress(@PathVariable String id, HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        try {
            consumerOrchestrator.setDefaultAddress(consumerId, id);
            return Result.successMessage("已设为默认地址");
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    @PostMapping("/me/addresses/{id}/delete")
    public Result<?> deleteAddress(@PathVariable String id, HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        try {
            consumerOrchestrator.deleteAddress(consumerId, id);
            return Result.successMessage("已删除");
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /* ── 我的订单（跨店） ── */

    @GetMapping("/me/orders")
    public Result<?> myOrders(HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        try {
            List<Map<String, Object>> orders = consumerOrchestrator.myOrders(consumerId);
            return Result.success(orders);
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** 订单详情（P1）：订单头 + 商品明细 + 物流/售后状态 */
    @GetMapping("/me/orders/{orderNo}")
    public Result<?> orderDetail(@PathVariable String orderNo, HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        try {
            return Result.success(consumerOrchestrator.orderDetail(consumerId, orderNo));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /**
     * P2：买家取消订单（仅待发货）。会回补库存并撤销挂账应收。
     * body: {reason?}
     */
    @PostMapping("/me/orders/{orderNo}/cancel")
    public Result<?> cancelOrder(@PathVariable String orderNo,
                                 @RequestBody(required = false) Map<String, Object> body,
                                 HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        String reason = body == null ? null : str(body.get("reason"));
        try {
            buyerOrderOrchestrator.cancelByConsumer(consumerId, orderNo, reason);
            return Result.successMessage("订单已取消，库存已退回、应收已撤销");
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /**
     * P2：买家申请售后（仅「已发货」订单）。
     * body: {type: REFUND_ONLY|RETURN_REFUND, reason?}
     */
    @PostMapping("/me/orders/{orderNo}/after-sale")
    public Result<?> applyAfterSale(@PathVariable String orderNo,
                                    @RequestBody(required = false) Map<String, Object> body,
                                    HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        Map<String, Object> b = body == null ? Map.of() : body;
        try {
            afterSaleOrchestrator.applyByConsumer(consumerId, orderNo,
                    str(b.get("type")), str(b.get("reason")));
            return Result.successMessage("售后申请已提交，等待商家处理");
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /**
     * P2：提交商品评价（一单一款一条，提交后不可修改）。
     * body: {styleNo, rating(1~5), content?, anonymous?}
     */
    @PostMapping("/me/orders/{orderNo}/reviews")
    public Result<?> submitReview(@PathVariable String orderNo,
                                  @RequestBody Map<String, Object> body,
                                  HttpServletRequest request) {
        String consumerId = tokenSupport.resolveConsumerId(request);
        if (consumerId == null) {
            return Result.fail(401, "请先登录");
        }
        try {
            reviewOrchestrator.submit(consumerId, orderNo, str(body.get("styleNo")),
                    parseInt(body.get("rating")), str(body.get("content")),
                    Boolean.TRUE.equals(body.get("anonymous"))
                            || "1".equals(String.valueOf(body.get("anonymous"))));
            return Result.successMessage("感谢您的评价");
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
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
