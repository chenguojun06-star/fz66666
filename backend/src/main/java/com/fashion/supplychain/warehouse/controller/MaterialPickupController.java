package com.fashion.supplychain.warehouse.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.warehouse.entity.MaterialPickupRecord;
import com.fashion.supplychain.warehouse.orchestration.MaterialPickupOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 面辅料领取记录 Controller
 * 支持审核流程（PENDING→APPROVED/REJECTED）与财务核算
 */
@RestController
@RequestMapping("/api/warehouse/material-pickup")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class MaterialPickupController {

    private final MaterialPickupOrchestrator pickupOrchestrator;

    /** 分页查询 */
    @PostMapping("/list")
    public Result<IPage<MaterialPickupRecord>> list(@RequestBody Map<String, Object> params) {
        return Result.success(pickupOrchestrator.listPage(params));
    }

    /** 新建领取记录 */
    @PostMapping
    public Result<MaterialPickupRecord> create(@RequestBody Map<String, Object> body) {
        return Result.success(pickupOrchestrator.create(body));
    }

    /** 审核（approve / reject） */
    @PostMapping("/{id}/audit")
    public Result<Void> audit(@PathVariable String id,
                              @RequestBody Map<String, Object> body) {
        pickupOrchestrator.audit(id, body);
        return Result.success(null);
    }

    /** 财务核算结算 */
    @PostMapping("/{id}/finance-settle")
    public Result<Void> financeSettle(@PathVariable String id,
                                      @RequestBody Map<String, Object> body) {
        pickupOrchestrator.financeSettle(id, body);
        return Result.success(null);
    }

    /** 作废领取记录（仅 PENDING 状态） */
    @PostMapping("/{id}/cancel")
    public Result<Void> cancel(@PathVariable String id) {
        pickupOrchestrator.cancel(id);
        return Result.success(null);
    }
}
