package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import lombok.extern.slf4j.Slf4j;

@RestController
@RequestMapping({ "/api/production/purchase", "/api/production/material" })
@Slf4j
public class MaterialPurchaseController {

    @Autowired
    private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;

    /**
     * 【新版统一查询】分页查询物料采购列表
     * 支持参数：
     * - scanCode: 扫码查询（需配合orderNo）
     * - myTasks: true表示查询当前用户的采购任务
     * - 其他筛选参数：orderId, styleNo, status等
     *
     * @since 2026-02-01 优化版本
     */
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        // 智能路由：扫码查询
        if (params.containsKey("scanCode")) {
            return Result.success(materialPurchaseOrchestrator.getByScanCode(params));
        }

        // 智能路由：我的任务
        if ("true".equals(String.valueOf(params.get("myTasks")))) {
            return Result.success(materialPurchaseOrchestrator.getMyTasks());
        }

        // 默认分页查询（含下单数量enrichment）
        return Result.success(materialPurchaseOrchestrator.listWithEnrichment(params));
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

    @PostMapping("/instruction")
    public Result<MaterialPurchase> createInstruction(@RequestBody Map<String, Object> params) {
        return Result.success(materialPurchaseOrchestrator.createInstruction(params));
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

    /**
     * 确认退货
     */
    @PostMapping("/return-confirm")
    public Result<?> returnConfirm(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.returnConfirm(body));
    }

    /**
     * @deprecated 已废弃，请使用 POST /return-confirm（统一命名风格）
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @PostMapping("/returnConfirm")
    public Result<?> returnConfirmLegacy(@RequestBody Map<String, Object> body) {
        return returnConfirm(body);
    }

    /**
     * 重置退货确认
     */
    @PostMapping("/return-confirm/reset")
    public Result<?> resetReturnConfirm(@RequestBody Map<String, Object> body) {
        return Result.success(materialPurchaseOrchestrator.resetReturnConfirm(body));
    }

    /**
     * @deprecated 已废弃，请使用 POST /return-confirm/reset（统一命名风格）
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @PostMapping("/returnConfirm/reset")
    public Result<?> resetReturnConfirmLegacy(@RequestBody Map<String, Object> body) {
        return resetReturnConfirm(body);
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(materialPurchaseOrchestrator.delete(id));
    }

    /**
     * @deprecated 已废弃，请使用 GET /list?scanCode=xxx&orderNo=xxx
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @GetMapping("/by-scan-code")
    public Result<List<MaterialPurchase>> getByScanCode(@RequestParam Map<String, Object> params) {
        return Result.success(materialPurchaseOrchestrator.getByScanCode(params));
    }

    /**
     * @deprecated 已废弃，请使用 GET /list?myTasks=true
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
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
