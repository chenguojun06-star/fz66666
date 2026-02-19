package com.fashion.supplychain.dashboard.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.dashboard.orchestration.DashboardOrchestrator;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 仪表盘统计控制器，汇总款号、生产以及对账等核心数据。
 */
@RestController
@RequestMapping("/api/dashboard")
@PreAuthorize("isAuthenticated()")
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

    /**
     * 获取质检统计数据
     * - 入库数、次品数、次品率、合格率、返修问题
     * @param range 时间范围：day(今日)、week(本周)、month(本月)
     */
    @GetMapping("/quality-stats")
    public Result<?> qualityStats(@RequestParam(required = false, defaultValue = "week") String range) {
        return Result.success(dashboardOrchestrator.getQualityStats(range));
    }

    /**
     * 获取顶部统计数据（4个核心看板）
     * - 样衣开发数量、大货下单数量、裁剪数量、出入库数量
     * @param range 时间范围：day(日)、week(周)、month(月)、year(年)
     */
    @GetMapping("/top-stats")
    public Result<?> topStats(@RequestParam(required = false, defaultValue = "week") String range) {
        return Result.success(dashboardOrchestrator.getTopStats(range));
    }

    /**
     * 获取订单与裁剪数量折线图数据（最近30天）
     */
    @GetMapping("/order-cutting-chart")
    public Result<?> orderCuttingChart() {
        return Result.success(dashboardOrchestrator.getOrderCuttingChart());
    }

    /**
     * 获取扫菲次数折线图数据（最近30天）
     */
    @GetMapping("/scan-count-chart")
    public Result<?> scanCountChart() {
        return Result.success(dashboardOrchestrator.getScanCountChart());
    }

    /**
     * 获取延期订单列表
     */
    @GetMapping("/overdue-orders")
    @PreAuthorize("hasAuthority('MENU_DASHBOARD')")
    public Result<?> overdueOrders() {
        return Result.success(dashboardOrchestrator.getOverdueOrders());
    }
}
