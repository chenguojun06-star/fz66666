package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.orchestration.StyleBomOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/style/bom")
public class StyleBomController {

    @Autowired
    private StyleBomOrchestrator styleBomOrchestrator;

    @GetMapping("/list")
    public Result<List<StyleBom>> listByStyleId(@RequestParam Long styleId) {
        return Result.success(styleBomOrchestrator.listByStyleId(styleId));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody StyleBom styleBom) {
        return Result.success(styleBomOrchestrator.save(styleBom));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody StyleBom styleBom) {
        return Result.success(styleBomOrchestrator.update(styleBom));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(styleBomOrchestrator.delete(id));
    }

    @PostMapping("/{styleId}/sync-material-database")
    public Result<Map<String, Object>> syncMaterialDatabase(@PathVariable Long styleId,
            @RequestParam(required = false, defaultValue = "0") String force) {
        boolean forceUpdateCompleted = force != null
                && ("1".equals(force.trim()) || "true".equalsIgnoreCase(force.trim()) || "yes".equalsIgnoreCase(force.trim()));
        return Result.success(styleBomOrchestrator.syncToMaterialDatabase(styleId, forceUpdateCompleted));
    }

    @PostMapping("/{styleId}/sync-material-database/async")
    public Result<Map<String, Object>> syncMaterialDatabaseAsync(@PathVariable Long styleId,
            @RequestParam(required = false, defaultValue = "0") String force) {
        boolean forceUpdateCompleted = force != null
                && ("1".equals(force.trim()) || "true".equalsIgnoreCase(force.trim()) || "yes".equalsIgnoreCase(force.trim()));
        return Result.success(styleBomOrchestrator.startSyncToMaterialDatabaseJob(styleId, forceUpdateCompleted));
    }

    @GetMapping("/sync-jobs/{jobId}")
    public Result<Map<String, Object>> getSyncJob(@PathVariable String jobId) {
        return Result.success(styleBomOrchestrator.getSyncJob(jobId));
    }
}
