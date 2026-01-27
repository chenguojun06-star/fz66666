package com.fashion.supplychain.dashboard.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.dashboard.orchestration.DashboardOrchestrator;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 仪表盘统计控制器，汇总款号、生产以及对账等核心数据。
 */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardOrchestrator dashboardOrchestrator;

    public DashboardController(DashboardOrchestrator dashboardOrchestrator) {
        this.dashboardOrchestrator = dashboardOrchestrator;
    }

    /**
     * 获取首页仪表盘统计数据及近期业务动态。
     */
    @GetMapping
    public Result<?> dashboard(
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") String startDate,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") String endDate,
            @RequestParam(required = false) String brand,
            @RequestParam(required = false) String factory
    ) {
        return Result.success(dashboardOrchestrator.dashboard(startDate, endDate, brand, factory));
    }

    /**
     * 获取紧急事件列表（延期订单、次品、待审批等）
     */
    @GetMapping("/urgent-events")
    public Result<?> urgentEvents() {
        return Result.success(dashboardOrchestrator.getUrgentEvents());
    }

    /**
     * 获取交期预警数据
     * - 紧急订单：距离交期1-4天
     * - 预警订单：距离交期5-7天
     */
    @GetMapping("/delivery-alert")
    public Result<?> deliveryAlert() {
        return Result.success(dashboardOrchestrator.getDeliveryAlert());
    }
}
