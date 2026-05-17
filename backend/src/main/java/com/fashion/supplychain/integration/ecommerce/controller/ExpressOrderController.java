package com.fashion.supplychain.integration.ecommerce.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.orchestration.ExpressOrderOrchestrator;
import com.fashion.supplychain.integration.entity.ExpressOrder;
import com.fashion.supplychain.integration.logistics.LogisticsManager;
import com.fashion.supplychain.integration.logistics.LogisticsService;
import com.fashion.supplychain.integration.logistics.ShippingRequest;
import com.fashion.supplychain.integration.logistics.TrackingInfo;
import com.fashion.supplychain.integration.service.ExpressOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/express-order")
@PreAuthorize("isAuthenticated()")
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class ExpressOrderController {

    @Autowired
    private ExpressOrderOrchestrator orchestrator;

    @Autowired
    private ExpressOrderService expressOrderService;

    @Autowired
    private LogisticsManager logisticsManager;

    @PostMapping("/list")
    public Result<IPage<ExpressOrder>> list(@RequestBody Map<String, Object> params) {
        Long tenantId = TenantAssert.requireTenantId();
        int page = params.get("page") != null ? ((Number) params.get("page")).intValue() : 1;
        int pageSize = params.get("pageSize") != null ? ((Number) params.get("pageSize")).intValue() : 20;
        String platformCode = (String) params.get("platformCode");
        String keyword = (String) params.get("keyword");
        return Result.success(expressOrderService.pageByTenant(tenantId, page, pageSize, platformCode, keyword));
    }

    @PostMapping("/create")
    public Result<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
        String ecommerceOrderId = (String) body.get("ecommerceOrderId");
        Integer expressCompany = body.get("expressCompany") != null
                ? ((Number) body.get("expressCompany")).intValue() : 1;
        BigDecimal weight = body.get("weight") != null
                ? new BigDecimal(body.get("weight").toString()) : BigDecimal.valueOf(1.0);

        if (ecommerceOrderId == null || ecommerceOrderId.isBlank()) {
            return Result.fail("电商订单ID不能为空");
        }

        try {
            Map<String, Object> result = orchestrator.createShipment(ecommerceOrderId, expressCompany, weight);
            return Result.success(result);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            log.error("[快递下单] 失败", e);
            return Result.fail("下单失败: " + e.getMessage());
        }
    }

    @PostMapping("/cancel")
    public Result<Map<String, Object>> cancel(@RequestBody Map<String, Object> body) {
        String expressOrderId = (String) body.get("expressOrderId");
        if (expressOrderId == null || expressOrderId.isBlank()) {
            return Result.fail("快递单ID不能为空");
        }
        try {
            return Result.success(orchestrator.cancelShipment(expressOrderId));
        } catch (Exception e) {
            return Result.fail("取消失败: " + e.getMessage());
        }
    }

    @GetMapping("/track/{trackingNo}")
    public Result<List<TrackingInfo>> track(@PathVariable String trackingNo,
                                             @RequestParam(defaultValue = "1") Integer companyCode) {
        LogisticsService.LogisticsType type = resolveType(companyCode);
        try {
            return Result.success(logisticsManager.trackShipment(trackingNo, type));
        } catch (Exception e) {
            return Result.fail("查询失败: " + e.getMessage());
        }
    }

    @PostMapping("/estimate-fee")
    public Result<Map<String, Long>> estimateFee(@RequestBody Map<String, Object> body) {
        String ecommerceOrderId = (String) body.get("ecommerceOrderId");
        BigDecimal weight = body.get("weight") != null
                ? new BigDecimal(body.get("weight").toString()) : BigDecimal.valueOf(1.0);

        ShippingRequest.ContactInfo dummy = ShippingRequest.ContactInfo.builder()
                .name("").mobile("").province("广东省").city("广州市").district("白云区").address("")
                .build();

        ShippingRequest request = ShippingRequest.builder()
                .orderId(ecommerceOrderId)
                .sender(dummy).recipient(dummy)
                .cargo(ShippingRequest.CargoInfo.builder().weight(weight).build())
                .build();

        try {
            return Result.success(logisticsManager.compareShippingFees(request));
        } catch (Exception e) {
            return Result.fail("估算失败: " + e.getMessage());
        }
    }

    private LogisticsService.LogisticsType resolveType(Integer code) {
        if (code == null) return LogisticsService.LogisticsType.SF;
        return switch (code) {
            case 1 -> LogisticsService.LogisticsType.SF;
            case 2 -> LogisticsService.LogisticsType.STO;
            case 3 -> LogisticsService.LogisticsType.YTO;
            case 4 -> LogisticsService.LogisticsType.ZTO;
            case 5 -> LogisticsService.LogisticsType.EMS;
            case 6 -> LogisticsService.LogisticsType.JD;
            case 7 -> LogisticsService.LogisticsType.YD;
            default -> LogisticsService.LogisticsType.SF;
        };
    }
}