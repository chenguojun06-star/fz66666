package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.orchestration.CuttingTaskOrchestrator;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/production/cutting-task")
public class CuttingTaskController {

    @Autowired
    private CuttingTaskOrchestrator cuttingTaskOrchestrator;

    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        return Result.success(cuttingTaskOrchestrator.queryPage(params));
    }

    @PostMapping("/receive")
    public Result<?> receive(@RequestBody Map<String, Object> body) {
        return Result.success(cuttingTaskOrchestrator.receive(body));
    }

    @PostMapping("/rollback")
    public Result<?> rollback(@RequestBody Map<String, Object> body) {
        return Result.success(cuttingTaskOrchestrator.rollback(body));
    }

    @PostMapping("/custom/create")
    public Result<?> createCustom(@RequestBody Map<String, Object> body) {
        return Result.success(cuttingTaskOrchestrator.createCustom(body));
    }
}
