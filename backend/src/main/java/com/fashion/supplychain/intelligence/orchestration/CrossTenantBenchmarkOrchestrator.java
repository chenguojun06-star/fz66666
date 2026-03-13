package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.CrossTenantBenchmarkResponse;
import com.fashion.supplychain.intelligence.entity.BenchmarkSnapshot;
import com.fashion.supplychain.intelligence.mapper.BenchmarkSnapshotMapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Stage8 — 跨租户基准对标 Orchestrator
 *
 * <p>每日快照策略：首次请求当天数据时，计算所有租户指标并写入 t_benchmark_snapshot（UPSERT），
 * 后续请求直接走缓存快照，不重复计算全量数据。</p>
 *
 * <p>隐私保护：跨租户聚合时只返回分位值（P50/P90），不暴露具体租户信息。</p>
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

        // 2. 读取所有今日快照用于计算行业分位数
        //    t_benchmark_snapshot 只含聚合指标，不含原始订单明细，安全可读
        List<BenchmarkSnapshot> all = benchmarkSnapshotMapper.selectList(
                new QueryWrapper<BenchmarkSnapshot>().eq("snapshot_date", today));

        CrossTenantBenchmarkResponse.TenantMetrics selfMetrics   = toMetrics(mySnap);
        CrossTenantBenchmarkResponse.TenantMetrics medianMetrics = computeMedian(all);
        CrossTenantBenchmarkResponse.TenantMetrics top10Metrics  = computeTop10(all);

        int percentile = computePercentile(mySnap, all);

        String insight = generateInsight(selfMetrics, medianMetrics, percentile, all.size());

        CrossTenantBenchmarkResponse resp = new CrossTenantBenchmarkResponse();
        resp.setSelf(selfMetrics);
        resp.setIndustryMedian(medianMetrics);
        resp.setIndustryTop10pct(top10Metrics);
        resp.setPercentileRank(percentile);
        resp.setPeerCount(all.size());
        resp.setInsight(insight);
        resp.setBiggestGapMetric(findBiggestGap(selfMetrics, medianMetrics));
        resp.setTopLearning(topLearning(percentile));
        return resp;
    }

    // ──────────────────────────────────────────────────────────────────
    // 定时任务：每日凌晨1:30 系统级刷新全租户快照
    // （仅此处允许跨租户读取，普通用户请求路径绝不触发）
    // ──────────────────────────────────────────────────────────────────

    @Scheduled(cron = "0 30 1 * * ?")
    public void dailyRefreshAllSnapshots() {
        LocalDate today = LocalDate.now();
        log.info("[CrossTenantBenchmark] 定时任务：开始计算今日({})全租户快照", today);
        try {
            // 系统级任务，无 UserContext，直接全量扫描
            List<ProductionOrder> allOrders = productionOrderService.list(
                    new QueryWrapper<ProductionOrder>()
                            .gt("create_time", LocalDateTime.now().minusDays(90))
                            .select("tenant_id", "status", "completed_quantity",
                                    "order_quantity", "create_time")
            );
            Map<Long, List<ProductionOrder>> byTenant = allOrders.stream()
                    .filter(o -> o.getTenantId() != null)
                    .collect(Collectors.groupingBy(ProductionOrder::getTenantId));

            int ok = 0, fail = 0;
            for (Map.Entry<Long, List<ProductionOrder>> entry : byTenant.entrySet()) {
                Long tenantId = entry.getKey();
                if (entry.getValue().isEmpty()) continue;
                try {
                    BenchmarkSnapshot snap = computeSnapshot(tenantId, entry.getValue(), today);
                    benchmarkSnapshotMapper.delete(new QueryWrapper<BenchmarkSnapshot>()
                            .eq("tenant_id", tenantId).eq("snapshot_date", today));
                    benchmarkSnapshotMapper.insert(snap);
                    ok++;
                } catch (Exception ex) {
                    log.warn("[CrossTenant] tenant={} snapshot failed: {}", tenantId, ex.getMessage());
                    fail++;
                }
            }
            log.info("[CrossTenantBenchmark] 定时任务完成：成功={} 失败={}", ok, fail);
        } catch (Exception e) {
            log.error("[CrossTenantBenchmark] 定时任务异常: {}", e.getMessage(), e);
        }
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
        BigDecimal defectRate      = BigDecimal.valueOf(2.5); // 行业基准值，等完整质检数据后更换
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

    // ──────────────────────────────────────────────────────────────────
    // 统计聚合
    // ──────────────────────────────────────────────────────────────────

    private CrossTenantBenchmarkResponse.TenantMetrics computeMedian(List<BenchmarkSnapshot> snaps) {
        return aggregateAtPercentile(snaps, 50);
    }

    private CrossTenantBenchmarkResponse.TenantMetrics computeTop10(List<BenchmarkSnapshot> snaps) {
        return aggregateAtPercentile(snaps, 90);
    }

    private CrossTenantBenchmarkResponse.TenantMetrics aggregateAtPercentile(
            List<BenchmarkSnapshot> snaps, int percentile) {
        if (snaps.isEmpty()) return new CrossTenantBenchmarkResponse.TenantMetrics();
        CrossTenantBenchmarkResponse.TenantMetrics m = new CrossTenantBenchmarkResponse.TenantMetrics();
        m.setOverdueRate(percentileVal(snaps, BenchmarkSnapshot::getOverdueRate, percentile));
        m.setAvgCompletionRate(percentileVal(snaps, BenchmarkSnapshot::getAvgCompletionRate, percentile));
        m.setOnTimeDeliveryRate(percentileVal(snaps, BenchmarkSnapshot::getOnTimeDeliveryRate, percentile));
        m.setDefectRate(percentileVal(snaps, BenchmarkSnapshot::getDefectRate, percentile));
        m.setEfficiencyScore(percentileVal(snaps, BenchmarkSnapshot::getEfficiencyScore, percentile));
        return m;
    }

    private BigDecimal percentileVal(List<BenchmarkSnapshot> snaps,
                                     java.util.function.Function<BenchmarkSnapshot, BigDecimal> getter,
                                     int pct) {
        List<BigDecimal> vals = snaps.stream()
                .map(getter)
                .filter(Objects::nonNull)
                .sorted()
                .collect(Collectors.toList());
        if (vals.isEmpty()) return BigDecimal.ZERO;
        int idx = Math.min((int) Math.round(vals.size() * pct / 100.0), vals.size() - 1);
        return vals.get(idx);
    }

    private int computePercentile(BenchmarkSnapshot mine, List<BenchmarkSnapshot> all) {
        if (all.size() <= 1) return 50;
        BigDecimal myScore = mine.getEfficiencyScore() != null ? mine.getEfficiencyScore() : BigDecimal.ZERO;
        long better = all.stream()
                .filter(s -> s.getEfficiencyScore() != null && s.getEfficiencyScore().compareTo(myScore) < 0)
                .count();
        return (int) Math.round(100.0 * better / (all.size() - 1));
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

    private String findBiggestGap(CrossTenantBenchmarkResponse.TenantMetrics self,
                                   CrossTenantBenchmarkResponse.TenantMetrics median) {
        if (self == null || median == null) return "效率分";
        double gapEff = gap(self.getEfficiencyScore(), median.getEfficiencyScore());
        double gapOT  = gap(self.getOnTimeDeliveryRate(), median.getOnTimeDeliveryRate());
        double gapOD  = gap(self.getOverdueRate(), median.getOverdueRate());
        if (gapOD > gapEff && gapOD > gapOT) return "逾期率";
        if (gapOT > gapEff) return "准时交货率";
        return "综合效率分";
    }

    private double gap(BigDecimal a, BigDecimal b) {
        if (a == null || b == null) return 0;
        return Math.abs(a.subtract(b).doubleValue());
    }

    private String topLearning(int percentile) {
        if (percentile >= 80) return "继续保持，重点关注质检稳定性";
        if (percentile >= 50) return "缩短在制品周期、减少等待时间可有效提升排名";
        return "重点改善逾期率：加强提前预警和排产计划精度";
    }

    private String generateInsight(CrossTenantBenchmarkResponse.TenantMetrics self,
                                    CrossTenantBenchmarkResponse.TenantMetrics median,
                                    int percentile, int peerCount) {
        try {
            String msg = "我方效率分=" + self.getEfficiencyScore()
                    + " 行业中位数=" + median.getEfficiencyScore()
                    + " 百分位=" + percentile + " 样本租户=" + peerCount
                    + " 我方逾期率=" + self.getOverdueRate() + "% 行业逾期率=" + median.getOverdueRate() + "%";
            var r = inferenceOrchestrator.chat("cross-tenant-insight",
                    "你是供应链对标分析AI，用1-2句话给出改进优先级建议，不超过80字。", msg);
            return r.isSuccess() ? r.getContent() : "请参考百分位排名针对差距最大的指标制定改善计划。";
        } catch (Exception e) {
            return "基于行业对标数据，重点改善排名靠后的核心指标。";
        }
    }

    private CrossTenantBenchmarkResponse emptyResponse() {
        CrossTenantBenchmarkResponse r = new CrossTenantBenchmarkResponse();
        r.setPeerCount(0);
        r.setPercentileRank(50);
        r.setInsight("暂无足够历史订单数据进行对标分析");
        return r;
    }
}
