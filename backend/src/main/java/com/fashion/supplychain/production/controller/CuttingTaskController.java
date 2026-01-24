package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.orchestration.CuttingTaskOrchestrator;
import com.fashion.supplychain.production.service.CuttingTaskService;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/production/cutting-task")
public class CuttingTaskController {

    @Autowired
    private CuttingTaskOrchestrator cuttingTaskOrchestrator;

    @Autowired
    private CuttingTaskService cuttingTaskService;

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

    @PutMapping("/quick-edit")
    public Result<?> quickEdit(@RequestBody Map<String, Object> payload) {
        String id = payload.get("id") != null ? String.valueOf(payload.get("id")) : null;
        if (id == null || id.trim().isEmpty()) {
            return Result.fail("缺少id参数");
        }

        com.fashion.supplychain.production.entity.CuttingTask task = cuttingTaskService.getById(id);
        if (task == null) {
            return Result.fail("裁剪任务不存在");
        }

        if (payload.containsKey("remarks")) {
            task.setRemarks(String.valueOf(payload.get("remarks")));
        }

        if (payload.containsKey("expectedShipDate")) {
            Object val = payload.get("expectedShipDate");
            if (val != null && !String.valueOf(val).trim().isEmpty()) {
                task.setExpectedShipDate(java.time.LocalDate.parse(String.valueOf(val)));
            } else {
                task.setExpectedShipDate(null);
            }
        }

        boolean success = cuttingTaskService.updateById(task);
        return success ? Result.success("更新成功") : Result.fail("更新失败");
    }
}
