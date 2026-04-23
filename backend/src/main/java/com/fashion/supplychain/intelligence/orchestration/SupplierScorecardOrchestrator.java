package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.SupplierScorecardResponse;
import com.fashion.supplychain.intelligence.dto.SupplierScorecardResponse.SupplierScore;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.mapper.FactoryMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 供应商智能评分卡编排器
 *
 * <p>评分维度（3轴）：
 * <ul>
 *   <li>准时率 onTimeRate — 在 expectedShipDate 前完工占比（权重 40%）</li>
 *   <li>质量分 qualityScore — 扫码成功件数 / 总扫码件数（权重 40%）</li>
 *   <li>完成率 completionRate — 完成订单数 / 总接单数（权重 20%）</li>
 * </ul>
 * <p>评级：S（≥90）/ A（≥75）/ B（≥60）/ C（<60）
 */
@Service
@Slf4j
public class SupplierScorecardOrchestrator {

    private static final int RECENT_MONTHS = 3;

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private FactoryMapper factoryMapper;

    public SupplierScorecardResponse scorecard() {
        SupplierScorecardResponse resp = new SupplierScorecardResponse();
        try {
            TenantAssert.assertTenantContext();
            Long tenantId = UserContext.tenantId();
            String factoryId = UserContext.factoryId();
            LocalDateTime since = LocalDateTime.now().minusMonths(RECENT_MONTHS);

            // 加载近3个月订单
            QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
            qw.eq(tenantId != null, "tenant_id", tenantId)
              .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
              .eq("delete_flag", 0)
              .ge("create_time", since)
              .isNotNull("factory_name")
              .ne("factory_name", "");
            List<ProductionOrder> orders = productionOrderMapper.selectList(qw);

            if (orders.isEmpty()) {
                resp.setScores(Collections.emptyList());
                resp.setSummary("近3个月暂无工厂订单数据");
                resp.setTopCount(0);
                return resp;
            }

            // 按工厂分组
            Map<String, List<ProductionOrder>> byFactory =
                    orders.stream().collect(Collectors.groupingBy(o ->
                            o.getFactoryName() == null ? "未知工厂" : o.getFactoryName()));

            // 加载扫码记录用于质量分
            Set<String> orderIdSet = orders.stream()
                    .map(o -> String.valueOf(o.getId()))
                    .collect(Collectors.toSet());
            Map<String, long[]> scanStats = buildScanStats(tenantId, factoryId, orderIdSet);

            List<SupplierScore> scores = new ArrayList<>();
            for (Map.Entry<String, List<ProductionOrder>> entry : byFactory.entrySet()) {
                scores.add(calcScore(entry.getKey(), entry.getValue(), scanStats));
            }

            // 按综合评分倒序
            scores.sort((a, b) -> Double.compare(b.getOverallScore(), a.getOverallScore()));

            long topCount = scores.stream()
                    .filter(s -> "S".equals(s.getTier()) || "A".equals(s.getTier()))
                    .count();

            resp.setScores(scores);
            resp.setTopCount((int) topCount);
            resp.setSummary(String.format("共评估 %d 家工厂（近%d个月 %d 单），S+A级 %d 家",
                    scores.size(), RECENT_MONTHS, orders.size(), topCount));

            persistScoresToFactory(scores, orders);
        } catch (Exception e) {
            log.error("[供应商评分卡] 异常: {}", e.getMessage(), e);
            resp.setScores(Collections.emptyList());
            resp.setSummary("数据分析异常，请稍后重试");
        }
        return resp;
    }

    private SupplierScore calcScore(String factoryName, List<ProductionOrder> list,
                                    Map<String, long[]> scanStats) {
        SupplierScore s = new SupplierScore();
        s.setFactoryName(factoryName);
        s.setTotalOrders(list.size());

        int completed = 0, overdue = 0;
        long totalScan = 0, successScan = 0;

        for (ProductionOrder o : list) {
            boolean isDone = "COMPLETED".equalsIgnoreCase(o.getStatus())
                    || "WAREHOUSED".equalsIgnoreCase(o.getStatus());
            if (isDone) completed++;

            // 准时判断：完成且 actualEndDate <= expectedShipDate
            if (isDone && o.getActualEndDate() != null && o.getExpectedShipDate() != null) {
                LocalDate actualDate = o.getActualEndDate().toLocalDate();
                if (actualDate.isAfter(o.getExpectedShipDate())) overdue++;
            } else if (!isDone && o.getExpectedShipDate() != null
                    && LocalDate.now().isAfter(o.getExpectedShipDate())) {
                overdue++;
            }

            // 扫码质量统计
            String key = String.valueOf(o.getId());
            if (scanStats.containsKey(key)) {
                long[] stat = scanStats.get(key);
                totalScan += stat[0];
                successScan += stat[1];
            }
        }

        s.setCompletedOrders(completed);
        s.setOverdueOrders(overdue);

        // onTimeRate = 非逾期完成 / 总完成
        double onTime = completed > 0
                ? Math.max(0.0, (double)(completed - overdue) / completed * 100)
                : 0.0;
        // qualityScore = success / total scan
        double quality = totalScan > 0 ? (double) successScan / totalScan * 100 : 80.0;
        // completionRate
        double completion = (double) completed / list.size() * 100;

        double overall = onTime * 0.4 + quality * 0.4 + completion * 0.2;
        s.setOnTimeRate(Math.round((float) onTime * 10) / 10.0);
        s.setQualityScore(Math.round((float) quality * 10) / 10.0);
        s.setOverallScore(Math.round((float) overall * 10) / 10.0);
        s.setTier(toTier(overall));
        return s;
    }

    private String toTier(double score) {
        if (score >= 90) return "S";
        if (score >= 75) return "A";
        if (score >= 60) return "B";
        return "C";
    }

    /** 构建 orderId → [totalScan, successScan] 的映射 */
    private Map<String, long[]> buildScanStats(Long tenantId, String factoryId, Set<String> orderIds) {
        if (orderIds.isEmpty()) return Collections.emptyMap();
        QueryWrapper<ScanRecord> sq = new QueryWrapper<>();
        sq.eq(tenantId != null, "tenant_id", tenantId)
          .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
          .ne("scan_type", "orchestration")
          .in("order_id", orderIds);
        List<ScanRecord> records = scanRecordMapper.selectList(sq);
        Map<String, long[]> result = new HashMap<>();
        for (ScanRecord r : records) {
            String key = r.getOrderId();
            result.computeIfAbsent(key, k -> new long[]{0, 0});
            result.get(key)[0]++;
            if ("success".equalsIgnoreCase(r.getScanResult())) result.get(key)[1]++;
        }
        return result;
    }

    private void persistScoresToFactory(List<SupplierScore> scores, List<ProductionOrder> orders) {
        Map<String, String> factoryNameToId = orders.stream()
                .filter(o -> StringUtils.hasText(o.getFactoryId()) && StringUtils.hasText(o.getFactoryName()))
                .collect(Collectors.toMap(ProductionOrder::getFactoryName, ProductionOrder::getFactoryId, (a, b) -> a));

        for (SupplierScore s : scores) {
            String fid = factoryNameToId.get(s.getFactoryName());
            if (fid == null) continue;
            try {
                Factory f = factoryMapper.selectById(fid);
                if (f == null) continue;
                f.setSupplierTier(s.getTier());
                f.setSupplierTierUpdatedAt(LocalDateTime.now());
                f.setOnTimeDeliveryRate(BigDecimal.valueOf(s.getOnTimeRate()).setScale(2, RoundingMode.HALF_UP));
                f.setQualityScore(BigDecimal.valueOf(s.getQualityScore()).setScale(2, RoundingMode.HALF_UP));
                f.setCompletionRate(BigDecimal.valueOf(s.getOverallScore() > 0 ? s.getOverallScore() * 100 / s.getOnTimeRate() : 0).setScale(2, RoundingMode.HALF_UP));
                f.setOverallScore(BigDecimal.valueOf(s.getOverallScore()).setScale(2, RoundingMode.HALF_UP));
                f.setTotalOrders(s.getTotalOrders());
                f.setCompletedOrders(s.getCompletedOrders());
                f.setOverdueOrders(s.getOverdueOrders());
                factoryMapper.updateById(f);
            } catch (Exception e) {
                log.warn("[供应商评分持久化] 工厂{}写入失败: {}", s.getFactoryName(), e.getMessage());
            }
        }
    }
}
