package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping({ "/api/production/purchase", "/api/production/material" })
public class MaterialPurchaseController {

    @Autowired
    private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;

    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<MaterialPurchase> page = materialPurchaseOrchestrator.list(params);
        return Result.success(page);
    }

    @GetMapping("/{id}")
    public Result<MaterialPurchase> getById(@PathVariable String id) {
        return Result.success(materialPurchaseOrchestrator.getById(id));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody MaterialPurchase materialPurchase) {
        return Result.success(materialPurchaseOrchestrator.save(materialPurchase));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody MaterialPurchase materialPurchase) {
        return Result.success(materialPurchaseOrchestrator.update(materialPurchase));
    }

    @PostMapping("/batch")
    public Result<Boolean> batch(@RequestBody List<MaterialPurchase> purchases) {
        return Result.success(materialPurchaseOrchestrator.batch(purchases));
    }

    @PostMapping("/update-arrived-quantity")
    public Result<Boolean> updateArrivedQuantity(@RequestBody Map<String, Object> params) {
        return Result.success(materialPurchaseOrchestrator.updateArrivedQuantity(params));
    }

    @GetMapping("/demand/preview")
    public Result<?> previewDemand(@RequestParam String orderId) {
        return Result.success(materialPurchaseOrchestrator.previewDemand(orderId));
    }

    @PostMapping("/demand/generate")
    public Result<?> generateDemand(@RequestBody Map<String, Object> params) {
        return Result.success(materialPurchaseOrchestrator.generateDemand(params));
    }

    @PostMapping("/receive")
    public Result<?> receive(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.receive(body));
    }

    @PostMapping({ "/return-confirm", "/returnConfirm" })
    public Result<?> returnConfirm(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.returnConfirm(body));
    }

    @PostMapping({ "/return-confirm/reset", "/returnConfirm/reset" })
    public Result<?> resetReturnConfirm(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.resetReturnConfirm(body));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(materialPurchaseOrchestrator.delete(id));
    }

    /**
     * 通过扫码获取关联的采购单列表
     * @param params 包含 scanCode 和 orderNo
     * @return 采购单列表
     */
    @GetMapping("/by-scan-code")
    public Result<List<MaterialPurchase>> getByScanCode(@RequestParam Map<String, Object> params) {
        return Result.success(materialPurchaseOrchestrator.getByScanCode(params));
    }

    /**
     * 获取当前用户的采购任务
     * @return 采购任务列表
     */
    @GetMapping("/my-tasks")
    public Result<List<MaterialPurchase>> getMyTasks() {
        return Result.success(materialPurchaseOrchestrator.getMyTasks());
    }

    /**
     * 快速编辑物料采购（备注和预计出货日期）
     */
    @PutMapping("/quick-edit")
    public Result<?> quickEdit(@RequestBody Map<String, Object> payload) {
        String id = (String) payload.get("id");
        String remark = (String) payload.get("remark");
        String expectedShipDate = (String) payload.get("expectedShipDate");

        MaterialPurchase purchase = new MaterialPurchase();
        purchase.setId(id);
        purchase.setRemark(remark);
        if (expectedShipDate != null && !expectedShipDate.isEmpty()) {
            purchase.setExpectedShipDate(java.time.LocalDate.parse(expectedShipDate));
        }

        materialPurchaseOrchestrator.update(purchase);
        return Result.success();
    }
}
