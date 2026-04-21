package com.fashion.supplychain.finance.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.EcSalesRevenue;
import com.fashion.supplychain.finance.orchestration.EcSalesRevenueOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 电商销售收入财务接口
 * <p>
 * 查询出库后自动生成的销售收入流水，并支持财务核账/入账操作。
 */
@RestController
@RequestMapping("/api/finance/ec-revenue")
@PreAuthorize("isAuthenticated()")
public class EcSalesRevenueController {

    @Autowired
    private EcSalesRevenueOrchestrator ecSalesRevenueOrchestrator;

    /**
     * 分页查询销售收入流水
     * POST /api/finance/ec-revenue/list
     * 参数：page, pageSize, status(pending/confirmed/reconciled), platform, keyword
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/list")
    public Result<IPage<EcSalesRevenue>> list(@RequestBody Map<String, Object> params) {
        return Result.success(ecSalesRevenueOrchestrator.list(params));
    }

    /**
     * 汇总统计（金额/单量/净收入）
     * POST /api/finance/ec-revenue/summary
     * 参数：platform, status
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/summary")
    public Result<Map<String, Object>> summary(@RequestBody Map<String, Object> params) {
        return Result.success(ecSalesRevenueOrchestrator.summary(params));
    }

    /**
     * 财务核账：pending → confirmed
     * POST /api/finance/ec-revenue/{id}/stage-action?action=confirm
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{id}/stage-action")
    public Result<Void> stageAction(
            @PathVariable Long id,
            @RequestParam String action,
            @RequestBody(required = false) Map<String, Object> body) {
        String remark = body != null ? (String) body.get("remark") : null;
        switch (action) {
            case "confirm" -> ecSalesRevenueOrchestrator.confirm(id, remark);
            case "reconcile" -> ecSalesRevenueOrchestrator.reconcile(id);
            default -> throw new IllegalArgumentException("不支持的操作: " + action);
        }
        return Result.success(null);
    }
}
