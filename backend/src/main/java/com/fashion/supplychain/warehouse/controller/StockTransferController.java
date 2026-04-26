package com.fashion.supplychain.warehouse.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.warehouse.entity.StockTransfer;
import com.fashion.supplychain.warehouse.orchestration.StockTransferOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/warehouse/transfer")
@RequiredArgsConstructor
public class StockTransferController {

    private final StockTransferOrchestrator transferOrchestrator;

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/list")
    public Result<?> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String transferType,
            @RequestParam(required = false) String keyword) {
        return transferOrchestrator.list(page, pageSize, status, transferType, keyword);
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/create")
    public Result<StockTransfer> create(@RequestBody StockTransfer transfer) {
        return transferOrchestrator.create(transfer);
    }

    @PreAuthorize("isAuthenticated()")
    @PutMapping("/approve/{id}")
    public Result<StockTransfer> approve(@PathVariable String id) {
        return transferOrchestrator.approve(id);
    }

    @PreAuthorize("isAuthenticated()")
    @PutMapping("/complete/{id}")
    public Result<StockTransfer> complete(@PathVariable String id) {
        return transferOrchestrator.complete(id);
    }

    @PreAuthorize("isAuthenticated()")
    @PutMapping("/cancel/{id}")
    public Result<Void> cancel(@PathVariable String id) {
        return transferOrchestrator.cancel(id);
    }
}
