package com.fashion.supplychain.integration.ecommerce.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.integration.ecommerce.entity.*;
import com.fashion.supplychain.integration.ecommerce.orchestration.*;
import com.fashion.supplychain.integration.ecommerce.service.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/ec/stock")
@PreAuthorize("isAuthenticated()")
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class EcStockController {

    @Autowired private EcUniversalStockService universalStockService;
    @Autowired private EcStockAlertService stockAlertService;
    @Autowired private EcPurchaseSuggestionService purchaseSuggestionService;
    @Autowired private EcWarehouseAllocationService allocationService;
    @Autowired private EcOrderSplitService orderSplitService;
    @Autowired private EcStockOrchestrator stockOrchestrator;
    @Autowired private EcPurchaseSuggestionOrchestrator purchaseSuggestionOrchestrator;

    @PostMapping("/sync")
    public Result<Void> syncAllStock() {
        Long tenantId = UserContext.tenantId();
        stockOrchestrator.syncAllStock(tenantId);
        return Result.success();
    }

    @PostMapping("/sync/{skuId}")
    public Result<Void> syncSkuStock(@PathVariable Long skuId) {
        Long tenantId = UserContext.tenantId();
        stockOrchestrator.syncSkuStock(tenantId, null, skuId);
        return Result.success();
    }

    @GetMapping("/list")
    public Result<List<EcUniversalStock>> listStock() {
        Long tenantId = UserContext.tenantId();
        return Result.success(universalStockService.listByTenant(tenantId));
    }

    @GetMapping("/low-stock")
    public Result<List<EcUniversalStock>> listLowStock() {
        Long tenantId = UserContext.tenantId();
        return Result.success(universalStockService.listLowStock(tenantId));
    }

    @GetMapping("/alerts")
    public Result<List<EcStockAlert>> listAlerts(@RequestParam(defaultValue = "false") boolean unresolvedOnly) {
        Long tenantId = UserContext.tenantId();
        if (unresolvedOnly) {
            return Result.success(stockAlertService.listUnresolved(tenantId));
        }
        return Result.success(stockAlertService.listByTenant(tenantId));
    }

    @PostMapping("/alerts/{alertId}/resolve")
    public Result<Void> resolveAlert(@PathVariable Long alertId) {
        Long tenantId = UserContext.tenantId();
        purchaseSuggestionOrchestrator.resolveAlertWithSuggestion(tenantId, alertId);
        return Result.success();
    }

    @GetMapping("/suggestions")
    public Result<List<EcPurchaseSuggestion>> listSuggestions(@RequestParam(defaultValue = "false") boolean pendingOnly) {
        Long tenantId = UserContext.tenantId();
        if (pendingOnly) {
            return Result.success(purchaseSuggestionService.listPending(tenantId));
        }
        return Result.success(purchaseSuggestionService.listByTenant(tenantId));
    }

    @PostMapping("/suggestions/generate")
    public Result<Void> generateSuggestions() {
        Long tenantId = UserContext.tenantId();
        stockOrchestrator.generatePurchaseSuggestions(tenantId);
        return Result.success();
    }

    @PostMapping("/suggestions/{id}/approve")
    public Result<Void> approveSuggestion(@PathVariable Long id) {
        Long tenantId = UserContext.tenantId();
        purchaseSuggestionOrchestrator.approveAndConvert(tenantId, id);
        return Result.success();
    }

    @PostMapping("/suggestions/{id}/reject")
    public Result<Void> rejectSuggestion(@PathVariable Long id) {
        Long tenantId = UserContext.tenantId();
        purchaseSuggestionOrchestrator.rejectSuggestion(tenantId, id);
        return Result.success();
    }

    @GetMapping("/allocations")
    public Result<List<EcWarehouseAllocation>> listAllocations() {
        Long tenantId = UserContext.tenantId();
        return Result.success(allocationService.listByTenant(tenantId));
    }

    @GetMapping("/splits")
    public Result<List<EcOrderSplit>> listSplits() {
        Long tenantId = UserContext.tenantId();
        return Result.success(orderSplitService.listByTenant(tenantId));
    }

    @PutMapping("/safe-stock")
    public Result<Void> updateSafeStock(@RequestBody Map<String, Object> body) {
        Long tenantId = UserContext.tenantId();
        Long skuId = Long.valueOf(body.get("skuId").toString());
        Integer safeStock = Integer.valueOf(body.get("safeStock").toString());
        stockOrchestrator.updateSafeStock(tenantId, skuId, safeStock);
        return Result.success();
    }
}
