package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;

/**
 * 生产订单操作Controller
 * 处理订单的各种操作：报废、完成、关闭、工序委派等
 */
@RestController
@RequestMapping("/api/production/order")
@PreAuthorize("isAuthenticated()")
public class ProductionOrderOperationController {

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    /**
     * 校验工厂账号是否有权操作该订单
     */
    private boolean assertFactoryOrderAccess(String orderId) {
        String ctxFactoryId = UserContext.factoryId();
        if (!StringUtils.hasText(ctxFactoryId)) {
            return true; // 非工厂账号，跳过
        }
        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            return false;
        }
        return ctxFactoryId.equals(order.getFactoryId());
    }

    /**
     * 报废订单
     */
    @PostMapping("/scrap")
    public Result<?> scrap(@Valid @RequestBody ScrapOrderRequest body) {
        if (!assertFactoryOrderAccess(body.getId())) {
            return Result.fail("无权操作：订单不属于当前工厂");
        }
        productionOrderOrchestrator.scrapOrder(body.getId(), body.getRemark());
        return Result.successMessage("报废成功");
    }

    /**
     * 完成生产
     */
    @PostMapping("/complete")
    public Result<?> complete(@Valid @RequestBody CompleteProductionRequest body) {
        if (!assertFactoryOrderAccess(body.getId())) {
            return Result.fail("无权操作：订单不属于当前工厂");
        }
        productionOrderOrchestrator.completeProduction(body.getId(), body.getTolerancePercent());
        ProductionOrder detail = productionOrderOrchestrator.getDetailById(body.getId());
        return Result.success(detail);
    }

    /**
     * 关闭订单
     * specialClose=true 时为特需关单（跳过90%入库率校验），但原因必填
     */
    @PostMapping("/close")
    public Result<?> close(@Valid @RequestBody CloseOrderRequest body) {
        if (!assertFactoryOrderAccess(body.getId())) {
            return Result.fail("无权操作：订单不属于当前工厂");
        }
        ProductionOrder updated = productionOrderOrchestrator.closeOrder(
            body.getId(), body.getSourceModule(), body.getRemark(),
            Boolean.TRUE.equals(body.getSpecialClose())
        );
        return Result.success(updated);
    }

    /**
     * 工序委派 - 将特定工序委派给工厂，并设置单价
     */
    @PostMapping("/delegate-process")
    public Result<?> delegateProcess(@Valid @RequestBody DelegateProcessRequest body) {
        if (!assertFactoryOrderAccess(body.getOrderId())) {
            return Result.fail("无权操作：订单不属于当前工厂");
        }
        try {
            productionOrderOrchestrator.delegateProcess(
                body.getOrderId(),
                body.getProcessNode(),
                body.getFactoryId(),
                body.getUnitPrice()
            );
            return Result.success("工序委派成功");
        } catch (Exception e) {
            return Result.fail("工序委派失败: " + e.getMessage());
        }
    }

    public static class ScrapOrderRequest {
        @NotBlank(message = "id不能为空")
        private String id;

        @NotBlank(message = "remark不能为空")
        private String remark;

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getRemark() {
            return remark;
        }

        public void setRemark(String remark) {
            this.remark = remark;
        }
    }

    public static class CompleteProductionRequest {
        @NotBlank(message = "id不能为空")
        private String id;

        private BigDecimal tolerancePercent;

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public BigDecimal getTolerancePercent() {
            return tolerancePercent;
        }

        public void setTolerancePercent(BigDecimal tolerancePercent) {
            this.tolerancePercent = tolerancePercent;
        }
    }

    public static class CloseOrderRequest {
        @NotBlank(message = "id不能为空")
        private String id;

        @NotBlank(message = "sourceModule不能为空")
        private String sourceModule;

        private String remark;

        private Boolean specialClose;

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getSourceModule() {
            return sourceModule;
        }

        public void setSourceModule(String sourceModule) {
            this.sourceModule = sourceModule;
        }

        public String getRemark() {
            return remark;
        }

        public void setRemark(String remark) {
            this.remark = remark;
        }

        public Boolean getSpecialClose() {
            return specialClose;
        }

        public void setSpecialClose(Boolean specialClose) {
            this.specialClose = specialClose;
        }
    }

    public static class DelegateProcessRequest {
        @NotBlank(message = "订单ID不能为空")
        private String orderId;

        @NotBlank(message = "工序节点不能为空")
        private String processNode;

        @NotBlank(message = "工厂ID不能为空")
        private String factoryId;

        private Double unitPrice;

        public String getOrderId() {
            return orderId;
        }

        public void setOrderId(String orderId) {
            this.orderId = orderId;
        }

        public String getProcessNode() {
            return processNode;
        }

        public void setProcessNode(String processNode) {
            this.processNode = processNode;
        }

        public String getFactoryId() {
            return factoryId;
        }

        public void setFactoryId(String factoryId) {
            this.factoryId = factoryId;
        }

        public Double getUnitPrice() {
            return unitPrice;
        }

        public void setUnitPrice(Double unitPrice) {
            this.unitPrice = unitPrice;
        }
    }
}
