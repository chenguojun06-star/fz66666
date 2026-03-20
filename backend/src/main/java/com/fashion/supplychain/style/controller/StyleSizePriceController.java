package com.fashion.supplychain.style.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleSizePrice;
import com.fashion.supplychain.style.service.StyleSizePriceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.fashion.supplychain.common.UserContext;

/**
 * 样衣多码单价配置Controller
 */
@RestController
@RequestMapping("/api/style/size-price")
@PreAuthorize("isAuthenticated()")
public class StyleSizePriceController {

    @Autowired
    private StyleSizePriceService styleSizePriceService;

    /**
     * 根据款号ID查询多码单价列表
     */
    @GetMapping("/list")
    public Result<List<StyleSizePrice>> list(@RequestParam Long styleId) {
        Long tid = UserContext.tenantId();
        QueryWrapper<StyleSizePrice> qw = new QueryWrapper<>();
        qw.eq("style_id", styleId);
        if (tid != null) qw.eq("tenant_id", tid);
        qw.orderByAsc("process_code", "size");
        List<StyleSizePrice> list = styleSizePriceService.list(qw);
        return Result.success(list);
    }

    /**
     * 批量保存多码单价
     */
    @PostMapping("/batch-save")
    public Result<Boolean> batchSave(@RequestBody List<StyleSizePrice> list) {
        if (list == null || list.isEmpty()) {
            return Result.fail("数据不能为空");
        }

        // 先删除该款号的所有多码单价数据
        Long styleId = list.get(0).getStyleId();
        Long tid = UserContext.tenantId();
        QueryWrapper<StyleSizePrice> qw = new QueryWrapper<>();
        qw.eq("style_id", styleId);
        if (tid != null) qw.eq("tenant_id", tid);
        styleSizePriceService.remove(qw);

        // 批量插入新数据
        boolean success = styleSizePriceService.saveBatch(list);
        return Result.success(success);
    }

    /**
     * 删除多码单价
     */
    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        boolean success = styleSizePriceService.removeById(id);
        return Result.success(success);
    }
}
