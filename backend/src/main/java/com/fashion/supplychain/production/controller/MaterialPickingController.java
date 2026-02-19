package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.service.MaterialPickingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.util.StringUtils;
import lombok.Data;

@RestController
@RequestMapping("/api/production/picking")
@PreAuthorize("isAuthenticated()")
public class MaterialPickingController {

    @Autowired
    private MaterialPickingService materialPickingService;

    @PostMapping
    public Result<String> create(@RequestBody PickingRequest request) {
        return Result.success(materialPickingService.createPicking(request.getPicking(), request.getItems()));
    }

    @GetMapping("/list")
    public Result<IPage<MaterialPicking>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize,
            @RequestParam(required = false) String orderNo,
            @RequestParam(required = false) String styleNo) {

        LambdaQueryWrapper<MaterialPicking> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialPicking::getDeleteFlag, 0);
        if (StringUtils.hasText(orderNo)) {
            wrapper.like(MaterialPicking::getOrderNo, orderNo);
        }
        if (StringUtils.hasText(styleNo)) {
            wrapper.like(MaterialPicking::getStyleNo, styleNo);
        }
        wrapper.orderByDesc(MaterialPicking::getCreateTime);

        return Result.success(materialPickingService.page(new Page<>(page, pageSize), wrapper));
    }

    @GetMapping("/{id}/items")
    public Result<List<MaterialPickingItem>> getItems(@PathVariable String id) {
        return Result.success(materialPickingService.getItemsByPickingId(id));
    }

    @Data
    public static class PickingRequest {
        private MaterialPicking picking;
        private List<MaterialPickingItem> items;
    }
}
