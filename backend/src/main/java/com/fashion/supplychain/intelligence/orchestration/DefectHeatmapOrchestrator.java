package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.DefectHeatmapResponse;
import com.fashion.supplychain.intelligence.dto.DefectHeatmapResponse.HeatCell;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 质量缺陷热力图编排器 — 「父工序 × 工厂」 缺陷矩阵
 *
 * <p>算法：
 * <ol>
 *   <li>取最近 30 天所有扫码记录</li>
 *   <li>按 (progressStage[父工序], factoryName) 二维分组，而非 processName[子工序]</li>
 *   <li>计算每个格子的 defectRate = failCount / totalCount</li>
 *   <li>热度等级：0=优秀(≤1%), 1=良好(≤5%), 2=警告(≤10%), 3=严重(>10%)</li>
 * </ol>
 */
@Service
@Slf4j
public class DefectHeatmapOrchestrator {

    /** 标准父工序顺序 */
    private static final List<String> STAGE_ORDER =
            Arrays.asList("采购", "裁剪", "二次工艺", "车缝", "尾部", "质检", "入库");

    /** 历史脏数据规范化映射：子工序名 / 旧写法 → 标准父工序 */
    private static final Map<String, String> NORMALIZE;
    static {
        Map<String, String> m = new HashMap<>();
        // 质检系列
        m.put("质检领取", "质检"); m.put("质检验收", "质检");
        m.put("质检确认", "质检"); m.put("质检", "质检");
        // 入库系列
        m.put("仓库入库", "入库"); m.put("入库", "入库");
        // 二次工艺子工序 → 二次工艺
        m.put("绣花", "二次工艺"); m.put("印花", "二次工艺");
        m.put("烟洗", "二次工艺"); m.put("压花", "二次工艺");
        m.put("洗水", "二次工艺");
        NORMALIZE = Collections.unmodifiableMap(m);
    }

    /** 规范化：已知子工序/旧写法→父工序；不在 STAGE_ORDER 里的返回 null（过滤掉） */
    private String normalizeStage(String raw) {
        if (raw == null) return null;
        String mapped = NORMALIZE.getOrDefault(raw, raw);
        return STAGE_ORDER.contains(mapped) ? mapped : null;
    }

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionOrderService productionOrderService;

    public DefectHeatmapResponse analyze() {
        DefectHeatmapResponse resp = new DefectHeatmapResponse();
        try {
        Long tenantId = UserContext.tenantId();
        LocalDateTime start = LocalDateTime.now().minusDays(30);

        // 获取最近30天扫码记录
        // 过滤：progress_stage 不为空（父工序必须存在）
        QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .ge("scan_time", start)
          .isNotNull("progress_stage");
        List<ScanRecord> scans = scanRecordService.list(qw);

        if (scans.isEmpty()) {
            resp.setProcesses(Collections.emptyList());
            resp.setFactories(Collections.emptyList());
            resp.setCells(Collections.emptyList());
            resp.setTotalDefects(0);
            return resp;
        }

        // orderId → factoryName 映射（ScanRecord 无 factoryName 字段）
        Set<String> orderIds = scans.stream()
                .map(ScanRecord::getOrderId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<String, String> orderToFactory = new HashMap<>();
        if (!orderIds.isEmpty()) {
            QueryWrapper<ProductionOrder> oqw = new QueryWrapper<>();
            oqw.in("id", orderIds).select("id", "factory_name");
            productionOrderService.list(oqw).forEach(o ->
                    orderToFactory.put(String.valueOf(o.getId()),
                            o.getFactoryName() != null ? o.getFactoryName() : "未分配"));
        }

        // 收集父工序（progressStage 规范化后）和工厂名——按预定义顺序排序
        List<String> processes = scans.stream()
                .map(s -> normalizeStage(s.getProgressStage()))
                .filter(Objects::nonNull)
                .distinct()
                .sorted(Comparator.comparingInt(s -> {
                    int idx = STAGE_ORDER.indexOf(s);
                    return idx < 0 ? 999 : idx;
                }))
                .collect(Collectors.toList());
        List<String> factories = scans.stream()
                .map(s -> orderToFactory.getOrDefault(s.getOrderId(), "未分配"))
                .distinct().sorted().collect(Collectors.toList());

        // 建立索引
        Map<String, Integer> processIdx = new HashMap<>();
        for (int i = 0; i < processes.size(); i++) processIdx.put(processes.get(i), i);
        Map<String, Integer> factoryIdx = new HashMap<>();
        for (int i = 0; i < factories.size(); i++) factoryIdx.put(factories.get(i), i);

        // 按 (父工序, 工厂) 分组统计
        Map<String, int[]> cellStats = new HashMap<>(); // key="pIdx,fIdx" -> [total, fail]
        int totalDefects = 0;

        for (ScanRecord s : scans) {
            // 规范化后取父工序（过滤脏数据：质检领取/质检验收/绣花/下单等历史错误写入）
            String pName = normalizeStage(s.getProgressStage());
            String fName = orderToFactory.getOrDefault(s.getOrderId(), "未分配");
            if (pName == null || !processIdx.containsKey(pName) || !factoryIdx.containsKey(fName)) continue;

            String key = processIdx.get(pName) + "," + factoryIdx.get(fName);
            int[] stats = cellStats.computeIfAbsent(key, k -> new int[]{0, 0});
            stats[0]++; // total
            if ("fail".equals(s.getScanResult())) {
                stats[1]++; // fail
                totalDefects++;
            }
        }

        // 构建热力格子
        List<HeatCell> cells = new ArrayList<>();
        for (Map.Entry<String, int[]> entry : cellStats.entrySet()) {
            String[] parts = entry.getKey().split(",");
            int pi = Integer.parseInt(parts[0]);
            int fi = Integer.parseInt(parts[1]);
            int[] stats = entry.getValue();
            double rate = stats[0] > 0 ? (double) stats[1] / stats[0] : 0;

            HeatCell cell = new HeatCell();
            cell.setProcessIdx(pi);
            cell.setFactoryIdx(fi);
            cell.setTotalScans(stats[0]);
            cell.setDefectCount(stats[1]);
            cell.setDefectRate(Math.round(rate * 10000) / 100.0); // 两位小数百分比
            cell.setHeatLevel(rate <= 0.01 ? 0 : rate <= 0.05 ? 1 : rate <= 0.10 ? 2 : 3);
            cells.add(cell);
        }

        // 找最差父工序和工厂
        Map<String, int[]> byProcess = new HashMap<>();
        Map<String, int[]> byFactory = new HashMap<>();
        for (ScanRecord s : scans) {
            String pName = normalizeStage(s.getProgressStage()); // 规范化后用父工序
            String fName = orderToFactory.getOrDefault(s.getOrderId(), "未分配");
            if (pName != null) {
                int[] ps = byProcess.computeIfAbsent(pName, k -> new int[]{0, 0});
                ps[0]++;
                if ("fail".equals(s.getScanResult())) ps[1]++;
            }
            int[] fs = byFactory.computeIfAbsent(fName, k -> new int[]{0, 0});
            fs[0]++;
            if ("fail".equals(s.getScanResult())) fs[1]++;
        }

        resp.setProcesses(processes);
        resp.setFactories(factories);
        resp.setCells(cells);
        resp.setTotalDefects(totalDefects);
        resp.setWorstProcess(findWorst(byProcess));
        resp.setWorstFactory(findWorst(byFactory));
        } catch (Exception e) {
            log.error("[缺陷热力图] 数据加载异常（降级返回空数据）: {}", e.getMessage(), e);
        }
        return resp;
    }

    private String findWorst(Map<String, int[]> stats) {
        String worst = "";
        double worstRate = 0;
        for (Map.Entry<String, int[]> entry : stats.entrySet()) {
            int[] s = entry.getValue();
            double rate = s[0] > 0 ? (double) s[1] / s[0] : 0;
            if (rate > worstRate) {
                worstRate = rate;
                worst = entry.getKey();
            }
        }
        return worst;
    }
}
