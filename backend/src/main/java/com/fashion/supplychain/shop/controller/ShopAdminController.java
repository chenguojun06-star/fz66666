package com.fashion.supplychain.shop.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.shop.orchestration.ShopAdminOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

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
}
