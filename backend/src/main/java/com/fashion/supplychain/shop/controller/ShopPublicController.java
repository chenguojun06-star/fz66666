package com.fashion.supplychain.shop.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.shop.entity.ShopConfig;
import com.fashion.supplychain.shop.entity.ShopOrder;
import com.fashion.supplychain.shop.orchestration.ShopConsumerTokenSupport;
import com.fashion.supplychain.shop.orchestration.ShopOrderOrchestrator;
import com.fashion.supplychain.shop.orchestration.ShopRecommendOrchestrator;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;
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

    private final ShopConsumerTokenSupport consumerTokenSupport;

    /** 显式上报浏览用（见下方 recordView 的说明：与详情接口内置记录是同一份数据源） */
    private final ShopRecommendOrchestrator shopRecommendOrchestrator;

    public ShopPublicController(ShopOrderOrchestrator shopOrderOrchestrator,
                                ShopConsumerTokenSupport consumerTokenSupport,
                                ShopRecommendOrchestrator shopRecommendOrchestrator) {
        this.shopOrderOrchestrator = shopOrderOrchestrator;
        this.consumerTokenSupport = consumerTokenSupport;
        this.shopRecommendOrchestrator = shopRecommendOrchestrator;
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

    /**
     * 商品详情：款式 + 全部 SKU（颜色/尺码/价格/可售库存）。
     *
     * <p>D-784：带 {@code X-Shop-Token} 访问时顺带记一份个人浏览历史（用于推荐）；
     * 未登录也记一次按天浏览计数（数据看板用）。记录失败不影响详情返回。
     */
    @GetMapping("/{slug}/products/{styleId}")
    public Result<?> detail(@PathVariable String slug, @PathVariable Long styleId,
                            HttpServletRequest request) {
        try {
            String consumerId = consumerTokenSupport.resolveConsumerId(request);
            return Result.success(shopOrderOrchestrator.productDetail(slug, styleId, consumerId));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 商品详情页底部「猜你喜欢」（D-784）。
     *
     * <p>免登录可用：登录顾客按「个人浏览偏好 + 同品类 + 热度」混合推荐，
     * 匿名访客走「同品类 + 热度」——不假装有个性化。只推本店商品。
     */
    @GetMapping("/{slug}/products/{styleId}/recommendations")
    public Result<?> recommendations(@PathVariable String slug, @PathVariable Long styleId,
                                     @RequestParam(defaultValue = "8") int limit,
                                     HttpServletRequest request) {
        try {
            String consumerId = consumerTokenSupport.resolveConsumerId(request);
            return Result.success(
                    shopOrderOrchestrator.recommendations(slug, styleId, consumerId, limit));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 上报一次商品浏览（D-784，推荐的数据来源）。
     *
     * <p>⚠️ <b>与详情接口内置的记录是同一份数据源，前端只能选一条路径</b>：
     * 服务端已经在 {@code GET /{slug}/products/{styleId}} 里记过一次浏览
     * （更可靠：只有真正渲染成功的详情才算，且不依赖前端配合）。
     * 如果前端在打开详情后**又**调本接口，同一次浏览会被记两次，热度与看板都会虚高。
     * 保留本接口是给"详情页之外也需要上报浏览"的场景（如列表页预加载）。
     *
     * <p><b>免登录静默成功</b>：匿名访客没有稳定身份，不入库、不报错，
     * 只走「同品类 + 热度」推荐。<b>不假装给匿名用户做了个性化</b>。
     *
     * <p>浏览记录记不下来绝不能影响顾客浏览 —— 记录失败只吞掉，不抛。
     */
    @PostMapping("/{slug}/products/{styleId}/view")
    public Result<?> recordView(@PathVariable String slug, @PathVariable Long styleId,
                                @RequestBody(required = false) Map<String, Object> body,
                                HttpServletRequest request) {
        try {
            ShopConfig config = shopOrderOrchestrator.resolveBySlug(slug);
            if (config == null) {
                return Result.fail("店铺不存在");
            }
            String consumerId = consumerTokenSupport.resolveConsumerId(request);
            String styleNo = body == null || body.get("styleNo") == null
                    ? null : String.valueOf(body.get("styleNo"));
            shopRecommendOrchestrator.recordView(config.getTenantId(), consumerId, styleId, styleNo);
            // 统一返回成功：没登录也返回成功，避免前端弹「请先登录」
            return Result.success(Map.of("recorded", StringUtils.hasText(consumerId)));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            // 记录失败不影响浏览
            return Result.success(Map.of("recorded", false));
        }
    }

    /** 游客下单：手机号归并客户 → 扣库存出库 → 挂账应收（收款线下/收付款中心核销） */
    @PostMapping("/{slug}/orders")
    public Result<?> placeOrder(@PathVariable String slug, @RequestBody Map<String, Object> body,
                                HttpServletRequest request) {
        try {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
            // P0：已登录的平台消费者下单时绑定账号（未登录则 null，行为与原来一致）
            String consumerId = consumerTokenSupport.resolveConsumerId(request);
            ShopOrder order = shopOrderOrchestrator.placeOrder(
                    slug,
                    str(body.get("customerName")),
                    str(body.get("phone")),
                    str(body.get("address")),
                    str(body.get("remark")),
                    items,
                    consumerId);
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

    /* ── D-770：C 端收货地址簿 ── */

    /** 读取地址簿（按手机号归属；免登录页面，故严格校验手机号格式与地址条数上限） */
    @GetMapping("/{slug}/addresses")
    public Result<?> addresses(@PathVariable String slug,
                               @RequestParam("phone") String phone) {
        try {
            return Result.success(shopOrderOrchestrator.addresses(slug, phone));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** 新增或更新地址（同收货人+详细地址视为同一条） */
    @PostMapping("/{slug}/addresses")
    public Result<?> saveAddress(@PathVariable String slug, @RequestBody Map<String, Object> body) {
        try {
            return Result.success(Map.of("id", shopOrderOrchestrator.saveAddress(slug, body)));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** 设为默认地址 */
    @PostMapping("/{slug}/addresses/{id}/default")
    public Result<?> setDefaultAddress(@PathVariable String slug,
                                       @RequestParam("phone") String phone,
                                       @PathVariable Long id) {
        try {
            shopOrderOrchestrator.setDefaultAddress(slug, phone, id);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** 删除地址（只能删自己的） */
    @PostMapping("/{slug}/addresses/{id}/delete")
    public Result<?> deleteAddress(@PathVariable String slug,
                                   @RequestParam("phone") String phone,
                                   @PathVariable Long id) {
        try {
            shopOrderOrchestrator.deleteAddress(slug, phone, id);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

}
