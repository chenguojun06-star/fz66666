package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.PrintTemplate;
import com.fashion.supplychain.system.orchestration.PrintTemplateOrchestrator;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system/print-template")
@PreAuthorize("isAuthenticated()")
public class PrintTemplateController {

    @Autowired
    private PrintTemplateOrchestrator printTemplateOrchestrator;

    @GetMapping("/list")
    public Result<List<PrintTemplate>> list(@RequestParam(required = false) String templateType) {
        return Result.success(printTemplateOrchestrator.list(templateType));
    }

    @PostMapping
    public Result<PrintTemplate> save(@RequestBody PrintTemplate template) {
        try {
            return Result.success(printTemplateOrchestrator.save(template));
        } catch (SecurityException | IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        try {
            printTemplateOrchestrator.delete(id);
            return Result.success(null);
        } catch (SecurityException | IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    @PutMapping("/{id}/set-default")
    public Result<Void> setDefault(@PathVariable Long id) {
        try {
            printTemplateOrchestrator.setDefault(id);
            return Result.success(null);
        } catch (SecurityException | IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }
}
