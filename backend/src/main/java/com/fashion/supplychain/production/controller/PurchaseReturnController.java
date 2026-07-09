package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.PurchaseReturn;
import com.fashion.supplychain.production.orchestration.PurchaseReturnOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 采购退货Controller
 * RESTful API端点
 * 与 SalesReturnController 保持一致：类级 isAuthenticated()，方法级不再细粒度鉴权
 */
@RestController
@RequestMapping("/api/production/purchase-return")
@PreAuthorize("isAuthenticated()")
public class PurchaseReturnController {

    @Autowired
    private PurchaseReturnOrchestrator purchaseReturnOrchestrator;

    /**
     * 创建采购退货单
     * @param params 退货参数
     * @return 退货单ID
     */
    @PostMapping
    public Result<Long> createReturn(@RequestBody Map<String, Object> params) {
        Long returnId = purchaseReturnOrchestrator.createReturn(params);
        return Result.success(returnId);
    }

    /**
     * 审核退货单
     * @param returnId 退货单ID
     * @param params approved(boolean), reason(String)
     */
    @PostMapping("/{returnId}/approve")
    public Result<Boolean> approveReturn(@PathVariable Long returnId, @RequestBody Map<String, Object> params) {
        Boolean approved = (Boolean) params.get("approved");
        String reason = (String) params.get("reason");
        if (approved == null) {
            throw new IllegalArgumentException("approved参数不能为空");
        }
        purchaseReturnOrchestrator.approveReturn(returnId, approved, reason);
        return Result.success(true);
    }

    /**
     * 完成退货（更新库存 + 应付账款）
     * @param returnId 退货单ID
     */
    @PostMapping("/{returnId}/complete")
    public Result<Boolean> completeReturn(@PathVariable Long returnId) {
        purchaseReturnOrchestrator.completeReturn(returnId);
        return Result.success(true);
    }

    /**
     * 查询退货单列表
     * @param params 筛选参数：originalPurchaseId, returnStatus
     */
    @GetMapping("/list")
    public Result<List<PurchaseReturn>> listReturns(@RequestParam Map<String, Object> params) {
        List<PurchaseReturn> returns = purchaseReturnOrchestrator.listReturns(params);
        return Result.success(returns);
    }

    /**
     * 查询退货单详情
     * @param returnId 退货单ID
     */
    @GetMapping("/{returnId}")
    public Result<Map<String, Object>> getReturnDetail(@PathVariable Long returnId) {
        Map<String, Object> detail = purchaseReturnOrchestrator.getReturnDetail(returnId);
        return Result.success(detail);
    }
}