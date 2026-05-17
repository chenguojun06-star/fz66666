package com.fashion.supplychain.dashboard.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.orchestration.SysNoticeOrchestrator;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
@PreAuthorize("isAuthenticated()")
public class MenuBadgeCountController {

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialPickingService materialPickingService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private SysNoticeOrchestrator sysNoticeOrchestrator;

    @GetMapping("/menu-badge-counts")
    public Result<Map<String, Long>> getMenuBadgeCounts() {
        Long tenantId = UserContext.tenantId();
        Map<String, Long> counts = new HashMap<>();

        counts.put("/warehouse/material", materialStockService.lambdaQuery()
                .eq(MaterialStock::getTenantId, tenantId)
                .eq(MaterialStock::getDeleteFlag, 0)
                .apply("quantity < safety_stock")
                .count());

        counts.put("/production/material", materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getTenantId, tenantId)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(MaterialPurchase::getStatus, "pending")
                .count());

        counts.put("/warehouse/material-pickup", materialPickingService.lambdaQuery()
                .eq(MaterialPicking::getTenantId, tenantId)
                .eq(MaterialPicking::getDeleteFlag, 0)
                .eq(MaterialPicking::getStatus, "pending")
                .count());

        counts.put("/production/notice", sysNoticeOrchestrator.getUnreadCount());

        return Result.success(counts);
    }
}