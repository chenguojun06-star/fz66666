package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 生产工序跟踪 Controller
 */
@Slf4j
@Tag(name = "生产工序跟踪", description = "工资结算依据，菲号×工序的扫码记录")
@RestController
@RequestMapping("/api/production/process-tracking")
@PreAuthorize("isAuthenticated()")
public class ProductionProcessTrackingController {

    @Autowired
    private ProductionProcessTrackingOrchestrator trackingOrchestrator;

    /**
     * 查询订单的工序跟踪记录
     *
     * @param productionOrderId 生产订单ID
     * @return 跟踪记录列表
     */
    @Operation(summary = "查询订单的工序跟踪记录", description = "PC端弹窗显示，含SKU、颜色、工序、扫码状态")
    @GetMapping("/order/{productionOrderId}")
    public Result<List<ProductionProcessTracking>> getByOrderId(@PathVariable String productionOrderId) {
        List<ProductionProcessTracking> records = trackingOrchestrator.getTrackingRecords(productionOrderId);
        return Result.success(records);
    }

    /**
     * 管理员重置扫码记录（允许重新扫码）
     *
     * @param trackingId 跟踪记录ID
     * @param request 包含 resetReason 的请求体
     * @return 重置结果
     */
    @Operation(summary = "重置扫码记录", description = "管理员权限，允许退回重新扫码")
    @PostMapping("/{trackingId}/reset")
    public Result<Boolean> reset(@PathVariable String trackingId, @RequestBody Map<String, Object> request) {
        String resetReason = (String) request.get("resetReason");
        boolean success = trackingOrchestrator.resetScanRecord(trackingId, resetReason);
        return Result.success(success);
    }

    /**
     * 初始化工序跟踪记录（裁剪完成时自动调用）
     *
     * @param productionOrderId 生产订单ID
     * @return 生成的记录数量
     */
    @Operation(summary = "初始化工序跟踪记录", description = "裁剪完成时触发，生成菲号×工序的记录")
    @PostMapping("/initialize/{productionOrderId}")
    public Result<Integer> initialize(@PathVariable String productionOrderId) {
        int count = trackingOrchestrator.initializeProcessTracking(productionOrderId);
        return Result.success(count);
    }
}
