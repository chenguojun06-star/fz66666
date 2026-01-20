package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import javax.validation.constraints.Max;
import javax.validation.constraints.Min;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.Map;

/**
 * 生产订单Controller
 */
@RestController
@RequestMapping("/api/production/order")
public class ProductionOrderController {

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    /**
     * 分页查询生产订单列表
     */
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<ProductionOrder> page = productionOrderOrchestrator.queryPage(params);
        return Result.success(page);
    }

    /**
     * 根据ID查询生产订单详情
     */
    @GetMapping("/detail/{id}")
    public Result<?> detail(@PathVariable String id) {
        ProductionOrder productionOrder = productionOrderOrchestrator.getDetailById(id);
        return Result.success(productionOrder);
    }

    @GetMapping("/flow/{id}")
    public Result<?> flow(@PathVariable String id) {
        return Result.success(productionOrderOrchestrator.getOrderFlow(id));
    }

    /**
     * 保存或更新生产订单
     */
    @PostMapping
    public Result<?> add(@RequestBody ProductionOrder productionOrder) {
        return upsert(productionOrder);
    }

    /**
     * 更新生产订单
     */
    @PutMapping
    public Result<?> update(@RequestBody ProductionOrder productionOrder) {
        return upsert(productionOrder);
    }

    /**
     * 保存或更新生产订单（兼容旧版本）
     */
    @PostMapping("/save")
    public Result<?> save(@RequestBody ProductionOrder productionOrder) {
        return upsert(productionOrder);
    }

    /**
     * 根据ID删除生产订单
     */
    @DeleteMapping("/delete/{id}")
    public Result<?> delete(@PathVariable String id) {
        productionOrderOrchestrator.deleteById(id);
        return Result.successMessage("删除成功");
    }

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

    @PostMapping("/complete")
    public Result<?> complete(@Valid @RequestBody CompleteProductionRequest body) {
        productionOrderOrchestrator.completeProduction(body.getId(), body.getTolerancePercent());
        ProductionOrder detail = productionOrderOrchestrator.getDetailById(body.getId());
        return Result.success(detail);
    }

    @PostMapping("/close")
    public Result<?> close(@Valid @RequestBody CloseOrderRequest body) {
        ProductionOrder updated = productionOrderOrchestrator.closeOrder(body.getId(), body.getSourceModule());
        return Result.success(updated);
    }

    @PostMapping("/progress-workflow/lock")
    public Result<?> lockProgressWorkflow(@Valid @RequestBody LockProgressWorkflowRequest body) {
        ProductionOrder updated = productionOrderOrchestrator.lockProgressWorkflow(body.getId(),
                body.getWorkflowJson());
        return Result.success(updated);
    }

    @PostMapping("/progress-workflow/rollback")
    public Result<?> rollbackProgressWorkflow(@Valid @RequestBody RollbackProgressWorkflowRequest body) {
        ProductionOrder updated = productionOrderOrchestrator.rollbackProgressWorkflow(body.getId());
        return Result.success(updated);
    }

    private Result<?> upsert(ProductionOrder productionOrder) {
        productionOrderOrchestrator.saveOrUpdateOrder(productionOrder);
        if (productionOrder != null && StringUtils.hasText(productionOrder.getId())) {
            ProductionOrder detail = productionOrderOrchestrator.getDetailById(productionOrder.getId());
            return Result.success(detail != null ? detail : productionOrder);
        }
        return Result.success(productionOrder);
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

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }
    }
}
