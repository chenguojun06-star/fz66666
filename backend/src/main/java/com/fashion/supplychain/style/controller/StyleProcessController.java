package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.orchestration.StyleProcessOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/style/process")
@PreAuthorize("isAuthenticated()")
public class StyleProcessController {

    @Autowired
    private StyleProcessOrchestrator styleProcessOrchestrator;

    @GetMapping("/list")
    @PreAuthorize("hasAuthority('STYLE_VIEW')")
    public Result<List<StyleProcess>> listByStyleId(@RequestParam Long styleId) {
        return Result.success(styleProcessOrchestrator.listByStyleId(styleId));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<Boolean> save(@RequestBody StyleProcess styleProcess) {
        return Result.success(styleProcessOrchestrator.save(styleProcess));
    }

    @PutMapping
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<Boolean> update(@RequestBody StyleProcess styleProcess) {
        return Result.success(styleProcessOrchestrator.update(styleProcess));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(styleProcessOrchestrator.delete(id));
    }
}
