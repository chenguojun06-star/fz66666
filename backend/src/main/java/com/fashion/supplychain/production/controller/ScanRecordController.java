package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.orchestration.ScanRecordOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

/**
 * 扫码记录Controller
 */
@RestController
@RequestMapping("/api/production/scan")
public class ScanRecordController {

    @Autowired
    private ScanRecordOrchestrator scanRecordOrchestrator;

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

    @PostMapping("/delete-full-link/{orderId}")
    public Result<?> deleteFullLinkByOrderId(@PathVariable String orderId) {
        return Result.success(scanRecordOrchestrator.deleteFullLinkByOrderId(orderId));
    }
}
