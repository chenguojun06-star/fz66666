package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.FactoryShipment;
import com.fashion.supplychain.production.orchestration.FactoryShipmentOrchestrator;
import com.fashion.supplychain.production.service.FactoryShipmentService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import com.fashion.supplychain.production.entity.FactoryShipmentDetail;
import com.fashion.supplychain.production.service.FactoryShipmentDetailService;

@RestController
@RequestMapping("/api/production/factory-shipment")
@PreAuthorize("isAuthenticated()")
public class FactoryShipmentController {

    @Autowired
    private FactoryShipmentOrchestrator factoryShipmentOrchestrator;
    @Autowired
    private FactoryShipmentService factoryShipmentService;
    @Autowired
    private FactoryShipmentDetailService factoryShipmentDetailService;
    @Autowired
    private ProductionOrderService productionOrderService;

    @PostMapping("/ship")
    public Result<FactoryShipment> ship(@RequestBody Map<String, Object> params) {
        return factoryShipmentOrchestrator.ship(params);
    }

    @PostMapping("/{id}/receive")
    public Result<FactoryShipment> receive(@PathVariable("id") String id,
                                           @RequestParam(value = "receivedQuantity", required = false) Integer receivedQuantity) {
        return factoryShipmentOrchestrator.receive(id, receivedQuantity);
    }

    @PostMapping("/list")
    public Result<IPage<FactoryShipment>> list(@RequestBody Map<String, Object> params) {
        java.util.List<String> factoryOrderIds = DataPermissionHelper.getFactoryOrderIds(productionOrderService);
        if (factoryOrderIds != null && factoryOrderIds.isEmpty()) {
            return Result.success(new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>());
        }
        if (factoryOrderIds != null) {
            params = params != null ? new java.util.HashMap<>(params) : new java.util.HashMap<>();
            params.put("_factoryOrderIds", factoryOrderIds);
        }
        return Result.success(factoryShipmentService.queryPage(params));
    }

    @GetMapping("/by-order/{orderId}")
    public Result<?> listByOrder(@PathVariable("orderId") String orderId) {
        java.util.List<String> factoryOrderIds = DataPermissionHelper.getFactoryOrderIds(productionOrderService);
        if (factoryOrderIds != null && !factoryOrderIds.contains(orderId)) {
            return Result.success(java.util.List.of());
        }
        return Result.success(factoryShipmentService.lambdaQuery()
                .eq(FactoryShipment::getOrderId, orderId)
                .eq(FactoryShipment::getDeleteFlag, 0)
                .orderByDesc(FactoryShipment::getCreateTime)
                .list());
    }

    @GetMapping("/shippable/{orderId}")
    public Result<Map<String, Object>> shippable(@PathVariable("orderId") String orderId) {
        return Result.success(factoryShipmentOrchestrator.getShippableInfo(orderId));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable("id") String id) {
        return factoryShipmentOrchestrator.deleteShipment(id);
    }

    @GetMapping("/{id}/details")
    public Result<List<FactoryShipmentDetail>> getDetails(@PathVariable("id") String id) {
        return Result.success(factoryShipmentDetailService.listByShipmentId(id));
    }

    @GetMapping("/order-detail-sum/{orderId}")
    public Result<List<Map<String, Object>>> getOrderDetailSum(@PathVariable("orderId") String orderId) {
        return Result.success(factoryShipmentOrchestrator.getOrderShipmentDetailSum(orderId));
    }
}
