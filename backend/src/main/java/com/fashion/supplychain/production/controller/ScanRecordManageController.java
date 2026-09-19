package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.orchestration.ScanRecordManageOrchestrator;
import com.fashion.supplychain.production.orchestration.ScanRecordManageOrchestrator.ScanRecordManageQuery;
import com.fashion.supplychain.system.entity.OperationLog;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 录入记录管理（D-473 数据录入管理页后端）。
 * 定位：扫码/录入记录的统一查询与修正——数据录错时直接改/撤回，统计由记录实时推导自然回流。
 * 权限：仅主管及以上（工厂账号无权）。
 */
@RestController
@RequestMapping("/api/production/scan-records/manage")
@PreAuthorize("isAuthenticated()")
public class ScanRecordManageController {

    @Autowired
    private ScanRecordManageOrchestrator scanRecordManageOrchestrator;

    /** 分页查询录入记录（通用搜索 + 筛选） */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/list")
    public Result<Map<String, Object>> list(@RequestBody(required = false) ScanRecordManageQuery query) {
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            return Result.success(Map.of("records", List.of(), "total", 0));
        }
        return Result.success(scanRecordManageOrchestrator.list(query != null ? query : new ScanRecordManageQuery()));
    }

    /** 修改录入记录（数量/备注；金额按原单价自动重算） */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{id}/update")
    public Result<Map<String, Object>> update(@PathVariable String id, @RequestBody Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管及以上可修改录入记录");
        }
        Integer quantity = body.get("quantity") != null ? Integer.parseInt(String.valueOf(body.get("quantity"))) : null;
        Object remarkObj = body.get("remark");
        String remark = remarkObj != null ? String.valueOf(remarkObj) : null;
        return Result.success(scanRecordManageOrchestrator.update(id, quantity, remark));
    }

    /** 撤回录入记录（删除重做；统计随记录移除自动回流） */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{id}/delete")
    public Result<Map<String, Object>> delete(@PathVariable String id, @RequestBody(required = false) Map<String, String> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管及以上可撤回录入记录");
        }
        String reason = body != null && body.get("reason") != null ? body.get("reason") : null;
        return Result.success(scanRecordManageOrchestrator.delete(id, reason));
    }

    /** 单条记录的操作日志（修改/撤回留痕） */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/{id}/logs")
    public Result<List<OperationLog>> logs(@PathVariable String id) {
        return Result.success(scanRecordManageOrchestrator.logs(id));
    }
}
