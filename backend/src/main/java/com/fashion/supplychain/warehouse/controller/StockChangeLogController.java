package com.fashion.supplychain.warehouse.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.warehouse.orchestration.StockChangeLogOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/warehouse/change-log")
@RequiredArgsConstructor
public class StockChangeLogController {

    private final StockChangeLogOrchestrator changeLogOrchestrator;

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/list")
    public Result<?> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String changeType,
            @RequestParam(required = false) String stockType,
            @RequestParam(required = false) String bizType,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String keyword) {
        return changeLogOrchestrator.list(page, pageSize, changeType, stockType, bizType, startDate, endDate, keyword);
    }
}
