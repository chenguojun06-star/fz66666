package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.orchestration.ChangeApprovalOrchestrator;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 变更审批中心接口
 * 前缀: /api/system/approval
 */
@RestController
@RequestMapping("/api/system/approval")
@PreAuthorize("isAuthenticated()")
public class ChangeApprovalController {

    @Autowired
    private ChangeApprovalOrchestrator changeApprovalOrchestrator;

    /** 待我审批的申请列表 */
    @GetMapping("/pending")
    public Result<?> listPending(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return Result.success(changeApprovalOrchestrator.listPendingForMe(page, size));
    }

    /** 我提交的申请列表 */
    @GetMapping("/my")
    public Result<?> listMyRequests(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return Result.success(changeApprovalOrchestrator.listMyRequests(page, size));
    }

    /** 待审批数量（用于TopBar红点） */
    @GetMapping("/pending-count")
    public Result<?> pendingCount() {
        return Result.success(changeApprovalOrchestrator.pendingCountForMe());
    }

    /** 审批通过 */
    @PostMapping("/{id}/approve")
    public Result<?> approve(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
        String remark = body != null ? (String) body.get("remark") : null;
        return Result.success(changeApprovalOrchestrator.approve(id, remark));
    }

    /** 驳回 */
    @PostMapping("/{id}/reject")
    public Result<?> reject(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
        String reason = body != null ? (String) body.get("reason") : null;
        changeApprovalOrchestrator.reject(id, reason);
        return Result.successMessage("已驳回");
    }

    /** 申请人撤销自己的申请 */
    @PostMapping("/{id}/cancel")
    public Result<?> cancel(@PathVariable String id) {
        changeApprovalOrchestrator.cancel(id);
        return Result.successMessage("已撤销申请");
    }
}
