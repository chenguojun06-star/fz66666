package com.fashion.supplychain.template.controller;

import com.fashion.supplychain.common.Result;
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
    @PreAuthorize("hasAuthority('STYLE_VIEW')")
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

    /**
     * @deprecated 已废弃，请使用 GET /list?templateType=xxx
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @GetMapping("/type/{templateType}")
    @PreAuthorize("hasAuthority('STYLE_VIEW')")
    public Result<?> listByType(@PathVariable String templateType) {
        return Result.success(templateLibraryOrchestrator.listByType(templateType));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('STYLE_VIEW')")
    public Result<?> detail(@PathVariable String id) {
        return Result.success(templateLibraryOrchestrator.detail(id));
    }

    @GetMapping("/process-unit-prices")
    @PreAuthorize("hasAuthority('STYLE_VIEW')")
    public Result<?> processUnitPrices(@RequestParam String styleNo) {
        return Result.success(templateLibraryOrchestrator.resolveProcessUnitPrices(styleNo));
    }

    @GetMapping("/progress-node-unit-prices")
    @PreAuthorize("hasAuthority('STYLE_VIEW')")
    public Result<?> progressNodeUnitPrices(@RequestParam String styleNo) {
        return Result.success(templateLibraryOrchestrator.resolveProgressNodeUnitPrices(styleNo));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> create(@RequestBody TemplateLibrary tpl) {
        return Result.success(templateLibraryOrchestrator.create(tpl));
    }

    /**
     * @deprecated 已废弃，请使用 POST / 或 PUT /
     * @since 2026-02-01 标记废弃，将在2026-05-01删除
     */
    @Deprecated
    @PostMapping("/save")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> save(@RequestBody TemplateLibrary tpl) {
        return Result.success(templateLibraryOrchestrator.save(tpl));
    }

    @PutMapping
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> update(@RequestBody TemplateLibrary tpl) {
        return Result.success(templateLibraryOrchestrator.update(tpl));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> updateById(@PathVariable String id, @RequestBody TemplateLibrary tpl) {
        tpl.setId(id);
        return Result.success(templateLibraryOrchestrator.update(tpl));
    }

    @PostMapping("/{id}/rollback")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> rollback(@PathVariable String id, @RequestBody Map<String, Object> body) {
        String reason = body == null ? null : String.valueOf(body.getOrDefault("reason", "")).trim();
        return Result.success(templateLibraryOrchestrator.rollback(id, reason));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('STYLE_DELETE')")
    public Result<?> delete(@PathVariable String id) {
        return Result.success(templateLibraryOrchestrator.delete(id));
    }

    @PostMapping("/create-from-style")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> createFromStyle(@RequestBody Map<String, Object> body) {
        return Result.success(templateLibraryOrchestrator.createFromStyle(body));
    }

    @PostMapping("/apply-to-style")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> applyToStyle(@RequestBody Map<String, Object> body) {
        return Result.success(templateLibraryOrchestrator.applyToStyle(body));
    }

    /**
     * 按款号批量同步工序进度单价到大货生产订单
     * 找出该款号下所有有效生产订单，自动刷新其工序单价
     */
    @PostMapping("/sync-process-prices")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> syncProcessPrices(@RequestBody Map<String, Object> body) {
        String styleNo = body == null ? null : (body.get("styleNo") == null ? null : String.valueOf(body.get("styleNo")).trim());
        return Result.success(templateLibraryOrchestrator.syncProcessUnitPricesByStyleNo(styleNo));
    }
}
