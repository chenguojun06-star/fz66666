package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.FactoryShipment;
import com.fashion.supplychain.production.entity.FactoryShipmentDetail;
import com.fashion.supplychain.production.orchestration.FactoryShipmentOrchestrator;
import com.fashion.supplychain.production.service.FactoryShipmentService;
import com.fashion.supplychain.production.service.FactoryShipmentDetailService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

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

    /** 外发工厂发货 */
    @PostMapping("/ship")
    public Result<FactoryShipment> ship(@RequestBody Map<String, Object> params) {
        return factoryShipmentOrchestrator.ship(params);
    }

    /** 本厂收货确认（物流级） */
    @PostMapping("/{id}/receive")
    public Result<FactoryShipment> receive(@PathVariable("id") String id,
                                           @RequestBody Map<String, Object> params) {
        Integer receivedQuantity = params.get("receivedQuantity") instanceof Number
                ? ((Number) params.get("receivedQuantity")).intValue() : null;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> receiveDetails = (List<Map<String, Object>>) params.get("details");
        return factoryShipmentOrchestrator.receive(id, receivedQuantity, receiveDetails);
    }

    /** 质检 — 区分合格品/次品 */
    @PostMapping("/{id}/quality-check")
    public Result<FactoryShipment> qualityCheck(@PathVariable("id") String id,
                                                 @RequestBody Map<String, Object> params) {
        int qualifiedQty = params.get("qualifiedQty") instanceof Number
                ? ((Number) params.get("qualifiedQty")).intValue() : 0;
        int defectiveQty = params.get("defectiveQty") instanceof Number
                ? ((Number) params.get("defectiveQty")).intValue() : 0;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> qualityDetails = (List<Map<String, Object>>) params.get("details");
        return factoryShipmentOrchestrator.qualityCheck(id, qualifiedQty, defectiveQty, qualityDetails);
    }

    /** 次品退回外发厂返修 */
    @PostMapping("/{id}/return-defective")
    public Result<FactoryShipment> returnDefective(@PathVariable("id") String id,
                                                    @RequestBody Map<String, Object> params) {
        int returnQty = params.get("returnQty") instanceof Number
                ? ((Number) params.get("returnQty")).intValue() : 0;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> returnDetails = (List<Map<String, Object>>) params.get("details");
        return factoryShipmentOrchestrator.returnDefective(id, returnQty, returnDetails);
    }

    /** 发货单列表 */
    @PostMapping("/list")
    public Result<IPage<FactoryShipment>> list(@RequestBody Map<String, Object> params) {
        List<String> factoryOrderIds = DataPermissionHelper.getFactoryOrderIds(productionOrderService);
        if (factoryOrderIds != null && factoryOrderIds.isEmpty()) {
            return Result.success(new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>());
        }
        if (factoryOrderIds != null) {
            params = params != null ? new java.util.HashMap<>(params) : new java.util.HashMap<>();
            params.put("_factoryOrderIds", factoryOrderIds);
        }
        return Result.success(factoryShipmentService.queryPage(params));
    }

    /** 按订单查发货单 */
    @GetMapping("/by-order/{orderId}")
    public Result<?> listByOrder(@PathVariable("orderId") String orderId) {
        List<String> factoryOrderIds = DataPermissionHelper.getFactoryOrderIds(productionOrderService);
        if (factoryOrderIds != null && !factoryOrderIds.contains(orderId)) {
            return Result.success(List.of());
        }
        return Result.success(factoryShipmentService.lambdaQuery()
                .eq(FactoryShipment::getOrderId, orderId)
                .eq(FactoryShipment::getDeleteFlag, 0)
                .orderByDesc(FactoryShipment::getCreateTime)
                .list());
    }

    /** 可发货信息 */
    @GetMapping("/shippable/{orderId}")
    public Result<Map<String, Object>> shippable(@PathVariable("orderId") String orderId) {
        return Result.success(factoryShipmentOrchestrator.getShippableInfo(orderId));
    }

    /** 删除发货单 */
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable("id") String id) {
        return factoryShipmentOrchestrator.deleteShipment(id);
    }

    /** 发货单明细 */
    @GetMapping("/{id}/details")
    public Result<List<FactoryShipmentDetail>> getDetails(@PathVariable("id") String id) {
        return Result.success(factoryShipmentDetailService.listByShipmentId(id));
    }

    /** 订单发货汇总（颜色×尺码） */
    @GetMapping("/order-detail-sum/{orderId}")
    public Result<List<Map<String, Object>>> getOrderDetailSum(@PathVariable("orderId") String orderId) {
        return Result.success(factoryShipmentOrchestrator.getOrderShipmentDetailSum(orderId));
    }
}
