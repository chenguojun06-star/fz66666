package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.dto.MaterialBatchDetailDto;
import com.fashion.supplychain.production.dto.MaterialStockAlertDto;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.orchestration.MaterialStockOrchestrator;
import com.fashion.supplychain.production.service.MaterialStockService;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/api/production/material/stock")
@PreAuthorize("isAuthenticated()")
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

    /**
     * 查询物料批次明细（用于出库时按批次FIFO）
     *
     * @param materialCode 物料编码（必填）
     * @param color 颜色（可选）
     * @param size 尺码（可选）
     * @return 批次明细列表，按入库时间升序排列
     */
    @GetMapping("/batches")
    public Result<java.util.List<MaterialBatchDetailDto>> getBatchDetails(
            @RequestParam String materialCode,
            @RequestParam(required = false) String color,
            @RequestParam(required = false) String size) {
        return Result.success(materialStockService.getBatchDetails(materialCode, color, size));
    }

    /**
     * 手动出库（仓库页面直接扣减库存）
     */
    @PostMapping("/manual-outbound")
    public Result<Void> manualOutbound(@RequestBody java.util.Map<String, Object> body) {
        String stockId = body.get("stockId") != null ? String.valueOf(body.get("stockId")) : null;
        int quantity = body.get("quantity") != null ? Integer.parseInt(String.valueOf(body.get("quantity"))) : 0;
        if (!org.springframework.util.StringUtils.hasText(stockId)) {
            return Result.fail("stockId 不能为空");
        }
        if (quantity <= 0) {
            return Result.fail("出库数量必须大于0");
        }
        materialStockService.decreaseStockById(stockId, quantity);
        return Result.success(null);
    }

    /**
     * 更新安全库存
     */
    @PostMapping("/update-safety-stock")
    public Result<Boolean> updateSafetyStock(@RequestBody java.util.Map<String, Object> params) {
        String stockId = params.get("stockId") == null ? null : String.valueOf(params.get("stockId"));
        Integer safetyStock = params.get("safetyStock") == null ? null
                : Integer.valueOf(String.valueOf(params.get("safetyStock")));
        boolean ok = materialStockService.updateSafetyStock(stockId, safetyStock);
        if (!ok) {
            return Result.fail("更新安全库存失败");
        }
        return Result.success(true);
    }
}
