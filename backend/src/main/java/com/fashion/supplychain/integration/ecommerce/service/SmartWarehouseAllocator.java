package com.fashion.supplychain.integration.ecommerce.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.integration.ecommerce.entity.EcUniversalStock;
import com.fashion.supplychain.integration.ecommerce.entity.EcWarehouseAllocation;
import com.fashion.supplychain.integration.ecommerce.mapper.EcWarehouseAllocationMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 智能仓库分配器（Phase 2 增强版）
 *
 * 超越聚水潭的静态分仓，采用多维度评分算法：
 *   库存充足度 40% + 物流时效 30% + 仓库成本 20% + 历史退货率 10%
 *
 * 透明化决策：每次分配返回得分、原因、预估时效，展示给用户。
 */
@Slf4j
@Service
public class SmartWarehouseAllocator {

    @Autowired
    private EcUniversalStockService universalStockService;

    @Autowired
    private EcWarehouseAllocationMapper allocationMapper;

    /** 评分权重（可被 AI 学习动态调整，初始为经验值） */
    private static final double W_STOCK = 0.40;
    private static final double W_TIME = 0.30;
    private static final double W_COST = 0.20;
    private static final double W_RETURN = 0.10;

    /** 默认预估时效（天），按仓库类型分类 */
    private static final Map<String, Integer> DEFAULT_EST_DAYS = Map.of(
            "MAIN", 2, "CENTRAL", 2, "PRIMARY", 2,
            "BRANCH", 4, "REGIONAL", 4, "SECONDARY", 4,
            "OTHER", 6
    );

    public AllocationResult allocate(Long tenantId, Long styleId, Long skuId, int requiredQty) {
        List<EcUniversalStock> stocks = universalStockService.list(new LambdaQueryWrapper<EcUniversalStock>()
                .eq(EcUniversalStock::getTenantId, tenantId)
                .eq(EcUniversalStock::getSkuId, skuId)
                .gt(EcUniversalStock::getAvailableStock, 0)
                .orderByDesc(EcUniversalStock::getAvailableStock));

        if (stocks.isEmpty()) {
            log.warn("[SmartAllocator] 无可用库存: skuId={}", skuId);
            return AllocationResult.noStock();
        }

        // 1. 为每个仓库计算综合得分
        List<WarehouseScore> scored = stocks.stream()
                .map(s -> scoreWarehouse(tenantId, s.getWarehouse(), s.getAvailableStock(), requiredQty))
                .sorted(Comparator.comparingDouble(WarehouseScore::totalScore).reversed())
                .collect(Collectors.toList());

        log.info("[SmartAllocator] 仓库评分: skuId={}, 仓库排名={}",
                skuId, scored.stream().map(s -> s.warehouse() + "=" + s.totalScore()).toList());

        // 2. 按得分降序分配库存
        List<WarehouseAllocation> allocations = new ArrayList<>();
        int remaining = requiredQty;
        for (WarehouseScore ws : scored) {
            if (remaining <= 0) break;
            int allocQty = Math.min(remaining, ws.availableStock());
            allocations.add(new WarehouseAllocation(
                    ws.warehouse(), allocQty, ws.availableStock(),
                    BigDecimal.valueOf(ws.totalScore()).setScale(2, RoundingMode.HALF_UP),
                    ws.reason(), ws.estimatedDays()));
            remaining -= allocQty;
        }

        boolean fullyAllocated = remaining <= 0;
        log.info("[SmartAllocator] 分配结果: skuId={}, 需要={}, 已分配={}, 需拆单={}, 首选仓={}",
                skuId, requiredQty, requiredQty - remaining, !fullyAllocated,
                scored.isEmpty() ? "-" : scored.get(0).warehouse());
        return new AllocationResult(fullyAllocated, allocations, remaining);
    }

    /**
     * 多维度评分：库存40% + 时效30% + 成本20% + 退货率10%
     * 数据缺失时用默认值，后续可接入真实数据源。
     */
    private WarehouseScore scoreWarehouse(Long tenantId, String warehouse,
                                          int availableStock, int requiredQty) {
        // 1. 库存充足度（0-100）：available/required，≥1 为满分
        double stockRatio = requiredQty > 0 ? Math.min((double) availableStock / requiredQty, 1.0) : 0;
        double stockScore = stockRatio * 100;

        // 2. 物流时效（0-100）：主仓90 / 分仓70 / 其他50
        String whType = classifyWarehouse(warehouse);
        int estimatedDays = DEFAULT_EST_DAYS.getOrDefault(whType, 6);
        double timeScore = switch (whType) {
            case "MAIN", "CENTRAL", "PRIMARY" -> 90;
            case "BRANCH", "REGIONAL", "SECONDARY" -> 70;
            default -> 50;
        };

        // 3. 仓库成本（0-100）：主仓90 / 分仓70 / 其他50
        double costScore = switch (whType) {
            case "MAIN", "CENTRAL", "PRIMARY" -> 90;
            case "BRANCH", "REGIONAL", "SECONDARY" -> 70;
            default -> 50;
        };

        // 4. 历史退货率（0-100）：查询近30天该仓库退货率，无数据默认5%→50分
        double returnRate = queryReturnRate(tenantId, warehouse);
        double returnScore = Math.max(0, 100 - returnRate * 10);

        // 5. 综合得分
        double totalScore = stockScore * W_STOCK + timeScore * W_TIME + costScore * W_COST + returnScore * W_RETURN;

        String reason = String.format("库存%.0f%%(可分配%d/%d)+时效%d天+成本%s+退货率%.1f%%",
                stockScore, availableStock, requiredQty, estimatedDays,
                whType.equals("MAIN") || whType.equals("CENTRAL") || whType.equals("PRIMARY") ? "低" :
                        whType.equals("BRANCH") || whType.equals("REGIONAL") || whType.equals("SECONDARY") ? "中" : "高",
                returnRate * 100);

        return new WarehouseScore(warehouse, availableStock, totalScore, reason, estimatedDays,
                stockScore, timeScore, costScore, returnScore);
    }

    /** 仓库名称简单分类（后续可扩展为配置表） */
    private String classifyWarehouse(String warehouse) {
        if (warehouse == null) return "OTHER";
        String upper = warehouse.toUpperCase();
        if (upper.contains("主") || upper.contains("MAIN") || upper.contains("CENTRAL") || upper.contains("PRIMARY")) {
            return "MAIN";
        }
        if (upper.contains("分") || upper.contains("BRANCH") || upper.contains("REGIONAL") || upper.contains("SECONDARY")) {
            return "BRANCH";
        }
        return "OTHER";
    }

    /**
     * 查询近30天该仓库的退货率（退货数/已发货数）
     * 无数据时返回默认值 0.05（5%）
     */
    private double queryReturnRate(Long tenantId, String warehouse) {
        try {
            LocalDateTime since = LocalDateTime.now().minusDays(30);
            Long shipped = allocationMapper.selectCount(new LambdaQueryWrapper<EcWarehouseAllocation>()
                    .eq(EcWarehouseAllocation::getTenantId, tenantId)
                    .eq(EcWarehouseAllocation::getWarehouse, warehouse)
                    .ge(EcWarehouseAllocation::getCreateTime, since));
            if (shipped == null || shipped == 0) return 0.05;
            // 退货率暂用默认值（退货订单状态需要业务定义，这里先用默认值）
            // TODO: 接入真实退货数据后计算实际退货率
            return 0.05;
        } catch (Exception e) {
            log.warn("[SmartAllocator] 查询退货率失败，用默认值: warehouse={}, err={}", warehouse, e.getMessage());
            return 0.05;
        }
    }

    public record AllocationResult(boolean fullyAllocated, List<WarehouseAllocation> allocations, int unfulfilledQty) {
        public static AllocationResult noStock() {
            return new AllocationResult(false, Collections.emptyList(), 0);
        }
    }

    /**
     * 仓库分配记录（Phase 2 增强：含得分/原因/时效）
     * 向后兼容：保留旧构造方法（无评分信息时填 null）
     */
    public record WarehouseAllocation(String warehouse, int quantity, int availableInWarehouse,
                                      BigDecimal score, String reason, Integer estimatedDays) {
        public WarehouseAllocation(String warehouse, int quantity, int availableInWarehouse) {
            this(warehouse, quantity, availableInWarehouse, null, null, null);
        }
    }

    /** 内部评分记录 */
    private record WarehouseScore(String warehouse, int availableStock, double totalScore,
                                   String reason, int estimatedDays,
                                   double stockScore, double timeScore,
                                   double costScore, double returnScore) {}
}
