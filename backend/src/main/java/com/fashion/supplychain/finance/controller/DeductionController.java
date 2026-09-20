package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.DeductionTypeConfig;
import com.fashion.supplychain.finance.service.DeductionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * D-474：扣款管理——扣款类型由管理员设定，录入的扣款推成账单进入收付款中心。
 */
@RestController
@RequestMapping("/api/finance/deduction")
public class DeductionController {

    @Autowired
    private DeductionService deductionService;

    /** 扣款类型列表 */
    @GetMapping("/types")
    public Result<List<DeductionTypeConfig>> listTypes() {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        return Result.success(deductionService.listTypes(tenantId));
    }

    /** 新增/更新扣款类型 */
    @PostMapping("/types/save")
    public Result<DeductionTypeConfig> saveType(@RequestBody DeductionTypeConfig t) {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        return Result.success(deductionService.saveType(t, tenantId));
    }

    /** 删除扣款类型 */
    @DeleteMapping("/types/{id}")
    public Result<Boolean> deleteType(@PathVariable String id) {
        return Result.success(deductionService.removeById(id));
    }

    /**
     * 录入一笔扣款（推成账单，金额记负数冲减应付）
     * 例：POST /api/finance/deduction/create?targetType=WORKER&targetId=lilb&targetName=李老板
     *      &typeCode=QUALITY&amount=100&month=2026-09&remark=次品3件
     */
    @PostMapping("/create")
    public Result<Map<String, Object>> create(
            @RequestParam String targetType,
            @RequestParam String targetId,
            @RequestParam String targetName,
            @RequestParam(required = false) String typeCode,
            @RequestParam(required = false) BigDecimal amount,
            @RequestParam(required = false) BigDecimal baseAmount,
            @RequestParam(required = false) String month,
            @RequestParam(required = false) String remark) {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        return Result.success(deductionService.createDeduction(
                tenantId, targetType, targetId, targetName, typeCode, amount, baseAmount, month, remark));
    }
}
