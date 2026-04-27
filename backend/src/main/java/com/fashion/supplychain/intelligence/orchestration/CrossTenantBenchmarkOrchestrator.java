package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.CrossTenantBenchmarkResponse;
import com.fashion.supplychain.intelligence.entity.BenchmarkSnapshot;
import com.fashion.supplychain.intelligence.mapper.BenchmarkSnapshotMapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Stage8 — 本企业经营指标快照（严格租户隔离，只读当前租户自身数据）
 *
 * <p>每次请求仅查询当前 tenantId 的生产订单，计算并缓存至 t_benchmark_snapshot。
 * 绝不读取其他租户的原始订单数据，也不做跨租户聚合。</p>
 */
@Service
@Slf4j
public class CrossTenantBenchmarkOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private BenchmarkSnapshotMapper benchmarkSnapshotMapper;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Autowired
    private ScanRecordService scanRecordService;

    // ──────────────────────────────────────────────────────────────────
    // 公共入口
    // ──────────────────────────────────────────────────────────────────

    public CrossTenantBenchmarkResponse getBenchmark() {
        Long myTenantId = UserContext.tenantId();
        LocalDate today = LocalDate.now();

        // 1. 仅读当前租户自己的订单，计算指标并写入快照
        //    ⚠️ 严格加 tenant_id 过滤，绝不读其他租户原始数据
        List<ProductionOrder> myOrders = productionOrderService.list(
                new QueryWrapper<ProductionOrder>()
                        .eq("tenant_id", myTenantId)
                        .eq("delete_flag", 0)
                        .gt("create_time", LocalDateTime.now().minusDays(90))
                        .select("tenant_id", "status", "completed_quantity",
                                "order_quantity", "create_time")
        );
        if (myOrders.isEmpty()) {
            return emptyResponse();
        }
        BenchmarkSnapshot mySnap = computeSnapshot(myTenantId, myOrders, today);
        // UPSERT 自己的快照（每次请求刷新保证实时性）
        benchmarkSnapshotMapper.delete(new QueryWrapper<BenchmarkSnapshot>()
                .eq("tenant_id", myTenantId).eq("snapshot_date", today));
        benchmarkSnapshotMapper.insert(mySnap);

        CrossTenantBenchmarkResponse.TenantMetrics selfMetrics = toMetrics(mySnap);
        String insight = generateInsight(selfMetrics);

        CrossTenantBenchmarkResponse resp = new CrossTenantBenchmarkResponse();
        resp.setSelf(selfMetrics);
        resp.setInsight(insight);
        resp.setTopLearning(topLearning(selfMetrics));
        return resp;
    }



    private BenchmarkSnapshot computeSnapshot(Long tenantId, List<ProductionOrder> orders, LocalDate date) {
        int total = orders.size();
        int completed = (int) orders.stream().filter(o -> "COMPLETED".equals(o.getStatus())).count();

        // 逾期率（近似：completed > 0 且 progress < 100 的比例）
        long overdueApprox = orders.stream()
                .filter(o -> !"COMPLETED".equals(o.getStatus()) && !"CANCELLED".equals(o.getStatus()))
                .filter(o -> o.getOrderQuantity() != null && o.getOrderQuantity() > 0
                          && (o.getCompletedQuantity() == null || o.getCompletedQuantity() < o.getOrderQuantity() / 2))
                .count();

        BigDecimal overdueRate     = pct(overdueApprox, total);
        BigDecimal completionRate  = pct(completed, total);
        // 准时交货率（近似：完工订单中85%准时，基于无法直接查交期的限制）
        BigDecimal onTimeRate      = completionRate.multiply(BigDecimal.valueOf(0.85)).setScale(1, RoundingMode.HALF_UP);
        // 真实次品率 = 扫码失败记录数 / 总扫码记录数 × 100（查同一90天窗口）
        List<ScanRecord> scans = scanRecordService.list(
                new QueryWrapper<ScanRecord>()
                        .eq("tenant_id", tenantId)
                        .ne("scan_type", "orchestration")
                        .ge("scan_time", LocalDateTime.now().minusDays(90))
                        .select("scan_result"));
        long totalScanCount = scans.size();
        long failedScanCount = scans.stream()
                .filter(r -> "fail".equals(r.getScanResult())).count();
        BigDecimal defectRate = totalScanCount > 0
                ? pct(failedScanCount, (int) totalScanCount)
                : BigDecimal.valueOf(2.5); // 暂无扫码记录时沿用行业基准兜底
        // 综合效率分
        BigDecimal effScore = completionRate.subtract(overdueRate.multiply(BigDecimal.valueOf(2)))
                .add(onTimeRate).divide(BigDecimal.valueOf(3), 1, RoundingMode.HALF_UP);

        BenchmarkSnapshot snap = new BenchmarkSnapshot();
        snap.setTenantId(tenantId);
        snap.setSnapshotDate(date);
        snap.setOverdueRate(overdueRate);
        snap.setAvgCompletionRate(completionRate);
        snap.setOnTimeDeliveryRate(onTimeRate);
        snap.setDefectRate(defectRate);
        snap.setEfficiencyScore(effScore);
        snap.setCreateTime(LocalDateTime.now());
        return snap;
    }

    private BigDecimal pct(long num, int denom) {
        if (denom == 0) return BigDecimal.ZERO;
        return BigDecimal.valueOf(num * 100.0 / denom).setScale(1, RoundingMode.HALF_UP);
    }


    private CrossTenantBenchmarkResponse.TenantMetrics toMetrics(BenchmarkSnapshot s) {
        CrossTenantBenchmarkResponse.TenantMetrics m = new CrossTenantBenchmarkResponse.TenantMetrics();
        m.setOverdueRate(s.getOverdueRate());
        m.setAvgCompletionRate(s.getAvgCompletionRate());
        m.setOnTimeDeliveryRate(s.getOnTimeDeliveryRate());
        m.setDefectRate(s.getDefectRate());
        m.setEfficiencyScore(s.getEfficiencyScore());
        return m;
    }

    private String topLearning(CrossTenantBenchmarkResponse.TenantMetrics self) {
        if (self == null || self.getEfficiencyScore() == null) return "暂无足够数据";
        double score = self.getEfficiencyScore().doubleValue();
        if (score >= 70) return "整体指标良好，重点关注质检稳定性与交期履约率";
        if (score >= 40) return "缩短在制品周期、减少排产等待时间可提升完成率";
        return "重点改善逾期率：加强提前预警和排产计划精度，建议启用停滞预警";
    }

    private String generateInsight(CrossTenantBenchmarkResponse.TenantMetrics self) {
        try {
            String msg = "本企业近90天经营指标：效率分=" + self.getEfficiencyScore()
                    + " 完成率=" + self.getAvgCompletionRate() + "%"
                    + " 逾期率=" + self.getOverdueRate() + "%"
                    + " 准时交货率=" + self.getOnTimeDeliveryRate() + "%";
            var r = inferenceOrchestrator.chat("perf-insight",
                    "你是服装供应链AI顾问，根据企业自身经营数据用1-2句话给出改进建议，不超过80字。", msg);
            return r.isSuccess() ? r.getContent() : "建议重点改善逾期率，提升按期完工比例。";
        } catch (Exception e) {
            log.debug("[CrossTenantBenchmark] generateInsight失败", e);
            return "建议重点改善逾期率，提升按期完工比例。";
        }
    }

    private CrossTenantBenchmarkResponse emptyResponse() {
        CrossTenantBenchmarkResponse r = new CrossTenantBenchmarkResponse();
        r.setInsight("暂无足够历史订单数据，建议先录入生产订单后再查看指标");
        return r;
    }
}
