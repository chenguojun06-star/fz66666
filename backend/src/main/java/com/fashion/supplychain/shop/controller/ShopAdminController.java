package com.fashion.supplychain.shop.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.shop.orchestration.ShopAdminOrchestrator;
import com.fashion.supplychain.shop.orchestration.ShopDashboardOrchestrator;
import com.fashion.supplychain.shop.orchestration.ShopListingContentOrchestrator;
import com.fashion.supplychain.shop.orchestration.ShopStyleLayoutService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
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

    private final ShopStyleLayoutService shopStyleLayoutService;

    private final ShopListingContentOrchestrator shopListingContentOrchestrator;

    private final ShopDashboardOrchestrator shopDashboardOrchestrator;

    public ShopAdminController(ShopAdminOrchestrator shopAdminOrchestrator,
                                ShopStyleLayoutService shopStyleLayoutService,
                                ShopListingContentOrchestrator shopListingContentOrchestrator,
                                ShopDashboardOrchestrator shopDashboardOrchestrator) {
        this.shopAdminOrchestrator = shopAdminOrchestrator;
        this.shopStyleLayoutService = shopStyleLayoutService;
        this.shopListingContentOrchestrator = shopListingContentOrchestrator;
        this.shopDashboardOrchestrator = shopDashboardOrchestrator;
    }

    /**
     * 店铺数据看板（日报）：浏览 → 加购 → 下单 → 下单金额。
     *
     * @param days 回看天数（默认 30，后端夹取到 1~90）
     */
    @GetMapping("/dashboard/daily")
    public Result<?> dashboardDaily(@RequestParam(defaultValue = "30") int days) {
        return Result.success(shopDashboardOrchestrator.daily(days));
    }

    /** 我的店铺配置（无则建，slug 默认 t{tenantId}，默认打烊） */
    @GetMapping("/config")
    public Result<?> config() {
        return Result.success(shopAdminOrchestrator.config());
    }

    /** 更新店铺配置（名称/公告/打烊开关/配送设置） */
    @PostMapping("/config")
    public Result<?> updateConfig(@RequestBody Map<String, Object> body) {
        try {
            shopAdminOrchestrator.saveConfig(body);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            // D-513：配送设置校验失败（如"开启收运费但运费为0"）走 400，给出可读原因
            return Result.fail(400, e.getMessage());
        }
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

    /**
     * D-513：店铺订单发货（待发货 → 已发货）。
     * body: {expressCompany?, expressNo?}（自提/同城配送可不填）。
     */
    @PostMapping("/orders/{id}/ship")
    public Result<?> shipOrder(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
        String expressCompany = body == null || body.get("expressCompany") == null
                ? null : String.valueOf(body.get("expressCompany"));
        String expressNo = body == null || body.get("expressNo") == null
                ? null : String.valueOf(body.get("expressNo"));
        try {
            shopAdminOrchestrator.shipOrder(id, expressCompany, expressNo);
            return Result.successMessage("已发货");
        } catch (IllegalArgumentException e) {
            // 业务校验失败用 400（与 GlobalExceptionHandler 对 BusinessException 的口径一致），
            // 避免混进 500 干扰监控
            return Result.fail(400, e.getMessage());
        }
    }

    /** D-513：订单详情（订单头 + 商品明细） */
    @PostMapping("/orders/{id}/detail")
    public Result<?> orderDetail(@PathVariable String id) {
        try {
            return Result.success(shopAdminOrchestrator.orderDetail(id));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /**
     * D-513：取消订单（仅待发货）。
     * body: {reason?}；取消会回补库存并撤销挂账应收。
     */
    @PostMapping("/orders/{id}/cancel")
    public Result<?> cancelOrder(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
        String reason = body == null || body.get("reason") == null ? null : String.valueOf(body.get("reason"));
        try {
            shopAdminOrchestrator.cancelOrder(id, reason);
            return Result.successMessage("订单已取消，库存已退回、应收已撤销");
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** D-513：商家备注（买家不可见） */
    @PostMapping("/orders/{id}/remark")
    public Result<?> updateOrderRemark(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
        String remark = body == null || body.get("remark") == null ? null : String.valueOf(body.get("remark"));
        try {
            shopAdminOrchestrator.updateOrderRemark(id, remark);
            return Result.successMessage("备注已保存");
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** D-513：批量发货。body: {orderIds:[], expressCompany?, expressNo?} */
    @PostMapping("/orders/batch-ship")
    public Result<?> batchShip(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Object> raw = (List<Object>) body.get("orderIds");
        List<String> ids = raw == null ? List.of() : raw.stream()
                .filter(java.util.Objects::nonNull)
                .map(v -> String.valueOf(v).trim())
                .filter(s -> !s.isEmpty())
                .collect(java.util.stream.Collectors.toList());
        String expressCompany = body.get("expressCompany") == null ? null : String.valueOf(body.get("expressCompany"));
        String expressNo = body.get("expressNo") == null ? null : String.valueOf(body.get("expressNo"));
        try {
            return Result.success(shopAdminOrchestrator.batchShip(ids, expressCompany, expressNo));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** D-513：订单概览统计（待发货 / 今日订单 / 今日销售额 / 累计） */
    @GetMapping("/orders/stats")
    public Result<?> orderStats() {
        return Result.success(shopAdminOrchestrator.orderStats());
    }

    /**
     * D-513：登记售后（仅已发货订单）。
     * body: {type: REFUND_ONLY|RETURN_REFUND, reason?}
     */
    @PostMapping("/orders/{id}/after-sale/apply")
    public Result<?> applyAfterSale(@PathVariable String id, @RequestBody Map<String, Object> body) {
        String type = body.get("type") == null ? null : String.valueOf(body.get("type"));
        String reason = body.get("reason") == null ? null : String.valueOf(body.get("reason"));
        try {
            shopAdminOrchestrator.applyAfterSale(id, type, reason);
            return Result.successMessage("售后已登记");
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /**
     * D-513：同意售后（退货退款会回补库存；未收款应收自动撤销）。
     * body: {remark?}
     */
    @PostMapping("/orders/{id}/after-sale/approve")
    public Result<?> approveAfterSale(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
        String remark = body == null || body.get("remark") == null ? null : String.valueOf(body.get("remark"));
        try {
            return Result.success(shopAdminOrchestrator.approveAfterSale(id, remark));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** D-513：拒绝售后。body: {remark?} */
    @PostMapping("/orders/{id}/after-sale/reject")
    public Result<?> rejectAfterSale(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
        String remark = body == null || body.get("remark") == null ? null : String.valueOf(body.get("remark"));
        try {
            shopAdminOrchestrator.rejectAfterSale(id, remark);
            return Result.successMessage("已拒绝售后");
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /**
     * 店铺商品运营：批量保存 SKU 售价 + 库存（D-768）。
     * body: {styleId, items:[{skuId, salesPrice, stockQuantity}]}；字段缺省表示不改。
     * 库存为「设为目标值」，服务端换算增减量并留操作日志（不走出入库台账）。
     */
    @PostMapping("/sku/batch-save")
    public Result<?> batchSaveSku(@RequestBody Map<String, Object> body) {
        Long styleId;
        try {
            styleId = body.get("styleId") == null ? null
                    : Long.valueOf(String.valueOf(body.get("styleId")).trim());
        } catch (NumberFormatException e) {
            return Result.fail("styleId 格式不正确");
        }
        try {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
            return Result.success(shopAdminOrchestrator.batchSaveSku(styleId, items));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** D-770：读取某款式的详情页模块布局（无记录返回默认） */
    @GetMapping("/layout/{styleId}")
    public Result<?> getLayout(@PathVariable Long styleId) {
        try {
            return Result.success(shopStyleLayoutService.layoutOf(styleId));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** D-770：保存详情页模块布局（模块开关 + 上到下顺序） */
    @PostMapping("/layout/{styleId}")
    public Result<?> saveLayout(@PathVariable Long styleId,
                                @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Object> raw = (List<Object>) body.get("modules");
        List<Map<String, Object>> modules = new ArrayList<>();
        if (raw != null) {
            for (Object o : raw) {
                if (o instanceof Map<?, ?> m) {
                    modules.add((Map<String, Object>) m);
                }
            }
        }
        try {
            int n = shopStyleLayoutService.saveLayout(styleId, modules);
            return Result.success(Map.of("saved", n));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** D-782：读取某款式的详情内容（轮播图/视频/品牌/尺码表/卖点/FAQ/价格说明） */
    @GetMapping("/content/{styleId}")
    public Result<?> getContent(@PathVariable Long styleId) {
        return Result.success(shopListingContentOrchestrator
                .loadForEdit(com.fashion.supplychain.common.UserContext.tenantId(), styleId));
    }

    /** D-782：保存详情内容（整份覆盖写） */
    @PostMapping("/content/{styleId}")
    public Result<?> saveContent(@PathVariable Long styleId,
                                 @RequestBody Map<String, Object> body) {
        boolean ok = shopListingContentOrchestrator.save(
                com.fashion.supplychain.common.UserContext.tenantId(), styleId, body);
        return Result.success(Map.of("saved", ok));
    }

    /** D-770：可选模块定义与哪些不可隐藏（管理端渲染用） */
    @GetMapping("/layout-modules")
    public Result<?> layoutModules() {
        List<Map<String, Object>> defs = new ArrayList<>();
        for (String key : ShopStyleLayoutService.knownModules()) {
            defs.add(Map.of(
                    "moduleKey", key,
                    "defaultTitle", ShopStyleLayoutService.defaultTitle(key),
                    "canHide", ShopStyleLayoutService.canHide(key)));
        }
        return Result.success(defs);
    }

    /**
     * D-769：跨款式批量调价（试算 / 执行两阶段）。
     *
     * <p>body: {styleIds:[1,2], mode:"SET"|"PERCENT_ADJUST", value:Number, dryRun:Boolean}
     * <p>前端必须先 {@code dryRun=true} 拿试算结果给运营确认，再 {@code dryRun=false} 执行。
     */
    @PostMapping("/sku/batch-adjust-price")
    public Result<?> batchAdjustPrice(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Object> raw = (List<Object>) body.get("styleIds");
        List<Long> styleIds = new ArrayList<>();
        if (raw != null) {
            for (Object v : raw) {
                if (v == null) continue;
                try {
                    styleIds.add(Long.valueOf(String.valueOf(v).trim()));
                } catch (NumberFormatException ignored) {
                    // 非法 ID 直接跳过，不因单个脏值让整批失败
                }
            }
        }
        String mode = body.get("mode") == null ? null : String.valueOf(body.get("mode"));
        java.math.BigDecimal value = null;
        Object rawValue = body.get("value");
        if (rawValue != null && !String.valueOf(rawValue).isBlank()) {
            try {
                value = new java.math.BigDecimal(String.valueOf(rawValue).trim());
            } catch (NumberFormatException e) {
                return Result.fail(400, "调价数值格式不正确：" + rawValue);
            }
        }
        boolean dryRun = !Boolean.FALSE.equals(body.get("dryRun"));
        try {
            return Result.success(shopAdminOrchestrator.batchAdjustPrice(styleIds, mode, value, dryRun));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /**
     * 款式维度 SKU 聚合（店铺商品列表展示 售价区间/可售总量/颜色数）。
     * body: {styleIds:[1,2,3]}
     */
    @PostMapping("/sku/summary")
    public Result<?> skuSummary(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Object> raw = (List<Object>) body.get("styleIds");
        List<Long> styleIds = raw == null ? List.of() : raw.stream()
                .filter(java.util.Objects::nonNull)
                .map(v -> {
                    try {
                        return Long.valueOf(String.valueOf(v).trim());
                    } catch (NumberFormatException e) {
                        return null;
                    }
                })
                .filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.toList());
        return Result.success(shopAdminOrchestrator.skuSummary(styleIds));
    }

    /* ── P2：商品评价（商家侧查看） ── */

    /** 本店铺商品评价分页（可按款号 / 星级过滤） */
    @GetMapping("/reviews")
    public Result<?> reviews(@RequestParam(defaultValue = "1") int page,
                             @RequestParam(defaultValue = "20") int pageSize,
                             @RequestParam(required = false) String styleNo,
                             @RequestParam(required = false) Integer rating) {
        try {
            return Result.success(shopAdminOrchestrator.reviews(page, pageSize, styleNo, rating));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** 本店铺评价概览（均分 / 总数 / 各星级分布） */
    @GetMapping("/reviews/summary")
    public Result<?> reviewSummary() {
        try {
            return Result.success(shopAdminOrchestrator.reviewSummary());
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }
}
