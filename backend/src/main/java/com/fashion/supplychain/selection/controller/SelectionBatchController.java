package com.fashion.supplychain.selection.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.selection.dto.SelectionBatchRequest;
import com.fashion.supplychain.selection.entity.SelectionBatch;
import com.fashion.supplychain.selection.orchestration.SelectionBatchOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 选品批次 Controller
 * — 批次管理与状态流转
 */
@RestController
@RequestMapping("/api/selection/batch")
@PreAuthorize("isAuthenticated()")
public class SelectionBatchController {

    @Autowired
    private SelectionBatchOrchestrator batchOrchestrator;

    /** 批次分页列表 */
    @PostMapping("/list")
    public Result<IPage<SelectionBatch>> list(@RequestBody Map<String, Object> params) {
        int page = params.get("page") != null ? Integer.parseInt(params.get("page").toString()) : 1;
        int size = params.get("size") != null ? Integer.parseInt(params.get("size").toString()) : 10;
        Map<String, Object> filters = new HashMap<>(params);
        filters.remove("page");
        filters.remove("size");
        return Result.success(batchOrchestrator.listBatch(page, size, filters));
    }

    /** 创建批次 */
    @PostMapping
    public Result<SelectionBatch> create(@RequestBody SelectionBatchRequest req) {
        if (req.getBatchName() == null || req.getBatchName().isEmpty()) {
            return Result.fail("批次名称不能为空");
        }
        return Result.success(batchOrchestrator.createBatch(req));
    }

    /** @deprecated 使用 POST / 替代 */
    @Deprecated // 计划于 2026-08-10 移除，请使用新端点替代
    @PostMapping("/save")
    public Result<SelectionBatch> save(@RequestBody SelectionBatchRequest req) {
        if (req.getBatchName() == null || req.getBatchName().isEmpty()) {
            return Result.fail("批次名称不能为空");
        }
        return Result.success(batchOrchestrator.createBatch(req));
    }

    /** 更新批次 */
    @PostMapping("/update/{id}")
    public Result<SelectionBatch> update(@PathVariable Long id, @RequestBody SelectionBatchRequest req) {
        return Result.success(batchOrchestrator.updateBatch(id, req));
    }

    /** 状态流转：submit / approve / close / reopen */
    @PostMapping("/{id}/stage-action")
    public Result<SelectionBatch> stageAction(@PathVariable Long id, @RequestParam String action) {
        return Result.success(batchOrchestrator.stageAction(id, action));
    }

    /** 删除批次（软删除） */
    @PostMapping("/delete/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        batchOrchestrator.deleteBatch(id);
        return Result.success(null);
    }
}
