package com.fashion.supplychain.template.controller;

import com.fashion.supplychain.common.Result;
import java.util.List;
import java.util.Map;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/template-library")
@PreAuthorize("isAuthenticated()")
public class TemplateLibraryController {

    @Autowired
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;

    /**
     * 【新版统一查询】查询模板库
     * 支持参数：
     * - templateType: 按类型查询
     * - 其他筛选参数
     *
     * @since 2026-02-01 优化版本
     */
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        // 智能路由：按类型查询（仅当templateType非空时）
        if (params.containsKey("templateType")) {
            String templateType = String.valueOf(params.get("templateType")).trim();
            // 当templateType为空字符串时，走分页查询路径
            if (templateType.isEmpty()) {
                params.remove("templateType"); // 移除空值，让分页查询正常工作
            } else {
                return Result.success(templateLibraryOrchestrator.listByType(templateType));
            }
        }

        return Result.success(templateLibraryOrchestrator.list(params));
    }

    @GetMapping("/{id}")
    public Result<?> detail(@PathVariable String id) {
        return Result.success(templateLibraryOrchestrator.detail(id));
    }

    @GetMapping("/process-unit-prices")
    public Result<?> processUnitPrices(@RequestParam String styleNo) {
        return Result.success(templateLibraryOrchestrator.resolveProcessUnitPrices(styleNo));
    }

    @GetMapping("/progress-node-unit-prices")
    public Result<?> progressNodeUnitPrices(@RequestParam String styleNo) {
        return Result.success(templateLibraryOrchestrator.resolveProgressNodeUnitPrices(styleNo));
    }

    @GetMapping("/process-price-template")
    public Result<?> processPriceTemplate(@RequestParam(required = false) String styleNo) {
        return Result.success(templateLibraryOrchestrator.getProcessPriceTemplate(styleNo));
    }

    @GetMapping("/process-price-style-options")
    public Result<?> processPriceStyleOptions(@RequestParam(required = false) String keyword) {
        return Result.success(templateLibraryOrchestrator.listProcessPriceStyleOptions(keyword));
    }

    @PostMapping("/process-price-template")
    public Result<?> saveProcessPriceTemplate(@RequestBody Map<String, Object> body) {
        return Result.success(templateLibraryOrchestrator.saveProcessPriceTemplate(body));
    }

    @PostMapping
    public Result<?> create(@RequestBody TemplateLibrary tpl) {
        return Result.success(templateLibraryOrchestrator.create(tpl));
    }

    @PutMapping
    public Result<?> update(@RequestBody TemplateLibrary tpl) {
        return Result.success(templateLibraryOrchestrator.update(tpl));
    }

    @PutMapping("/{id}")
    public Result<?> updateById(@PathVariable String id, @RequestBody TemplateLibrary tpl) {
        tpl.setId(id);
        return Result.success(templateLibraryOrchestrator.update(tpl));
    }

    @PostMapping("/{id}/rollback")
    public Result<?> rollback(@PathVariable String id, @RequestBody Map<String, Object> body) {
        String reason = body == null ? null : String.valueOf(body.getOrDefault("reason", "")).trim();
        return Result.success(templateLibraryOrchestrator.rollback(id, reason));
    }

    @PostMapping("/{id}/lock")
    public Result<?> lock(@PathVariable String id) {
        return Result.success(templateLibraryOrchestrator.lockTemplate(id));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('STYLE_DELETE')")
    public Result<?> delete(@PathVariable String id) {
        return Result.success(templateLibraryOrchestrator.delete(id));
    }

    @PostMapping("/create-from-style")
    public Result<?> createFromStyle(@RequestBody Map<String, Object> body) {
        return Result.success(templateLibraryOrchestrator.createFromStyle(body));
    }

    @PostMapping("/apply-to-style")
    public Result<?> applyToStyle(@RequestBody Map<String, Object> body) {
        return Result.success(templateLibraryOrchestrator.applyToStyle(body));
    }

    /**
     * 查询可同步订单候选列表（按款号+当前工厂，推送前让用户选择）
     */
    @GetMapping("/sync-candidates")
    public Result<?> syncCandidates(@RequestParam(required = false) String styleNo) {
        return Result.success(templateLibraryOrchestrator.listSyncCandidateOrders(styleNo));
    }

    /**
     * 按款号同步工序进度单价到生产订单；支持传 orderIds 指定只同步部分订单
     */
    @PostMapping("/sync-process-prices")
    public Result<?> syncProcessPrices(@RequestBody Map<String, Object> body) {
        String styleNo = body == null ? null : (body.get("styleNo") == null ? null : String.valueOf(body.get("styleNo")).trim());
        List<String> orderIds = null;
        if (body != null && body.get("orderIds") instanceof java.util.Collection<?> rawList) {
            orderIds = new java.util.ArrayList<>();
            for (Object o : rawList) {
                if (o != null) orderIds.add(o.toString());
            }
        }
        return Result.success(templateLibraryOrchestrator.syncProcessUnitPricesByStyleNo(styleNo, orderIds));
    }
}
