package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.HealthIndexResponse;
import com.fashion.supplychain.intelligence.dto.HealthIndexResponse.DailyIndex;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 供应链健康指数编排器 — 0~100 综合健康得分
 *
 * <p>五维度模型（各20分，合计100分）：
 * <ol>
 *   <li>生产执行（productionScore）— status=production 订单平均进度</li>
 *   <li>交期达成（deliveryScore）— 20分 − 延期订单占比 × 20</li>
 *   <li>质量合格（qualityScore）— 扫码成功率 × 20</li>
 *   <li>库存健康（inventoryScore）— 暂用固定分（后续接入库存模块）</li>
 *   <li>结算进度（financeScore）— 暂用固定分（后续接入财务模块）</li>
 * </ol>
 */
@Service
@Slf4j
public class HealthIndexOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private MaterialStockService materialStockService;

    private static final java.util.Set<String> TERMINAL_STATUSES = java.util.Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    public HealthIndexResponse calculate() {
        HealthIndexResponse resp = new HealthIndexResponse();
        try {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId();

        // ── 维度1: 生产执行 ──
        int productionScore = calcProductionScore(tenantId, factoryId);

        // ── 维度2: 交期达成 ──
        int deliveryScore = calcDeliveryScore(tenantId, factoryId);

        // ── 维度3: 质量合格 ──
        int qualityScore = calcQualityScore(tenantId, factoryId);

        // ── 维度4: 库存健康 ──
        int inventoryScore = calcInventoryScore(tenantId);

        // ── 维度5: 结算进度 ──
        int financeScore = calcFinanceScore(tenantId, factoryId);

        int healthIndex = productionScore + deliveryScore + qualityScore + inventoryScore + financeScore;
        healthIndex = Math.min(100, Math.max(0, healthIndex));

        resp.setHealthIndex(healthIndex);
        resp.setProductionScore(productionScore);
        resp.setDeliveryScore(deliveryScore);
        resp.setQualityScore(qualityScore);
        resp.setInventoryScore(inventoryScore);
        resp.setFinanceScore(financeScore);
        resp.setGrade(healthIndex >= 90 ? "A" : healthIndex >= 75 ? "B"
                : healthIndex >= 60 ? "C" : healthIndex >= 40 ? "D" : "F");

        // ── 7日趋势 ──
        resp.setTrend(buildTrend(tenantId, factoryId));

        // ── 首要风险 + 建议 ──
        int minScore = Math.min(productionScore, Math.min(deliveryScore,
                Math.min(qualityScore, Math.min(inventoryScore, financeScore))));
        if (minScore == deliveryScore) {
            resp.setTopRisk("交期达成率偏低");
            resp.setSuggestion("建议优先推进即将到期的订单，调配更多产能");
        } else if (minScore == qualityScore) {
            resp.setTopRisk("质量合格率偏低");
            resp.setSuggestion("建议排查扫码失败率高的工序和工厂");
        } else if (minScore == inventoryScore) {
            resp.setTopRisk("库存低于安全库存");
            resp.setSuggestion("建议及时补货，避免因缺料影响生产");
        } else if (minScore == financeScore) {
            resp.setTopRisk("订单结算完成率偏低");
            resp.setSuggestion("建议推进存量订单尽快完工入库，加快资金回流");
        } else {
            resp.setTopRisk("整体生产进度偏慢");
            resp.setSuggestion("建议关注进度落后的订单，增加扫码频次");
        }

        } catch (Exception e) {
            log.error("[健康指数] 数据加载异常（降级返回空数据）: {}", e.getMessage(), e);
        }
        return resp;
    }

    // ── 生产执行分 (0~20) ──
    private int calcProductionScore(Long tenantId, String factoryId) {
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
          .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
          .eq("delete_flag", 0).eq("status", "production");
        List<ProductionOrder> orders = productionOrderService.list(qw);
        if (orders.isEmpty()) return 20;

        double avgProgress = orders.stream()
                .mapToInt(o -> o.getProductionProgress() != null ? o.getProductionProgress() : 0)
                .average().orElse(0);
        return (int) Math.round(avgProgress / 100.0 * 20);
    }

    // ── 交期达成分 (0~20) ──
    private int calcDeliveryScore(Long tenantId, String factoryId) {
        QueryWrapper<ProductionOrder> all = new QueryWrapper<>();
        all.eq("tenant_id", tenantId)
           .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
           .eq("delete_flag", 0)
           .in("status", Arrays.asList("production", "completed", "delayed"));
        long totalOrders = productionOrderService.count(all);
        if (totalOrders == 0) return 20;

        LocalDateTime now = LocalDateTime.now();
        QueryWrapper<ProductionOrder> overdueQw = new QueryWrapper<>();
        overdueQw.eq("tenant_id", tenantId)
                 .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
                 .eq("delete_flag", 0)
                 .notIn("status", TERMINAL_STATUSES)
                 .isNotNull("planned_end_date")
                 .lt("planned_end_date", now);
        long overdue = productionOrderService.count(overdueQw);
        double overdueRatio = (double) overdue / totalOrders;
        return (int) Math.round(Math.max(0, 1 - overdueRatio) * 20);
    }

    // ── 质量合格分 (0~20) ──
    private int calcQualityScore(Long tenantId, String factoryId) {
        LocalDateTime weekAgo = LocalDateTime.now().minusDays(7);
        QueryWrapper<ScanRecord> total = new QueryWrapper<>();
        total.eq("tenant_id", tenantId)
             .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
             .ge("scan_time", weekAgo);
        long totalScans = scanRecordService.count(total);
        if (totalScans == 0) return 20;

        QueryWrapper<ScanRecord> success = new QueryWrapper<>();
        success.eq("tenant_id", tenantId)
               .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
               .ge("scan_time", weekAgo)
               .eq("scan_result", "success");
        long successScans = scanRecordService.count(success);

        double successRate = (double) successScans / totalScans;
        return (int) Math.round(successRate * 20);
    }

    // ── 库存健康分 (0~20) ──
    // 计算逻辑：quantity >= safetyStock 的物料SKU数 / 总在库SKU数 × 20
    // 无库存数据则给满分（未录入库存不扣分）
    private int calcInventoryScore(Long tenantId) {
        QueryWrapper<MaterialStock> all = new QueryWrapper<>();
        all.eq("tenant_id", tenantId)
           .eq("delete_flag", 0);
        long totalStocks = materialStockService.count(all);
        if (totalStocks == 0) return 20;

        // quantity >= COALESCE(safety_stock, 0) — 高于安全库存视为健康
        QueryWrapper<MaterialStock> sufficient = new QueryWrapper<>();
        sufficient.eq("tenant_id", tenantId)
                  .eq("delete_flag", 0)
                  .apply("quantity >= COALESCE(safety_stock, 0)");
        long sufficientCount = materialStockService.count(sufficient);

        return (int) Math.round((double) sufficientCount / totalStocks * 20);
    }

    // ── 结算进度分 (0~20) ──
    // 计算逻辑：COMPLETED 订单 / 全部非取消订单 × 20
    // 无订单则给满分，体现业务完工交付能力
    private int calcFinanceScore(Long tenantId, String factoryId) {
        QueryWrapper<ProductionOrder> total = new QueryWrapper<>();
        total.eq("tenant_id", tenantId)
             .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
             .eq("delete_flag", 0)
             .notIn("status", TERMINAL_STATUSES);
        long totalOrders = productionOrderService.count(total);
        if (totalOrders == 0) return 20;

        QueryWrapper<ProductionOrder> completed = new QueryWrapper<>();
        completed.eq("tenant_id", tenantId)
                 .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
                 .eq("delete_flag", 0)
                 .eq("status", "completed");
        long completedCount = productionOrderService.count(completed);

        return (int) Math.round((double) completedCount / totalOrders * 20);
    }

    // ── 7日趋势 ──
    private List<DailyIndex> buildTrend(Long tenantId, String factoryId) {
        List<DailyIndex> trend = new ArrayList<>();
        for (int i = 6; i >= 0; i--) {
            LocalDate date = LocalDate.now().minusDays(i);
            LocalDateTime start = LocalDateTime.of(date, LocalTime.MIN);
            LocalDateTime end = LocalDateTime.of(date, LocalTime.MAX);

            int dayProduction = calcDayProduction(tenantId, factoryId, start, end);
            int dayDelivery = calcDayDelivery(tenantId, factoryId, start, end);
            int dayQuality = calcDayQuality(tenantId, factoryId, start, end);
            int dayInventory = calcInventoryScore(tenantId);
            int dayFinance = calcDayFinance(tenantId, factoryId, start, end);
            int dayIndex = Math.min(100, Math.max(0,
                    dayProduction + dayDelivery + dayQuality + dayInventory + dayFinance));

            DailyIndex d = new DailyIndex();
            d.setDate(date.toString());
            d.setIndex(dayIndex);
            trend.add(d);
        }
        return trend;
    }

    private int calcDayProduction(Long tenantId, String factoryId, LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
          .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
          .eq("delete_flag", 0).eq("status", "production")
          .between("update_time", start, end);
        List<ProductionOrder> orders = productionOrderService.list(qw);
        if (orders.isEmpty()) return 20;
        double avgProgress = orders.stream()
                .mapToInt(o -> o.getProductionProgress() != null ? o.getProductionProgress() : 0)
                .average().orElse(0);
        return (int) Math.round(avgProgress / 100.0 * 20);
    }

    private int calcDayDelivery(Long tenantId, String factoryId, LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ProductionOrder> allQw = new QueryWrapper<>();
        allQw.eq("tenant_id", tenantId)
             .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
             .eq("delete_flag", 0)
             .in("status", Arrays.asList("production", "completed", "delayed"))
             .between("update_time", start, end);
        long totalOrders = productionOrderService.count(allQw);
        if (totalOrders == 0) return 20;
        QueryWrapper<ProductionOrder> overdueQw = new QueryWrapper<>();
        overdueQw.eq("tenant_id", tenantId)
                 .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
                 .eq("delete_flag", 0)
                 .notIn("status", TERMINAL_STATUSES)
                 .isNotNull("planned_end_date")
                 .lt("planned_end_date", end)
                 .between("update_time", start, end);
        long overdue = productionOrderService.count(overdueQw);
        double overdueRatio = (double) overdue / totalOrders;
        return (int) Math.round(Math.max(0, 1 - overdueRatio) * 20);
    }

    private int calcDayQuality(Long tenantId, String factoryId, LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ScanRecord> totalQw = new QueryWrapper<>();
        totalQw.eq("tenant_id", tenantId)
               .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
               .between("scan_time", start, end);
        long totalScans = scanRecordService.count(totalQw);
        if (totalScans == 0) return 20;
        QueryWrapper<ScanRecord> okQw = new QueryWrapper<>();
        okQw.eq("tenant_id", tenantId)
            .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
            .between("scan_time", start, end)
            .eq("scan_result", "success");
        long successScans = scanRecordService.count(okQw);
        return (int) Math.round((double) successScans / totalScans * 20);
    }

    private int calcDayFinance(Long tenantId, String factoryId, LocalDateTime start, LocalDateTime end) {
        QueryWrapper<ProductionOrder> totalQw = new QueryWrapper<>();
        totalQw.eq("tenant_id", tenantId)
               .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
               .eq("delete_flag", 0)
               .notIn("status", TERMINAL_STATUSES)
               .between("update_time", start, end);
        long totalOrders = productionOrderService.count(totalQw);
        if (totalOrders == 0) return 20;
        QueryWrapper<ProductionOrder> completedQw = new QueryWrapper<>();
        completedQw.eq("tenant_id", tenantId)
                   .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
                   .eq("delete_flag", 0)
                   .eq("status", "completed")
                   .between("update_time", start, end);
        long completedCount = productionOrderService.count(completedQw);
        return (int) Math.round((double) completedCount / totalOrders * 20);
    }
}
