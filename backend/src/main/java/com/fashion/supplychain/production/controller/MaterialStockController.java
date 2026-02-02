package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.dto.MaterialStockAlertDto;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.orchestration.MaterialStockOrchestrator;
import com.fashion.supplychain.production.service.MaterialStockService;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/production/material/stock")
public class MaterialStockController {

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialStockOrchestrator materialStockOrchestrator;

    @GetMapping("/list")
    public Result<IPage<MaterialStock>> getPage(@RequestParam Map<String, Object> params) {
        return Result.success(materialStockService.queryPage(params));
    }

    @GetMapping("/summary")
    public Result<java.util.List<MaterialStock>> getSummary(@RequestParam("materialIds") java.util.List<String> materialIds) {
        return Result.success(materialStockService.getStocksByMaterialIds(materialIds));
    }

    @GetMapping("/alerts")
    public Result<java.util.List<MaterialStockAlertDto>> getAlerts(@RequestParam Map<String, Object> params) {
        return Result.success(materialStockOrchestrator.listAlerts(params));
    }
}
