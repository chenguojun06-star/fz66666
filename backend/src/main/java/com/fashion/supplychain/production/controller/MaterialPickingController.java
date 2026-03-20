package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestrator;
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

    @Autowired
    private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;

    @PostMapping
    public Result<String> create(@RequestBody PickingRequest request) {
        return Result.success(materialPickingService.createPicking(request.getPicking(), request.getItems()));
    }

    /**
     * BOM 申请领取：创建待出库领料单（两步流第一步）
     * status=pending，不立即扣减库存，等待仓库在「面辅料进销存」页确认出库
     */
    @PostMapping("/pending")
    public Result<String> createPending(@RequestBody PickingRequest request) {
        return Result.success(materialPickingService.savePendingPicking(
                request.getPicking(), request.getItems()));
    }

    @Autowired
    private com.fashion.supplychain.production.service.ProductionOrderService productionOrderService;

    @GetMapping("/list")
    public Result<IPage<MaterialPicking>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize,
            @RequestParam(required = false) String orderNo,
            @RequestParam(required = false) String styleNo,
            @RequestParam(required = false) String status) {

        // 工厂账号隔离：只能查看本工厂订单的领料记录
        java.util.List<String> factoryOrderIds = com.fashion.supplychain.common.DataPermissionHelper
                .getFactoryOrderIds(productionOrderService);
        if (factoryOrderIds != null && factoryOrderIds.isEmpty()) {
            return Result.success(new Page<>());
        }

        LambdaQueryWrapper<MaterialPicking> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialPicking::getDeleteFlag, 0);
        if (factoryOrderIds != null) {
            wrapper.in(MaterialPicking::getOrderId, factoryOrderIds);
        }
        if (StringUtils.hasText(orderNo)) {
            wrapper.like(MaterialPicking::getOrderNo, orderNo);
        }
        if (StringUtils.hasText(styleNo)) {
            wrapper.like(MaterialPicking::getStyleNo, styleNo);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(MaterialPicking::getStatus, status);
        }
        wrapper.orderByDesc(MaterialPicking::getCreateTime);

        return Result.success(materialPickingService.page(new Page<>(page, pageSize), wrapper));
    }

    @GetMapping("/{id}/items")
    public Result<List<MaterialPickingItem>> getItems(@PathVariable String id) {
        return Result.success(materialPickingService.getItemsByPickingId(id));
    }

    /**
     * 仓库确认出库（两步流第二步）
     * 实际扣减库存 + 状态改为 completed
     */
    @PostMapping("/{id}/confirm-outbound")
    public Result<Void> confirmOutbound(@PathVariable String id) {
        materialPurchaseOrchestrator.confirmPickingOutbound(id);
        return Result.success(null);
    }

    @Data
    public static class PickingRequest {
        private MaterialPicking picking;
        private List<MaterialPickingItem> items;
    }
}
