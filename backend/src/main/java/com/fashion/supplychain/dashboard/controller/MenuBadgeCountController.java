package com.fashion.supplychain.dashboard.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import java.util.HashMap;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 菜单红点计数控制器
 * <p>
 * 返回各业务菜单的待处理数量，用于侧边栏红点显示。
 * 红点语义必须与实际业务状态一致，避免乱显示。
 * <p>
 * 当前覆盖的菜单路径（与前端 routeConfig menuConfig 严格对齐）：
 * <ul>
 *   <li>/production/material — 物料采购：待采购单数（status=pending，等采购员下单）</li>
 *   <li>/warehouse/material — 物料出入库：待出库领料单数 + 库存预警数（仓库需处理的事项）</li>
 * </ul>
 * 注意：/production/picking 不在侧边栏 menuConfig 中，其红点已合并到 /warehouse/material。
 */
@Slf4j
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

    @GetMapping("/menu-badge-counts")
    public Result<Map<String, Long>> getMenuBadgeCounts() {
        Long tenantId = UserContext.tenantId();
        Map<String, Long> counts = new HashMap<>();

        // 物料采购：待采购单数（status=pending，等采购员下单）
        counts.put("/production/material", safeCount(() -> materialPurchaseService.count(
                new LambdaQueryWrapper<MaterialPurchase>()
                        .eq(MaterialPurchase::getTenantId, tenantId)
                        .eq(MaterialPurchase::getDeleteFlag, 0)
                        .eq(MaterialPurchase::getStatus, "pending"))));

        // 物料出入库：待出库领料单数 + 库存预警数（仓库需处理的事项总和）
        // 该菜单有两个 Tab：库存总览（库存预警）+ 领取记录（待出库），红点合并两者
        long pendingPickupCount = safeCount(() -> materialPickingService.count(
                new LambdaQueryWrapper<MaterialPicking>()
                        .eq(MaterialPicking::getTenantId, tenantId)
                        .eq(MaterialPicking::getDeleteFlag, 0)
                        .eq(MaterialPicking::getStatus, "pending")));
        long lowStockCount = safeCount(() -> materialStockService.count(
                new LambdaQueryWrapper<MaterialStock>()
                        .eq(MaterialStock::getTenantId, tenantId)
                        .eq(MaterialStock::getDeleteFlag, 0)
                        .apply("quantity < safety_stock")));
        counts.put("/warehouse/material", pendingPickupCount + lowStockCount);

        return Result.success(counts);
    }

    /** 安全计数：单表统计失败时返回 0，避免影响其他菜单红点 */
    private long safeCount(java.util.function.Supplier<Long> supplier) {
        try {
            Long result = supplier.get();
            return result != null ? result : 0L;
        } catch (Exception e) {
            log.warn("[菜单红点] 统计失败: {}", e.getMessage());
            return 0L;
        }
    }
}
