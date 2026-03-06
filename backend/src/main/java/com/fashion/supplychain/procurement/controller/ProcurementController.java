package com.fashion.supplychain.procurement.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.procurement.orchestration.ProcurementOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 供应商采购接口
 * 路由：/api/procurement
 * 供应商为系统级只读资源；采购单委托给已有的 MaterialPurchaseOrchestrator
 */
@Slf4j
@RestController
@RequestMapping("/api/procurement")
@PreAuthorize("isAuthenticated()")
public class ProcurementController {

    @Autowired
    private ProcurementOrchestrator procurementOrchestrator;

    /** 供应商列表（只读，supplier_type=MATERIAL） */
    @PostMapping("/suppliers/list")
    public Result<?> listSuppliers(@RequestBody Map<String, Object> params) {
        return Result.success(procurementOrchestrator.listSuppliers(params));
    }

    /** 采购单列表 */
    @PostMapping("/purchase-orders/list")
    public Result<?> listPurchaseOrders(@RequestBody Map<String, Object> params) {
        return Result.success(procurementOrchestrator.listPurchaseOrders(params));
    }

    /** 综合统计（供应商数量 + 采购单状态汇总） */
    @PostMapping("/stats")
    public Result<?> getStats(@RequestBody(required = false) Map<String, Object> params) {
        if (params == null) params = Map.of();
        return Result.success(procurementOrchestrator.getStats(params));
    }
}
