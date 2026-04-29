package com.fashion.supplychain.warehouse.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.warehouse.dto.*;
import com.fashion.supplychain.warehouse.orchestration.WarehouseDashboardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.WarehouseIntelligenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 仓库数据看板控制器
 */
@Slf4j
@RestController
@RequestMapping("/api/warehouse/dashboard")
@PreAuthorize("isAuthenticated()")
public class WarehouseDashboardController {

    @Autowired
    private WarehouseDashboardOrchestrator orchestrator;

    @Autowired(required = false)
    private WarehouseIntelligenceOrchestrator warehouseIntelligenceOrchestrator;

    /**
     * 获取仓库统计数据
     */
    @GetMapping("/stats")
    @PreAuthorize("isAuthenticated()")
    public Result<WarehouseStatsDTO> getStats() {
        log.debug("获取仓库统计数据");
        return Result.success(orchestrator.getWarehouseStats());
    }

    /**
     * 获取低库存预警列表
     */
    @GetMapping("/low-stock")
    @PreAuthorize("isAuthenticated()")
    public Result<List<LowStockItemDTO>> getLowStockItems() {
        log.debug("获取低库存预警列表");
        return Result.success(orchestrator.getLowStockItems());
    }

    /**
     * 获取今日出入库操作记录
     */
    @GetMapping("/recent-operations")
    @PreAuthorize("isAuthenticated()")
    public Result<List<RecentOperationDTO>> getRecentOperations() {
        log.debug("获取今日出入库操作记录");
        return Result.success(orchestrator.getRecentOperations());
    }

    /**
     * 获取趋势数据
     * @param range 时间范围: day(日), week(周), month(月), year(年)
     * @param type 物料类型: fabric(面料), accessory(辅料), finished(成品)
     */
    @GetMapping("/trend")
    @PreAuthorize("isAuthenticated()")
    public Result<List<TrendDataPointDTO>> getTrendData(
            @RequestParam(defaultValue = "day") String range,
            @RequestParam(defaultValue = "fabric") String type) {
        log.debug("获取趋势数据, range={}, type={}", range, type);
        return Result.success(orchestrator.getTrendData(range, type));
    }

    @GetMapping("/intelligence/safety-stock-alerts")
    @PreAuthorize("isAuthenticated()")
    public Result<?> getSafetyStockAlerts() {
        if (warehouseIntelligenceOrchestrator == null) return Result.success(java.util.Collections.emptyList());
        try {
            return Result.success(warehouseIntelligenceOrchestrator.checkSafetyStockAlerts());
        } catch (Exception e) {
            log.warn("[WarehouseIntel] 安全库存预警查询失败: {}", e.getMessage());
            return Result.success(java.util.Collections.emptyList());
        }
    }

    @GetMapping("/intelligence/expiry-alerts")
    @PreAuthorize("isAuthenticated()")
    public Result<?> getExpiryAlerts() {
        if (warehouseIntelligenceOrchestrator == null) return Result.success(java.util.Collections.emptyList());
        try {
            return Result.success(warehouseIntelligenceOrchestrator.checkExpiryAlerts());
        } catch (Exception e) {
            log.warn("[WarehouseIntel] 过期预警查询失败: {}", e.getMessage());
            return Result.success(java.util.Collections.emptyList());
        }
    }
}
