package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import javax.validation.constraints.Max;
import javax.validation.constraints.Min;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import java.util.Map;

/**
 * 生产订单进度Controller
 * 处理进度相关操作：更新进度、物料到位率、工作流锁定/回退、采购确认等
 */
@RestController
@RequestMapping("/api/production/order")
@PreAuthorize("isAuthenticated()")
public class ProductionOrderProgressController {

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    /**
     * 更新生产进度
     */
    @PostMapping("/update-progress")
    public Result<?> updateProgress(@Valid @RequestBody UpdateProgressRequest body) {
        productionOrderOrchestrator.updateProductionProgress(
                body.getId(),
                body.getProgress(),
                body.getRollbackRemark(),
                body.getRollbackToProcessName());
        return Result.successMessage("更新成功");
    }

    /**
     * 更新物料到位率
     */
    @PostMapping("/update-material-rate")
    public Result<?> updateMaterialRate(@Valid @RequestBody UpdateMaterialRateRequest body) {
        productionOrderOrchestrator.updateMaterialArrivalRate(body.getId(), body.getRate());
        return Result.successMessage("更新成功");
    }

    /**
     * 锁定进度工作流
     */
    @PostMapping("/progress-workflow/lock")
    public Result<?> lockProgressWorkflow(@Valid @RequestBody LockProgressWorkflowRequest body) {
        ProductionOrder updated = productionOrderOrchestrator.lockProgressWorkflow(body.getId(),
                body.getWorkflowJson());
        return Result.success(updated);
    }

    /**
     * 回退进度工作流
     */
    @PostMapping("/progress-workflow/rollback")
    public Result<?> rollbackProgressWorkflow(@Valid @RequestBody RollbackProgressWorkflowRequest body) {
        ProductionOrder updated = productionOrderOrchestrator.rollbackProgressWorkflow(body.getId(), body.getReason());
        return Result.success(updated);
    }

    /**
     * 手动确认采购完成（允许50%物料差异）
     * 适用场景：物料到货率在50%-99%之间，需要人工确认后才能进入下一阶段
     */
    @PostMapping("/confirm-procurement")
    public Result<?> confirmProcurement(@Valid @RequestBody ConfirmProcurementRequest body) {
        ProductionOrder updated = productionOrderOrchestrator.confirmProcurement(body.getId(), body.getRemark());
        return Result.success(updated);
    }

    /**
     * 重新计算订单进度（基于扫描记录）
     * 用于修复进度不同步的问题
     */
    @PostMapping("/recompute-progress")
    public Result<?> recomputeProgress(@RequestBody Map<String, Object> payload) {
        String id = (String) payload.get("id");
        String orderNo = (String) payload.get("orderNo");

        String targetId = id;
        if (!StringUtils.hasText(targetId) && StringUtils.hasText(orderNo)) {
            ProductionOrder order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getOrderNo, orderNo.trim())
                    .last("LIMIT 1")
                    .one();
            if (order != null) {
                targetId = order.getId();
            }
        }

        if (!StringUtils.hasText(targetId)) {
            return Result.fail("缺少id或orderNo参数");
        }

        ProductionOrder updated = productionOrderService.recomputeProgressFromRecords(targetId);
        if (updated == null) {
            return Result.fail("订单不存在或重计算失败");
        }
        return Result.success(updated);
    }

    public static class UpdateProgressRequest {
        @NotBlank(message = "id不能为空")
        private String id;

        @NotNull(message = "progress不能为空")
        @Min(value = 0, message = "progress最小为0")
        @Max(value = 100, message = "progress最大为100")
        private Integer progress;

        private String rollbackRemark;
        private String rollbackToProcessName;

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public Integer getProgress() {
            return progress;
        }

        public void setProgress(Integer progress) {
            this.progress = progress;
        }

        public String getRollbackRemark() {
            return rollbackRemark;
        }

        public void setRollbackRemark(String rollbackRemark) {
            this.rollbackRemark = rollbackRemark;
        }

        public String getRollbackToProcessName() {
            return rollbackToProcessName;
        }

        public void setRollbackToProcessName(String rollbackToProcessName) {
            this.rollbackToProcessName = rollbackToProcessName;
        }
    }

    public static class UpdateMaterialRateRequest {
        @NotBlank(message = "id不能为空")
        private String id;

        @NotNull(message = "rate不能为空")
        @Min(value = 0, message = "rate最小为0")
        @Max(value = 100, message = "rate最大为100")
        private Integer rate;

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public Integer getRate() {
            return rate;
        }

        public void setRate(Integer rate) {
            this.rate = rate;
        }
    }

    public static class LockProgressWorkflowRequest {
        @NotBlank(message = "id不能为空")
        private String id;

        @NotBlank(message = "workflowJson不能为空")
        private String workflowJson;

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getWorkflowJson() {
            return workflowJson;
        }

        public void setWorkflowJson(String workflowJson) {
            this.workflowJson = workflowJson;
        }
    }

    public static class RollbackProgressWorkflowRequest {
        @NotBlank(message = "id不能为空")
        private String id;

        @NotBlank(message = "reason不能为空")
        private String reason;

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getReason() {
            return reason;
        }

        public void setReason(String reason) {
            this.reason = reason;
        }
    }

    public static class ConfirmProcurementRequest {
        @NotBlank(message = "订单ID不能为空")
        private String id;

        @NotBlank(message = "确认备注不能为空")
        @Size(min = 10, message = "确认备注至少需要10个字符，请详细说明确认原因")
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
}
