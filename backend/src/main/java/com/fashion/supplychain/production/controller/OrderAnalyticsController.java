package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.dto.response.OrderAnalyticsVO;
import com.fashion.supplychain.production.orchestration.OrderAnalyticsOrchestrator;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 订单智能数据分析 Controller（只读聚合）
 */
@Slf4j
@RestController
@RequestMapping("/api/order-analytics")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
@Tag(name = "订单数据分析", description = "订单智能数据分析：总览/趋势/工厂时效/次品率/毛利估算")
public class OrderAnalyticsController {

    private final OrderAnalyticsOrchestrator orderAnalyticsOrchestrator;

    @GetMapping("/overview")
    @Operation(summary = "订单智能数据分析总览", description = "返回总览指标、近30天下单趋势、工厂时效排行、次品率排行、毛利估算")
    public Result<OrderAnalyticsVO> overview(
            @Parameter(description = "统计窗口天数，默认365") @RequestParam(defaultValue = "365") int days) {
        TenantAssert.assertTenantContext();
        return Result.success(orderAnalyticsOrchestrator.getAnalytics(days));
    }
}
