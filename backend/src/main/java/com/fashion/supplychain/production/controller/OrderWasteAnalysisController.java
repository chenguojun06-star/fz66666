package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.dto.OrderWasteAnalysisDTO;
import com.fashion.supplychain.production.dto.OrderWasteSummaryDTO;
import com.fashion.supplychain.production.orchestration.OrderWasteAnalysisOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RequestMapping("/api/production/waste-analysis")
@RestController
@Slf4j
@PreAuthorize("isAuthenticated()")
public class OrderWasteAnalysisController {

    @Autowired
    private OrderWasteAnalysisOrchestrator orchestrator;

    @GetMapping("/list")
    public Result<IPage<OrderWasteAnalysisDTO>> getWasteAnalysisPage(
            @RequestParam(defaultValue = "1") Long current,
            @RequestParam(defaultValue = "20") Long size,
            @RequestParam(required = false) String styleNo,
            @RequestParam(required = false) String orderNo,
            @RequestParam(required = false) String factoryName,
            @RequestParam(required = false) String factoryType,
            @RequestParam(required = false) String dateRange) {
        
        IPage<OrderWasteAnalysisDTO> page = orchestrator.getWasteAnalysisPage(
                current, size, styleNo, orderNo, factoryName, factoryType, dateRange);
        
        return Result.success(page);
    }

    @GetMapping("/summary")
    public Result<OrderWasteSummaryDTO> getWasteSummary(
            @RequestParam(required = false) String styleNo,
            @RequestParam(required = false) String orderNo,
            @RequestParam(required = false) String factoryName,
            @RequestParam(required = false) String factoryType,
            @RequestParam(required = false) String dateRange) {
        
        OrderWasteSummaryDTO summary = orchestrator.getWasteSummary(
                styleNo, orderNo, factoryName, factoryType, dateRange);
        
        return Result.success(summary);
    }
}