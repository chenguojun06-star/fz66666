package com.fashion.supplychain.style.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.dto.StockUpdateDTO;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/style/sku")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ProductSkuController {

    private final ProductSkuService productSkuService;

    @GetMapping("/inventory/{skuCode}")
    public Result<Integer> getInventory(@PathVariable String skuCode) {
        ProductSku sku = productSkuService.getOne(new LambdaQueryWrapper<ProductSku>()
                .eq(ProductSku::getSkuCode, skuCode));
        if (sku == null) {
            return Result.fail("SKU not found");
        }
        return Result.success(sku.getStockQuantity());
    }

    @PostMapping("/inventory/update")
    public Result<Void> updateInventory(@RequestBody StockUpdateDTO stockUpdate) {
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
        LambdaQueryWrapper<ProductSku> wrapper = new LambdaQueryWrapper<>();

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
        productSkuService.generateSkusForStyle(styleId);
        return Result.success();
    }

    @PutMapping("/{id}")
    public Result<Boolean> update(@PathVariable Long id, @RequestBody ProductSku sku) {
        sku.setId(id);
        return Result.success(productSkuService.updateById(sku));
    }
}
