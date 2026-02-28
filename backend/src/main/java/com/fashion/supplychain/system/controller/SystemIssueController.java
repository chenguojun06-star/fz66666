package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.dto.SystemIssueSummaryDTO;
import com.fashion.supplychain.system.orchestration.SystemIssueCollectorOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 系统问题收集 Controller（超管专用）
 * 实时查询数据库，暴露当前系统存在的异常/隐患，直观反馈给超级管理员
 */
@RestController
@RequestMapping("/api/system/issues")
@PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
public class SystemIssueController {

    @Autowired
    private SystemIssueCollectorOrchestrator systemIssueCollectorOrchestrator;

    /**
     * 获取当前系统问题汇总
     * 包含：扫码失败、菲号关联缺失、停滞订单、工序识别失败、重复扫码拦截等
     */
    @GetMapping("/collect")
    public Result<SystemIssueSummaryDTO> collect() {
        SystemIssueSummaryDTO summary = systemIssueCollectorOrchestrator.collect();
        return Result.success(summary);
    }
}
