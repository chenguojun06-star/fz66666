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

/**
 * 外发工厂收发货 Controller。
 * <p>
 * 职责边界：
 * <ul>
 *   <li>发货 — 外发工厂操作，创建发货单</li>
 *   <li>收货 — 本厂确认到货数量（仅物流确认，不做质检）</li>
 *   <li>质检/次品/返修/入库 — 由质检入库页面(/production/warehousing)负责</li>
 * </ul>
 * </p>
 */
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

    /** 本厂收货确认 — 仅确认到货数量，不做质检 */
    @PostMapping("/{id}/receive")
    public Result<FactoryShipment> receive(@PathVariable("id") String id,
                                           @RequestBody Map<String, Object> params) {
        Integer receivedQuantity = params.get("receivedQuantity") instanceof Number
                ? ((Number) params.get("receivedQuantity")).intValue() : null;
        return factoryShipmentOrchestrator.receive(id, receivedQuantity);
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

    /** 按订单查发货单（无分页） */
    @PostMapping("/list-by-order")
    public Result<?> listByOrderPost(@RequestBody Map<String, String> params) {
        String orderId = params != null ? params.get("orderId") : null;
        if (orderId == null || orderId.isBlank()) {
            return Result.fail("orderId不能为空");
        }
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

    /** @deprecated 使用 POST /list-by-order 替代 */
    @Deprecated
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
