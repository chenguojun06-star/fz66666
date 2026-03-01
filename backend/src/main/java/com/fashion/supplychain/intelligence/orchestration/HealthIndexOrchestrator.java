package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.HealthIndexResponse;
import com.fashion.supplychain.intelligence.dto.HealthIndexResponse.DailyIndex;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 供应链健康指数编排器 — 0~100 综合健康得分
 *
 * <p>五维度模型（各20分，合计100分）：
 * <ol>
 *   <li>生产执行（productionScore）— IN_PROGRESS 订单平均进度</li>
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
    private DashboardQueryService dashboardQueryService;

    public HealthIndexResponse calculate() {
        HealthIndexResponse resp = new HealthIndexResponse();
        Long tenantId = UserContext.tenantId();

        // ── 维度1: 生产执行 ──
        int productionScore = calcProductionScore(tenantId);

        // ── 维度2: 交期达成 ──
        int deliveryScore = calcDeliveryScore(tenantId);

        // ── 维度3: 质量合格 ──
        int qualityScore = calcQualityScore(tenantId);

        // ── 维度4 & 5: 库存 / 财务（暂用默认值） ──
        int inventoryScore = 16;  // 后续接入 MaterialStockService
        int financeScore = 15;    // 后续接入 ReconciliationService

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
        resp.setTrend(buildTrend(tenantId));

        // ── 首要风险 + 建议 ──
        int minScore = Math.min(productionScore, Math.min(deliveryScore, qualityScore));
        if (minScore == deliveryScore) {
            resp.setTopRisk("交期达成率偏低");
            resp.setSuggestion("建议优先推进即将到期的订单，调配更多产能");
        } else if (minScore == qualityScore) {
            resp.setTopRisk("质量合格率偏低");
            resp.setSuggestion("建议排查扫码失败率高的工序和工厂");
        } else {
            resp.setTopRisk("整体生产进度偏慢");
            resp.setSuggestion("建议关注进度落后的订单，增加扫码频次");
        }

        return resp;
    }

    // ── 生产执行分 (0~20) ──
    private int calcProductionScore(Long tenantId) {
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("delete_flag", 0).eq("status", "IN_PROGRESS");
        List<ProductionOrder> orders = productionOrderService.list(qw);
        if (orders.isEmpty()) return 20;

        double avgProgress = orders.stream()
                .mapToInt(o -> o.getProductionProgress() != null ? o.getProductionProgress() : 0)
                .average().orElse(0);
        return (int) Math.round(avgProgress / 100.0 * 20);
    }

    // ── 交期达成分 (0~20) ──
    private int calcDeliveryScore(Long tenantId) {
        QueryWrapper<ProductionOrder> all = new QueryWrapper<>();
        all.eq(tenantId != null, "tenant_id", tenantId)
           .eq("delete_flag", 0)
           .in("status", Arrays.asList("IN_PROGRESS", "COMPLETED"));
        long totalOrders = productionOrderService.count(all);
        if (totalOrders == 0) return 20;

        long overdue = dashboardQueryService.countOverdueOrders();
        double overdueRatio = (double) overdue / totalOrders;
        return (int) Math.round(Math.max(0, 1 - overdueRatio) * 20);
    }

    // ── 质量合格分 (0~20) ──
    private int calcQualityScore(Long tenantId) {
        LocalDateTime weekAgo = LocalDateTime.now().minusDays(7);
        QueryWrapper<ScanRecord> total = new QueryWrapper<>();
        total.eq(tenantId != null, "tenant_id", tenantId)
             .ge("scan_time", weekAgo);
        long totalScans = scanRecordService.count(total);
        if (totalScans == 0) return 20;

        QueryWrapper<ScanRecord> success = new QueryWrapper<>();
        success.eq(tenantId != null, "tenant_id", tenantId)
               .ge("scan_time", weekAgo)
               .eq("scan_result", "success");
        long successScans = scanRecordService.count(success);

        double successRate = (double) successScans / totalScans;
        return (int) Math.round(successRate * 20);
    }

    // ── 7日趋势 ──
    private List<DailyIndex> buildTrend(Long tenantId) {
        List<DailyIndex> trend = new ArrayList<>();
        for (int i = 6; i >= 0; i--) {
            LocalDate date = LocalDate.now().minusDays(i);
            LocalDateTime start = LocalDateTime.of(date, LocalTime.MIN);
            LocalDateTime end = LocalDateTime.of(date, LocalTime.MAX);

            // 简化：用当天扫码成功率 × 100 作为当日指数估算
            QueryWrapper<ScanRecord> total = new QueryWrapper<>();
            total.eq(tenantId != null, "tenant_id", tenantId)
                 .between("scan_time", start, end);
            long dayTotal = scanRecordService.count(total);

            QueryWrapper<ScanRecord> ok = new QueryWrapper<>();
            ok.eq(tenantId != null, "tenant_id", tenantId)
              .between("scan_time", start, end)
              .eq("scan_result", "success");
            long dayOk = scanRecordService.count(ok);

            DailyIndex d = new DailyIndex();
            d.setDate(date.toString());
            d.setIndex(dayTotal > 0 ? (int) Math.round((double) dayOk / dayTotal * 100) : 0);
            trend.add(d);
        }
        return trend;
    }
}
