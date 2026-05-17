package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.OrderImage;
import com.fashion.supplychain.production.entity.OrderImageSnapshot;
import com.fashion.supplychain.production.orchestration.OrderImageOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/production/order-image")
@PreAuthorize("isAuthenticated()")
public class OrderImageController {

    @Autowired
    private OrderImageOrchestrator orderImageOrchestrator;

    @PostMapping("/list")
    public Result<List<OrderImage>> list(@RequestBody Map<String, String> params) {
        String orderNo = params.get("orderNo");
        if (orderNo == null || orderNo.trim().isEmpty()) {
            return Result.fail("orderNo不能为空");
        }
        return Result.success(orderImageOrchestrator.listByOrderNo(orderNo));
    }

    @PostMapping
    public Result<OrderImage> add(@RequestBody Map<String, String> params) {
        String orderNo = params.get("orderNo");
        String imageUrl = params.get("imageUrl");
        String thumbnailUrl = params.get("thumbnailUrl");
        if (orderNo == null || orderNo.trim().isEmpty()) {
            return Result.fail("orderNo不能为空");
        }
        if (imageUrl == null || imageUrl.trim().isEmpty()) {
            return Result.fail("imageUrl不能为空");
        }
        try {
            return Result.success(orderImageOrchestrator.addImage(orderNo, imageUrl, thumbnailUrl));
        } catch (RuntimeException e) {
            return Result.fail(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        try {
            orderImageOrchestrator.deleteImage(id);
            return Result.success(null);
        } catch (RuntimeException e) {
            return Result.fail(e.getMessage());
        }
    }

    @PostMapping("/reorder")
    public Result<Void> reorder(@RequestBody Map<String, Object> params) {
        String orderNo = (String) params.get("orderNo");
        @SuppressWarnings("unchecked")
        List<Long> imageIds = (List<Long>) params.get("imageIds");
        if (orderNo == null || orderNo.trim().isEmpty()) {
            return Result.fail("orderNo不能为空");
        }
        if (imageIds == null || imageIds.isEmpty()) {
            return Result.fail("imageIds不能为空");
        }
        orderImageOrchestrator.reorderImages(orderNo, imageIds);
        return Result.success(null);
    }

    @PostMapping("/snapshots")
    public Result<List<OrderImageSnapshot>> snapshots(@RequestBody Map<String, String> params) {
        String orderNo = params.get("orderNo");
        if (orderNo == null || orderNo.trim().isEmpty()) {
            return Result.fail("orderNo不能为空");
        }
        return Result.success(orderImageOrchestrator.listSnapshots(orderNo));
    }
}
