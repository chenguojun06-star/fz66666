package com.fashion.supplychain.dashboard.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestrator;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialStockService;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Supplier;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 菜单红点计数 Orchestrator。
 *
 * <p>原逻辑位于 {@code MenuBadgeCountController}（D-636 下沉）。Controller 只应做
 * 「认证 / 参数校验 / 调 Orchestrator / 组装响应」，而本方法需要跨
 * MaterialPurchaseOrchestrator + MaterialPickingService + MaterialStockService
 * 三处取数并按语义合并，属典型跨服务编排，故上移到编排层。
 *
 * <p>红点语义必须与实际业务状态一致，避免乱显示。当前覆盖的菜单路径
 * （与前端 routeConfig menuConfig 严格对齐）：
 * <ul>
 *   <li>/production/material — 物料采购：待采购单数（status=pending，等采购员下单）</li>
 *   <li>/warehouse/material — 物料出入库：待出库领料单数 + 库存预警数（仓库需处理的事项）</li>
 * </ul>
 * 注意：/production/picking 不在侧边栏 menuConfig 中，其红点已合并到 /warehouse/material。
 */
@Service
@Slf4j
public class MenuBadgeCountOrchestrator {

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialPickingService materialPickingService;

    /** D-513：物料采购红点改为复用页面同款统计（getStatusStats），保证口径一致 */
    @Autowired
    private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;

    /**
     * 汇总各业务菜单的待处理数量，用于侧边栏红点显示。
     *
     * <p>租户上下文在编排层内部读取（{@link UserContext#tenantId()}），
     * 调用方无需传参，避免 Controller 承担业务取数职责。
     */
    public Map<String, Long> getMenuBadgeCounts() {
        Long tenantId = UserContext.tenantId();
        Map<String, Long> counts = new HashMap<>();

        // 物料采购：待采购单数
        // D-513 修复：原来这里直接 count(status='pending')，**没有排除无效订单**
        //（已关闭/已完成/已取消/已归档/已报废订单关联的采购记录），
        // 而物料采购页面的统计卡片走 MaterialPurchaseQueryHelper.getStatusStats()，
        // 里面调了 excludeInvalidOrdersFromStats() 做了排除。
        // 结果：红点 10 条 vs 页面卡片「待采购」1 条，用户看到数字对不上。
        // 现在改为复用同一套统计（getStatusStats），红点与页面卡片口径完全一致。
        counts.put("/production/material", safeCount(() -> {
            Map<String, Object> stats = materialPurchaseOrchestrator.getStatusStats(new HashMap<>());
            Object v = stats == null ? null : stats.get("pendingCount");
            return v instanceof Number ? ((Number) v).longValue() : 0L;
        }));

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
        // 分拆计数：页面内 Tab 角标需要按语义独立展示，不能用合并值
        // 领取记录 Tab 只关心待出库单数，库存总览 Tab 只关心库存预警数
        counts.put("/warehouse/material-pickup", pendingPickupCount);
        counts.put("/warehouse/material-lowstock", lowStockCount);

        return counts;
    }

    /** 安全计数：单表统计失败时返回 0，避免影响其他菜单红点 */
    private long safeCount(Supplier<Long> supplier) {
        try {
            Long result = supplier.get();
            return result != null ? result : 0L;
        } catch (Exception e) {
            log.warn("[菜单红点] 统计失败: {}", e.getMessage());
            return 0L;
        }
    }
}
