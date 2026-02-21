package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import java.util.Map;

/**
 * 生产订单节点Controller
 * 处理节点操作记录、工序状态查询等
 */
@RestController
@RequestMapping("/api/production/order")
@PreAuthorize("isAuthenticated()")
public class ProductionOrderNodeController {

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    /**
     * 获取订单的节点操作记录
     */
    @GetMapping("/node-operations/{id}")
    public Result<?> getNodeOperations(@PathVariable String id) {
        ProductionOrder order = productionOrderService.getById(id);
        if (order == null) {
            return Result.fail("订单不存在");
        }
        return Result.success(order.getNodeOperations());
    }

    /**
     * 获取订单的采购完成状态（用于工序明细显示）
     * 返回采购完成率、操作人、完成时间等信息
     */
    @GetMapping("/procurement-status/{orderId}")
    public Result<?> getProcurementStatus(@PathVariable String orderId) {
        Map<String, Object> status = productionOrderOrchestrator.getProcurementStatus(orderId);
        return Result.success(status);
    }

    /**
     * 获取订单的所有工序节点状态（裁剪、车缝、尾部、入库等）
     * 用于工序明细显示完成数量、剩余数量、操作人等信息
     */
    @GetMapping("/process-status/{orderId}")
    public Result<?> getAllProcessStatus(@PathVariable String orderId) {
        Map<String, Map<String, Object>> status = productionOrderOrchestrator.getAllProcessStatus(orderId);
        return Result.success(status);
    }

    /**
     * 保存节点操作记录（委派、指定、备注等）
     */
    @PostMapping("/node-operations")
    public Result<?> saveNodeOperations(@Valid @RequestBody SaveNodeOperationsRequest body) {
        ProductionOrder order = productionOrderService.getById(body.getId());
        if (order == null) {
            return Result.fail("订单不存在");
        }
        order.setNodeOperations(body.getNodeOperations());
        boolean success = productionOrderService.updateById(order);
        return success ? Result.success("保存成功") : Result.fail("保存失败");
    }

    public static class SaveNodeOperationsRequest {
        @NotBlank(message = "id不能为空")
        private String id;

        private String nodeOperations;

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getNodeOperations() {
            return nodeOperations;
        }

        public void setNodeOperations(String nodeOperations) {
            this.nodeOperations = nodeOperations;
        }
    }
}
