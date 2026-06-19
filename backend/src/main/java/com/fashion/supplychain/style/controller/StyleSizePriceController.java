package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleSizePrice;
import com.fashion.supplychain.style.orchestration.StyleSizePriceOrchestrator;
import com.fashion.supplychain.style.service.StyleSizePriceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 样衣多码单价配置Controller
 */
@RestController
@RequestMapping("/api/style/size-price")
@PreAuthorize("isAuthenticated()")
public class StyleSizePriceController {

    @Autowired
    private StyleSizePriceService styleSizePriceService;

    @Autowired
    private StyleSizePriceOrchestrator styleSizePriceOrchestrator;

    /**
     * 根据款号ID查询多码单价列表
     */
    @GetMapping("/list")
    public Result<List<StyleSizePrice>> list(
            @RequestParam(required = false) String styleId,
            @RequestParam(required = false) String styleNo) {
        Long resolvedStyleId = StyleIdResolver.resolve(styleId, styleNo);
        if (resolvedStyleId == null) {
            return Result.success(java.util.Collections.emptyList());
        }
        return Result.success(styleSizePriceOrchestrator.listByStyleId(resolvedStyleId));
    }

    /**
     * 批量保存多码单价
     */
    @PostMapping("/batch-save")
    public Result<Boolean> batchSave(@RequestBody List<StyleSizePrice> list) {
        if (list == null || list.isEmpty()) {
            return Result.fail("数据不能为空");
        }
        boolean success = styleSizePriceOrchestrator.batchSave(list);
        if (!success) {
            return Result.fail("保存失败");
        }
        return Result.success(true);
    }

    /**
     * 删除多码单价
     */
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        boolean success = styleSizePriceOrchestrator.delete(id);
        if (!success) {
            return Result.fail("删除失败");
        }
        return Result.success(success);
    }
}
