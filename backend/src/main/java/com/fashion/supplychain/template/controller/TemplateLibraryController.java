package com.fashion.supplychain.template.controller;

import com.fashion.supplychain.common.Result;
import java.util.Map;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/template-library")
public class TemplateLibraryController {

    @Autowired
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;

    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        return Result.success(templateLibraryOrchestrator.list(params));
    }

    @GetMapping("/type/{templateType}")
    public Result<?> listByType(@PathVariable String templateType) {
        return Result.success(templateLibraryOrchestrator.listByType(templateType));
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

    @PostMapping
    public Result<?> create(@RequestBody TemplateLibrary tpl) {
        return Result.success(templateLibraryOrchestrator.create(tpl));
    }

    @PostMapping("/save")
    public Result<?> save(@RequestBody TemplateLibrary tpl) {
        return Result.success(templateLibraryOrchestrator.save(tpl));
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

    @DeleteMapping("/{id}")
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
}
