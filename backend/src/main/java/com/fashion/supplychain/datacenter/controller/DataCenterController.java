package com.fashion.supplychain.datacenter.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.datacenter.orchestration.DataCenterOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * 数据中心统计控制器，用于展示核心经营指标汇总。
 */
@RestController
@RequestMapping("/api/data-center")
@PreAuthorize("isAuthenticated()")
public class DataCenterController {

    @Autowired
    private DataCenterOrchestrator dataCenterOrchestrator;

    /**
     * 获取数据中心概览统计。
     */
    @PreAuthorize("hasAuthority('MENU_DATA_CENTER_VIEW')")
    @GetMapping("/stats")
    public Result<?> stats() {
        return Result.success(dataCenterOrchestrator.stats());
    }

    @PreAuthorize("hasAuthority('MENU_DATA_CENTER_VIEW')")
    @GetMapping("/production-sheet")
    public Result<?> productionSheet(@RequestParam(required = false) String styleNo,
            @RequestParam(required = false) Long styleId) {
        return Result.success(dataCenterOrchestrator.productionSheet(styleNo, styleId));
    }
}
