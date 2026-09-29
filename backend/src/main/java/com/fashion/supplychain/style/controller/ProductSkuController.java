package com.fashion.supplychain.style.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.style.dto.SkuBatchUpdateDTO;
import com.fashion.supplychain.style.dto.StockUpdateDTO;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.orchestration.ProductSkuOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 款式 SKU Controller。
 *
 * <p>D-637：原先本类直接注入了 ProductSkuService 与 ProductWarehousingService
 * （SKU 查询、分页、更新、颜色图都在 Controller 里直接调 Service），属「Controller 依赖多个
 * Service」。取数与写库已下沉到 {@link ProductSkuOrchestrator}，本类只保留
 * 「端点声明 + 参数校验 + 响应组装」。
 */
@RestController
@RequestMapping("/api/style/sku")
@Slf4j
@PreAuthorize("isAuthenticated()")
public class ProductSkuController {

    @Autowired
    private ProductSkuOrchestrator productSkuOrchestrator;

    @GetMapping("/inventory/{skuCode}")
    public Result<Map<String, Object>> getInventory(@PathVariable String skuCode) {
        TenantAssert.assertTenantContext();
        return productSkuOrchestrator.getInventory(skuCode);
    }

    @PostMapping("/inventory/update")
    public Result<Void> updateInventory(@RequestBody StockUpdateDTO stockUpdate) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(stockUpdate.getSkuCode())) {
            return Result.fail("skuCode cannot be empty");
        }
        if (stockUpdate.getQuantity() == null) {
            return Result.fail("Quantity cannot be null");
        }
        productSkuOrchestrator.updateStock(stockUpdate.getSkuCode(), stockUpdate.getQuantity());
        return Result.success();
    }

    @GetMapping("/list")
    public Result<Page<ProductSku>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String styleNo,
            @RequestParam(required = false) String skuCode) {
        TenantAssert.assertTenantContext();
        return Result.success(productSkuOrchestrator.listSkus(page, pageSize, styleNo, skuCode));
    }

    @PostMapping("/sync/{styleId}")
    public Result<Void> syncSkus(@PathVariable Long styleId) {
        TenantAssert.assertTenantContext();
        productSkuOrchestrator.syncSkus(styleId);
        return Result.success();
    }

    @PutMapping("/{id}")
    public Result<Boolean> update(@PathVariable Long id, @RequestBody ProductSku sku) {
        TenantAssert.assertTenantContext();
        return productSkuOrchestrator.updateSku(id, sku);
    }

    @PostMapping("/search")
    public Result<List<ProductSku>> listByStyle(@RequestBody Map<String, Long> body) {
        TenantAssert.assertTenantContext();
        Long styleId = body.get("styleId");
        if (styleId == null) {
            return Result.fail("styleId不能为空");
        }
        return Result.success(productSkuOrchestrator.listByStyleId(styleId));
    }

    @Deprecated // 计划于 2026-08-10 移除，请使用新端点替代
    @GetMapping("/by-style/{styleId}")
    public Result<List<ProductSku>> listByStyleGet(@PathVariable Long styleId) {
        TenantAssert.assertTenantContext();
        return Result.success(productSkuOrchestrator.listByStyleId(styleId));
    }

    @PutMapping("/batch/{styleId}")
    public Result<Void> batchUpdate(@PathVariable Long styleId, @RequestBody SkuBatchUpdateDTO dto) {
        TenantAssert.assertTenantContext();
        List<ProductSku> skuList = dto.getSkuList();
        List<Long> deletedIds = dto.getDeletedIds();

        if ((skuList == null || skuList.isEmpty()) && (deletedIds == null || deletedIds.isEmpty())) {
            return Result.success();
        }
        if (skuList != null && skuList.size() > 200) {
            return Result.fail("单次最多更新200条SKU");
        }
        productSkuOrchestrator.batchUpdateSkus(styleId, skuList, deletedIds);
        return Result.success();
    }

    @PutMapping("/mode/{styleId}")
    public Result<Void> updateMode(@PathVariable Long styleId, @RequestBody Map<String, String> body) {
        TenantAssert.assertTenantContext();
        String skuMode = body.get("skuMode");
        if (!"AUTO".equals(skuMode) && !"MANUAL".equals(skuMode)) {
            return Result.fail("skuMode must be AUTO or MANUAL");
        }
        productSkuOrchestrator.updateSkuMode(styleId, skuMode);
        return Result.success();
    }

    @PostMapping("/sync-to-production/{styleId}")
    public Result<Void> syncToProduction(@PathVariable Long styleId) {
        TenantAssert.assertTenantContext();
        productSkuOrchestrator.syncSkusToProduction(styleId);
        return Result.success();
    }

    @PutMapping("/skc/{styleId}")
    public Result<Void> updateSkc(@PathVariable Long styleId, @RequestBody Map<String, String> body) {
        TenantAssert.assertTenantContext();
        String skc = body.get("skc");
        if (skc == null || skc.trim().isEmpty()) {
            return Result.fail("SKC不能为空");
        }
        productSkuOrchestrator.updateSkc(styleId, skc.trim());
        return Result.success();
    }

    @PutMapping("/rollback-remark/{styleId}")
    public Result<Void> saveRollbackRemark(@PathVariable Long styleId, @RequestBody Map<String, String> body) {
        TenantAssert.assertTenantContext();
        String remark = body.get("remark");
        productSkuOrchestrator.saveRollbackRemark(styleId, remark);
        return Result.success();
    }

    /**
     * 批量解析 SKU 摘要（款号 / 颜色 / 尺码 / 图片 / 价格），供电商各列表的「款式图」「款号」列使用。
     *
     * <p>body: {@code {"skuCodes": ["BR24XQ0098E草绿色L(170/84A)", ...]}}，单次上限 500 个编码。
     *
     * <p>为什么不让前端自己从 skuCode 切字符串：真实 SKU 编码没有分隔符
     * （款号直接拼颜色尺码），前端 {@code split('-')} 恒不命中，款式图永远空白。
     * 详见 {@link ProductSkuOrchestrator#briefBySkuCodes}。
     */
    @PostMapping("/brief")
    public Result<Map<String, Map<String, Object>>> briefBySkuCodes(@RequestBody Map<String, List<String>> body) {
        TenantAssert.assertTenantContext();
        return Result.success(productSkuOrchestrator.briefBySkuCodes(body == null ? null : body.get("skuCodes")));
    }

    /**
     * 获取指定款号所有颜色的图片映射
     */
    @GetMapping("/color-images/{styleNo}")
    public Result<Map<String, String>> getStyleColorImages(@PathVariable String styleNo) {
        TenantAssert.assertTenantContext();
        return Result.success(productSkuOrchestrator.getStyleColorImages(styleNo));
    }

    /**
     * 根据款号和颜色获取单个SKU的颜色图片
     */
    @GetMapping("/color-image")
    public Result<String> getSkuColorImage(
            @RequestParam String styleNo,
            @RequestParam String color) {
        TenantAssert.assertTenantContext();
        return Result.success(productSkuOrchestrator.getSkuColorImage(styleNo, color));
    }

    /**
     * 批量更新SKU颜色图片（按款号+颜色匹配）
     */
    @PutMapping("/color-images/{styleId}")
    public Result<Void> updateSkuColorImages(@PathVariable Long styleId, @RequestBody Map<String, String> colorImageMap) {
        TenantAssert.assertTenantContext();
        if (colorImageMap == null || colorImageMap.isEmpty()) {
            return Result.success();
        }
        productSkuOrchestrator.updateSkuColorImages(styleId, colorImageMap);
        return Result.success();
    }
}
