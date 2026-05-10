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

@Slf4j
@Tag(name = "生产工序跟踪", description = "工资结算依据，菲号×工序的扫码记录")
@RestController
@RequestMapping("/api/production/process-tracking")
@PreAuthorize("isAuthenticated()")
public class ProductionProcessTrackingController {

    @Autowired
    private ProductionProcessTrackingOrchestrator trackingOrchestrator;

    @Operation(summary = "查询订单的工序跟踪记录", description = "PC端弹窗显示，含SKU、颜色、工序、扫码状态")
    @GetMapping("/order/{productionOrderId}")
    public Result<List<ProductionProcessTracking>> getByOrderId(@PathVariable String productionOrderId) {
        List<ProductionProcessTracking> records = trackingOrchestrator.getTrackingRecords(productionOrderId);
        return Result.success(records);
    }

    @Operation(summary = "重置扫码记录", description = "管理员权限，允许退回重新扫码")
    @PostMapping("/{trackingId}/reset")
    public Result<Boolean> reset(@PathVariable String trackingId, @RequestBody Map<String, Object> request) {
        String resetReason = (String) request.get("resetReason");
        boolean success = trackingOrchestrator.resetScanRecord(trackingId, resetReason);
        return Result.success(success);
    }

    @Operation(summary = "初始化工序跟踪记录", description = "裁剪完成时触发，生成菲号×工序的记录")
    @PostMapping("/initialize/{productionOrderId}")
    public Result<Integer> initialize(@PathVariable String productionOrderId) {
        int count = trackingOrchestrator.initializeProcessTracking(productionOrderId);
        return Result.success(count);
    }

    @Operation(summary = "修复入库工序跟踪", description = "补齐commit 7b0d8817之前已入库但tracking仍为pending的历史记录")
    @PostMapping("/{orderId}/repair-warehousing")
    public Result<Map<String, Object>> repairWarehousingTracking(@PathVariable String orderId) {
        Map<String, Object> result = trackingOrchestrator.repairWarehousingTracking(orderId);
        return Result.success(result);
    }

    @Operation(summary = "工序同名汇总", description = "按工序名称聚合所有订单的跟踪记录，支持按款式筛选")
    @PostMapping("/process-summary")
    public Result<List<Map<String, Object>>> getProcessSummary(@RequestBody(required = false) Map<String, Object> params) {
        return Result.success(trackingOrchestrator.getProcessSummary(params));
    }

    @Operation(summary = "工序节点统计", description = "按父节点统计全部订单的工序完成度分布")
    @PostMapping("/node-stats")
    public Result<List<Map<String, Object>>> getNodeStats(@RequestBody(required = false) Map<String, Object> params) {
        return Result.success(trackingOrchestrator.getNodeStats(params));
    }

    @Operation(summary = "工序质检", description = "对菲号×工序进行质检，录入合格/次品数量，有次品可锁定菲号阻止下游扫码")
    @PostMapping("/quality-inspect")
    public Result<Map<String, Object>> qualityInspect(@RequestBody Map<String, Object> params) {
        return Result.success(trackingOrchestrator.qualityInspect(params));
    }

    @Operation(summary = "批量质检合格", description = "批量将多个菲号标记为质检合格")
    @PostMapping("/batch-quality-pass")
    public Result<Map<String, Object>> batchQualityPass(@RequestBody Map<String, Object> params) {
        return Result.success(trackingOrchestrator.batchQualityPass(params));
    }

    @Operation(summary = "锁定菲号", description = "锁定菲号阻止下游扫码，仅次品质检后可锁定")
    @PostMapping("/lock-bundle/{trackingId}")
    public Result<Boolean> lockBundle(@PathVariable String trackingId) {
        return Result.success(trackingOrchestrator.lockBundle(trackingId));
    }

    @Operation(summary = "解锁菲号", description = "返修完成后解锁菲号，恢复下游扫码")
    @PostMapping("/unlock-bundle/{trackingId}")
    public Result<Boolean> unlockBundle(@PathVariable String trackingId) {
        return Result.success(trackingOrchestrator.unlockBundle(trackingId));
    }

    @Operation(summary = "返修完成", description = "标记菲号返修完成，进入待复检状态")
    @PostMapping("/repair-complete/{trackingId}")
    public Result<Boolean> repairComplete(@PathVariable String trackingId) {
        return Result.success(trackingOrchestrator.repairComplete(trackingId));
    }
}
