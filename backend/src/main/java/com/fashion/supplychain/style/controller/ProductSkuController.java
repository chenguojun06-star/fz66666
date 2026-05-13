package com.fashion.supplychain.style.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.style.dto.SkuBatchUpdateDTO;
import com.fashion.supplychain.style.dto.StockUpdateDTO;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.orchestration.ProductSkuOrchestrator;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/style/sku")
@Slf4j
@PreAuthorize("isAuthenticated()")
public class ProductSkuController {

    @Autowired
    private ProductSkuService productSkuService;

    @Autowired
    private ProductSkuOrchestrator productSkuOrchestrator;

    @GetMapping("/inventory/{skuCode}")
    public Result<Integer> getInventory(@PathVariable String skuCode) {
        TenantAssert.assertTenantContext();
        Long tid = UserContext.tenantId();
        ProductSku sku = productSkuService.getOne(new LambdaQueryWrapper<ProductSku>()
                .eq(ProductSku::getSkuCode, skuCode)
                .eq(ProductSku::getTenantId, tid));
        if (sku == null) {
            return Result.fail("SKU not found");
        }
        return Result.success(sku.getStockQuantity());
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
        productSkuService.updateStock(stockUpdate.getSkuCode(), stockUpdate.getQuantity());
        return Result.success();
    }

    @GetMapping("/list")
    public Result<Page<ProductSku>> list(
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "20") Integer pageSize,
            @RequestParam(required = false) String styleNo,
            @RequestParam(required = false) String skuCode) {
        Page<ProductSku> pageParam = new Page<>(page, pageSize);
        TenantAssert.assertTenantContext();
        Long tid = UserContext.tenantId();
        LambdaQueryWrapper<ProductSku> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProductSku::getTenantId, tid);

        if (StringUtils.hasText(styleNo)) {
            wrapper.eq(ProductSku::getStyleNo, styleNo.trim());
        }
        if (StringUtils.hasText(skuCode)) {
            wrapper.like(ProductSku::getSkuCode, skuCode.trim());
        }

        wrapper.orderByDesc(ProductSku::getId);
        return Result.success(productSkuService.page(pageParam, wrapper));
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
        Long tid = UserContext.tenantId();

        ProductSku existing = productSkuService.getById(id);
        if (existing == null) {
            return Result.fail("SKU不存在");
        }
        if (!tid.equals(existing.getTenantId())) {
            return Result.fail("无权操作其他租户数据");
        }

        sku.setId(id);
        sku.setTenantId(existing.getTenantId());
        sku.setStockQuantity(existing.getStockQuantity());
        sku.setVersion(existing.getVersion());
        sku.setSkuCode(existing.getSkuCode());
        sku.setStyleNo(existing.getStyleNo());

        return Result.success(productSkuService.updateById(sku));
    }

    @PostMapping("/list-by-style")
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
}
