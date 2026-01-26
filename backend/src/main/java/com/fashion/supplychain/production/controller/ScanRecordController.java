package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.orchestration.ScanRecordOrchestrator;
import com.fashion.supplychain.production.service.SKUService;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.List;

/**
 * 扫码记录Controller
 */
@RestController
@RequestMapping("/api/production/scan")
public class ScanRecordController {

    @Autowired
    private ScanRecordOrchestrator scanRecordOrchestrator;

    // ✅ Phase 3新增: SKU服务注入
    @Autowired
    private SKUService skuService;

    /**
     * 执行扫码操作
     */
    @PostMapping("/execute")
    public Result<?> execute(@RequestBody Map<String, Object> params) {
        return Result.success(scanRecordOrchestrator.execute(params));
    }

    @PostMapping("/unit-price")
    public Result<?> resolveUnitPrice(@RequestBody Map<String, Object> params) {
        return Result.success(scanRecordOrchestrator.resolveUnitPrice(params));
    }

    @PostMapping("/undo")
    public Result<?> undo(@RequestBody Map<String, Object> params) {
        return Result.success(scanRecordOrchestrator.undo(params));
    }

    /**
     * 分页查询扫码记录
     */
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<ScanRecord> page = scanRecordOrchestrator.list(params);
        return Result.success(page);
    }

    /**
     * 根据订单ID查询扫码记录
     */
    @GetMapping("/order/{orderId}")
    public Result<?> getByOrderId(@PathVariable String orderId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize) {
        return Result.success(scanRecordOrchestrator.getByOrderId(orderId, page, pageSize));
    }

    /**
     * 根据款号查询扫码记录
     */
    @GetMapping("/style/{styleNo}")
    public Result<?> getByStyleNo(@PathVariable String styleNo,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize) {
        return Result.success(scanRecordOrchestrator.getByStyleNo(styleNo, page, pageSize));
    }

    /**
     * 获取扫码历史记录
     */
    @GetMapping("/history")
    public Result<?> getHistory(@RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize) {
        return Result.success(scanRecordOrchestrator.getHistory(page, pageSize));
    }

    @GetMapping("/my-history")
    public Result<?> getMyHistory(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int pageSize,
            @RequestParam(required = false) String scanType) {
        return Result.success(scanRecordOrchestrator.getMyHistory(page, pageSize, scanType));
    }

    @GetMapping("/personal-stats")
    public Result<?> personalStats(@RequestParam(required = false) String scanType) {
        return Result.success(scanRecordOrchestrator.getPersonalStats(scanType));
    }

    @PostMapping("/cleanup")
    public Result<?> cleanup(@RequestParam(required = false) String from) {
        return Result.success(scanRecordOrchestrator.cleanup(from));
    }

    /**
     * 获取我的质检待处理任务（已领取未确认结果）
     */
    @GetMapping("/my-quality-tasks")
    public Result<?> getMyQualityTasks() {
        return Result.success(scanRecordOrchestrator.getMyQualityTasks());
    }

    @PostMapping("/delete-full-link/{orderId}")
    public Result<?> deleteFullLinkByOrderId(@PathVariable String orderId) {
        return Result.success(scanRecordOrchestrator.deleteFullLinkByOrderId(orderId));
    }

    // ================= ✅ Phase 3新增: SKU相关端点 =================

    /**
     * 获取订单的SKU列表
     */
    @GetMapping("/sku/list/{orderNo}")
    public Result<?> getSKUList(@PathVariable String orderNo) {
        return Result.success(skuService.getSKUListByOrder(orderNo));
    }

    /**
     * 获取单个SKU的进度
     */
    @GetMapping("/sku/progress")
    public Result<?> getSKUProgress(
            @RequestParam String orderNo,
            @RequestParam String styleNo,
            @RequestParam String color,
            @RequestParam String size) {
        return Result.success(skuService.getSKUProgress(orderNo, styleNo, color, size));
    }

    /**
     * 获取订单的整体SKU进度
     */
    @GetMapping("/sku/order-progress/{orderNo}")
    public Result<?> getOrderSKUProgress(@PathVariable String orderNo) {
        return Result.success(skuService.getOrderSKUProgress(orderNo));
    }

    /**
     * 查询SKU统计信息 (分页)
     */
    @GetMapping("/sku/statistics")
    public Result<?> querySKUStatistics(@RequestParam Map<String, Object> params) {
        return Result.success(skuService.querySKUStatistics(params));
    }

    /**
     * 检查SKU是否已完成
     */
    @GetMapping("/sku/is-completed")
    public Result<?> isSKUCompleted(
            @RequestParam String orderNo,
            @RequestParam String styleNo,
            @RequestParam String color,
            @RequestParam String size) {
        boolean completed = skuService.isSKUCompleted(orderNo, styleNo, color, size);
        return Result.success(completed);
    }

    /**
     * 生成SKU报告
     */
    @GetMapping("/sku/report/{orderNo}")
    public Result<?> generateSKUReport(@PathVariable String orderNo) {
        return Result.success(skuService.generateSKUReport(orderNo));
    }

    /**
     * 检测扫码模式
     */
    @PostMapping("/sku/detect-mode")
    public Result<?> detectScanMode(@RequestBody Map<String, Object> params) {
        String scanCode = (String) params.get("scanCode");
        String color = (String) params.get("color");
        String size = (String) params.get("size");
        String mode = skuService.detectScanMode(scanCode, color, size);
        return Result.success(mode);
    }

    /**
     * 验证SKU数据
     */
    @PostMapping("/sku/validate")
    public Result<?> validateSKU(@RequestBody ScanRecord scanRecord) {
        boolean valid = skuService.validateSKU(scanRecord);
        return Result.success(valid);
    }

    /**
     * 获取订单的工序单价配置（Phase 5新增）
     */
    @GetMapping("/process-prices/{orderNo}")
    public Result<?> getProcessUnitPrices(@PathVariable String orderNo) {
        List<Map<String, Object>> prices = skuService.getProcessUnitPrices(orderNo);
        return Result.success(prices);
    }

    /**
     * 根据工序名称获取单价（Phase 5新增）
     */
    @GetMapping("/process-price/{orderNo}/{processName}")
    public Result<?> getUnitPriceByProcess(
            @PathVariable String orderNo,
            @PathVariable String processName) {
        Map<String, Object> priceInfo = skuService.getUnitPriceByProcess(orderNo, processName);
        return Result.success(priceInfo);
    }

    /**
     * 计算订单总工价（Phase 5新增）
     */
    @GetMapping("/order-total-cost/{orderNo}")
    public Result<?> calculateOrderTotalCost(@PathVariable String orderNo) {
        Map<String, Object> costInfo = skuService.calculateOrderTotalCost(orderNo);
        return Result.success(costInfo);
    }
}
