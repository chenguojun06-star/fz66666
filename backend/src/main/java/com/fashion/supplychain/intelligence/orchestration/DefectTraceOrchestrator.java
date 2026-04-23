package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.DefectTraceResponse;
import com.fashion.supplychain.intelligence.dto.DefectTraceResponse.DayTrend;
import com.fashion.supplychain.intelligence.dto.DefectTraceResponse.ProcessDefect;
import com.fashion.supplychain.intelligence.dto.DefectTraceResponse.WorkerDefect;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 次品溯源编排器 — 按订单聚合质检入库的缺陷数据
 *
 * <p>数据来源：t_product_warehousing.unqualified_quantity（质检入库时记录的次品数）
 * <p>算法：
 * <ol>
 *   <li>取指定订单所有质检入库记录（含次品和合格）</li>
 *   <li>按 quality_operator_name 分组，统计每个质检员的缺陷数/率</li>
 *   <li>按 defect_category 分组，找出高频缺陷类型 TOP3</li>
 *   <li>按 create_time 日期分组，生成7天趋势</li>
 * </ol>
 */
@Service
@Slf4j
public class DefectTraceOrchestrator {

    @Autowired
    private ProductWarehousingService productWarehousingService;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    public DefectTraceResponse trace(String orderId) {
        DefectTraceResponse resp = new DefectTraceResponse();
        resp.setWorkers(Collections.emptyList());
        resp.setHotProcesses(Collections.emptyList());
        resp.setTrend(Collections.emptyList());

        if (orderId == null || orderId.trim().isEmpty()) {
            return resp;
        }

        try {
            TenantAssert.assertTenantContext();
            Long tenantId = UserContext.tenantId();
            // 查询该订单所有质检入库记录（包括未发现次品的记录，用于计算总检验件数）
            QueryWrapper<ProductWarehousing> qw = new QueryWrapper<>();
            qw.eq("tenant_id", tenantId)
              .eq("order_id", orderId.trim())
              .eq("delete_flag", 0);
            List<ProductWarehousing> allRecords = productWarehousingService.list(qw);

            if (allRecords.isEmpty()) {
                return resp;
            }

            // 统计总质检件数（合格+次品）和次品总数
            int totalScans = allRecords.stream()
                    .mapToInt(w -> w.getWarehousingQuantity() == null ? 0 : w.getWarehousingQuantity())
                    .sum();
            int totalDefects = allRecords.stream()
                    .mapToInt(w -> w.getUnqualifiedQuantity() == null ? 0 : w.getUnqualifiedQuantity())
                    .sum();

            resp.setTotalScans(totalScans);
            resp.setTotalDefects(totalDefects);
            resp.setOverallDefectRate(totalScans > 0
                    ? Math.round(totalDefects * 10000.0 / totalScans) / 100.0 : 0);

            // 按质检员聚合
            resp.setWorkers(aggregateByWorker(allRecords));

            // 按次品类型聚合 TOP3
            resp.setHotProcesses(aggregateByDefectCategory(allRecords));

            // 7天趋势
            resp.setTrend(buildTrend(allRecords));

        } catch (Exception e) {
            log.error("[次品溯源] orderId={} 异常（降级返回空数据）: {}", orderId, e.getMessage(), e);
        }
        return resp;
    }

    private List<WorkerDefect> aggregateByWorker(List<ProductWarehousing> records) {
        // 按质检员分组（优先 qualityOperatorName，其次 warehousingOperatorName）
        Map<String, List<ProductWarehousing>> byWorker = records.stream()
                .collect(Collectors.groupingBy(this::resolveOperatorName));

        List<WorkerDefect> workers = new ArrayList<>();
        for (Map.Entry<String, List<ProductWarehousing>> entry : byWorker.entrySet()) {
            if (entry.getKey().isEmpty()) continue;
            List<ProductWarehousing> ws = entry.getValue();

            int totalInspected = ws.stream()
                    .mapToInt(w -> w.getWarehousingQuantity() == null ? 0 : w.getWarehousingQuantity())
                    .sum();
            int defectCount = ws.stream()
                    .mapToInt(w -> w.getUnqualifiedQuantity() == null ? 0 : w.getUnqualifiedQuantity())
                    .sum();
            if (defectCount == 0) continue; // 只返回有次品的质检员

            WorkerDefect wd = new WorkerDefect();
            wd.setOperatorName(entry.getKey());
            wd.setOperatorId(resolveOperatorId(ws.get(0)));
            wd.setTotalScans(totalInspected);
            wd.setDefectCount(defectCount);
            double rate = totalInspected > 0 ? Math.round(defectCount * 10000.0 / totalInspected) / 100.0 : 0;
            wd.setDefectRate(rate);
            wd.setRiskLevel(rate > 10 ? "high" : rate > 5 ? "medium" : "low");

            // 该质检员最多次品的缺陷类型
            Map<String, Integer> defectByCategory = new HashMap<>();
            for (ProductWarehousing w : ws) {
                if (w.getUnqualifiedQuantity() != null && w.getUnqualifiedQuantity() > 0
                        && w.getDefectCategory() != null && !w.getDefectCategory().isEmpty()) {
                    defectByCategory.merge(w.getDefectCategory(), w.getUnqualifiedQuantity(), Integer::sum);
                }
            }
            wd.setWorstProcess(defectByCategory.entrySet().stream()
                    .max(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey).orElse("-"));

            workers.add(wd);
        }

        workers.sort(Comparator.comparingInt(WorkerDefect::getDefectCount).reversed());
        return workers;
    }

    private List<ProcessDefect> aggregateByDefectCategory(List<ProductWarehousing> records) {
        // 按次品类型（defect_category）分组，无类型的归入"未分类"
        Map<String, Integer> defectByCategory = new HashMap<>();
        Map<String, Integer> totalByCategory = new HashMap<>();

        for (ProductWarehousing w : records) {
            if (w.getUnqualifiedQuantity() == null || w.getUnqualifiedQuantity() <= 0) continue;
            String cat = (w.getDefectCategory() != null && !w.getDefectCategory().isEmpty())
                    ? w.getDefectCategory() : "未分类";
            defectByCategory.merge(cat, w.getUnqualifiedQuantity(), Integer::sum);
            totalByCategory.merge(cat, w.getWarehousingQuantity() == null ? 0 : w.getWarehousingQuantity(), Integer::sum);
        }

        List<ProcessDefect> list = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : defectByCategory.entrySet()) {
            ProcessDefect pd = new ProcessDefect();
            pd.setProcessName(entry.getKey());
            pd.setDefectCount(entry.getValue());
            int catTotal = totalByCategory.getOrDefault(entry.getKey(), entry.getValue());
            pd.setTotalScans(catTotal);
            pd.setDefectRate(catTotal > 0 ? Math.round(entry.getValue() * 10000.0 / catTotal) / 100.0 : 0);
            list.add(pd);
        }

        list.sort(Comparator.comparingInt(ProcessDefect::getDefectCount).reversed());
        return list.size() > 3 ? list.subList(0, 3) : list;
    }

    private List<DayTrend> buildTrend(List<ProductWarehousing> records) {
        LocalDate today = LocalDate.now();
        LocalDate cutoff = today.minusDays(6);

        Map<String, int[]> dayStats = new LinkedHashMap<>();
        for (int i = 6; i >= 0; i--) {
            dayStats.put(today.minusDays(i).format(DATE_FMT), new int[]{0, 0});
        }

        for (ProductWarehousing w : records) {
            if (w.getCreateTime() == null) continue;
            LocalDate day = w.getCreateTime().toLocalDate();
            if (day.isBefore(cutoff)) continue;
            String dayKey = day.format(DATE_FMT);
            int[] stats = dayStats.get(dayKey);
            if (stats == null) continue;
            stats[0] += w.getWarehousingQuantity() == null ? 0 : w.getWarehousingQuantity(); // total
            stats[1] += w.getUnqualifiedQuantity() == null ? 0 : w.getUnqualifiedQuantity(); // defect
        }

        List<DayTrend> trend = new ArrayList<>();
        for (Map.Entry<String, int[]> entry : dayStats.entrySet()) {
            DayTrend dt = new DayTrend();
            dt.setDate(entry.getKey());
            dt.setTotalScans(entry.getValue()[0]);
            dt.setDefectCount(entry.getValue()[1]);
            trend.add(dt);
        }
        return trend;
    }

    private String resolveOperatorName(ProductWarehousing w) {
        String quality = w.getQualityOperatorName();
        if (quality != null && !quality.trim().isEmpty()) return quality.trim();
        String warehousing = w.getWarehousingOperatorName();
        return warehousing != null ? warehousing.trim() : "";
    }

    private String resolveOperatorId(ProductWarehousing w) {
        String qualityId = w.getQualityOperatorId();
        if (qualityId != null && !qualityId.trim().isEmpty()) return qualityId.trim();
        return w.getWarehousingOperatorId() != null ? w.getWarehousingOperatorId() : "";
    }
}
