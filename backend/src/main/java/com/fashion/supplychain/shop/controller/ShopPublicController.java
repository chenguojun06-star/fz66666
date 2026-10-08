package com.fashion.supplychain.shop.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.shop.entity.ShopOrder;
import com.fashion.supplychain.shop.orchestration.ShopOrderOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * C端店铺公开接口（D-763）：无需登录，slug 定位租户。
 * 白名单见 SecurityConstants.PUBLIC_STATIC_ENDPOINTS（/api/shop/public/**）。
 * 数据与校验全在 ShopOrderOrchestrator，本控制器只做参数解析与 Result 包装。
 */
@Slf4j
@RestController
@RequestMapping("/api/shop/public")
public class ShopPublicController {

    private final ShopOrderOrchestrator shopOrderOrchestrator;

    public ShopPublicController(ShopOrderOrchestrator shopOrderOrchestrator) {
        this.shopOrderOrchestrator = shopOrderOrchestrator;
    }

    /** 店铺门面信息（名称/公告/是否营业） */
    @GetMapping("/{slug}/info")
    public Result<?> info(@PathVariable String slug) {
        try {
            return Result.success(shopOrderOrchestrator.shopInfo(slug));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** 上架商品分页（款式维度：封面/款名/最低价/总可售） */
    @GetMapping("/{slug}/products")
    public Result<?> products(@PathVariable String slug,
                              @RequestParam(defaultValue = "1") int page,
                              @RequestParam(defaultValue = "12") int pageSize,
                              @RequestParam(required = false) String keyword) {
        try {
            return Result.success(shopOrderOrchestrator.listProducts(slug, page, pageSize, keyword));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** 商品详情：款式 + 全部 SKU（颜色/尺码/价格/可售库存） */
    @GetMapping("/{slug}/products/{styleId}")
    public Result<?> detail(@PathVariable String slug, @PathVariable Long styleId) {
        try {
            return Result.success(shopOrderOrchestrator.productDetail(slug, styleId));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** 游客下单：手机号归并客户 → 扣库存出库 → 挂账应收（收款线下/收付款中心核销） */
    @PostMapping("/{slug}/orders")
    public Result<?> placeOrder(@PathVariable String slug, @RequestBody Map<String, Object> body) {
        try {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
            ShopOrder order = shopOrderOrchestrator.placeOrder(
                    slug,
                    str(body.get("customerName")),
                    str(body.get("phone")),
                    str(body.get("address")),
                    str(body.get("remark")),
                    items);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("orderNo", order.getOrderNo());
            // D-513：拆出商品金额与运费，C 端下单成功页才能给出「商品 ¥X + 运费 ¥Y」明细
            data.put("goodsAmount", order.getGoodsAmount());
            data.put("shippingFee", order.getShippingFee());
            data.put("totalAmount", order.getTotalAmount());
            data.put("status", order.getStatus());
            return Result.success(data);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** 买家凭手机号查自己的订单（脱敏：不含成本/内部字段） */
    @GetMapping("/{slug}/orders")
    public Result<?> myOrders(@PathVariable String slug, @RequestParam String phone) {
        try {
            return Result.success(shopOrderOrchestrator.ordersByPhone(slug, phone));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    private String str(Object v) {
        return v == null ? null : String.valueOf(v).trim();
    }
}
