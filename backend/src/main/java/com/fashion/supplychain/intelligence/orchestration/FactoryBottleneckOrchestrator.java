package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 工厂工序瓶颈分析编排器
 *
 * <p>算法：基于 t_scan_record 真实扫码数据（不使用订单实体上从未被写入的 *CompletionRate 字段），
 * 计算每单各阶段完成率，按工厂聚合后找出平均完成率最低的工序（即瓶颈工序）。
 * <pre>
 *   1. 查询租户内活跃订单（非 completed / cancelled）
 *   2. 批量查询这批订单的成功扫码记录（一次查询，避免 N+1）
 *   3. 将 progressStage / scanType 映射到五大标准工序：采购/裁剪/车缝/质检/入库
 *   4. 对每单每工序计算：completedQty / orderQuantity * 100（取 min 100）
 *   5. 按工厂聚合取各工序平均值，找最小值的工序即为瓶颈
 * </pre>
 */
@Service
@Slf4j
public class FactoryBottleneckOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    /** 五大工序标签（与前端 STAGE_FIELDS 保持一致） */
    private static final String[] STAGE_LABELS = {"采购", "裁剪", "车缝", "质检", "入库"};

    @Data
    public static class WorstOrderItem {
        private String orderNo;
        private int pct;
    }

    @Data
    public static class FactoryBottleneckItem {
        private String factoryName;
        private int orderCount;
        private String stuckStage;
        private int stuckPct;
        private List<WorstOrderItem> worstOrders;
    }

    public List<FactoryBottleneckItem> compute() {
        Long tenantId = UserContext.tenantId();

        // 1. 查询活跃订单（非已完成、非已取消、非软删除）
        List<ProductionOrder> orders = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .notIn(ProductionOrder::getStatus, "COMPLETED", "completed", "CANCELLED", "cancelled")
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .isNotNull(ProductionOrder::getFactoryName)
                        .ne(ProductionOrder::getFactoryName, "")
        );

        if (orders.isEmpty()) return Collections.emptyList();

        // 2. 收集订单ID，批量查成功扫码记录（一次查询，不逐单查）
        List<String> orderIds = orders.stream()
                .map(o -> String.valueOf(o.getId()))
                .collect(Collectors.toList());

        List<ScanRecord> scans = scanRecordService.list(
                new LambdaQueryWrapper<ScanRecord>()
                        .eq(ScanRecord::getTenantId, tenantId)
                        .in(ScanRecord::getOrderId, orderIds)
                        .eq(ScanRecord::getScanResult, "success")
        );

        // 3. orderId → stageLabel → quantity 汇总
        Map<String, Map<String, Integer>> scanQtyMap = new HashMap<>();
        for (ScanRecord s : scans) {
            if (s.getOrderId() == null || s.getQuantity() == null || s.getQuantity() <= 0) continue;
            String stage = mapToStageLabel(s.getProgressStage(), s.getScanType());
            if (stage == null) continue;
            scanQtyMap.computeIfAbsent(s.getOrderId(), k -> new HashMap<>())
                    .merge(stage, s.getQuantity(), Integer::sum);
        }

        // 4. 按工厂分组
        Map<String, List<ProductionOrder>> byFactory = orders.stream()
                .collect(Collectors.groupingBy(o -> o.getFactoryName().trim()));

        // 5. 对每个工厂找平均完成率最低的工序
        List<FactoryBottleneckItem> result = new ArrayList<>();
        for (Map.Entry<String, List<ProductionOrder>> entry : byFactory.entrySet()) {
            List<ProductionOrder> group = entry.getValue();

            String minStage = STAGE_LABELS[0];
            int minAvg = Integer.MAX_VALUE;

            for (String stage : STAGE_LABELS) {
                int sumPct = 0;
                for (ProductionOrder o : group) {
                    String oid = String.valueOf(o.getId());
                    int total = o.getOrderQuantity() != null && o.getOrderQuantity() > 0
                            ? o.getOrderQuantity() : 1;
                    int scanned = scanQtyMap
                            .getOrDefault(oid, Collections.emptyMap())
                            .getOrDefault(stage, 0);
                    sumPct += Math.min(100, scanned * 100 / total);
                }
                int avg = sumPct / group.size();
                if (avg < minAvg) {
                    minAvg = avg;
                    minStage = stage;
                }
            }

            // 取该工序中完成率 < 80% 的前3单（按完成率升序）
            final String finalStage = minStage;
            List<WorstOrderItem> worstOrders = group.stream()
                    .map(o -> {
                        String oid = String.valueOf(o.getId());
                        int total = o.getOrderQuantity() != null && o.getOrderQuantity() > 0
                                ? o.getOrderQuantity() : 1;
                        int scanned = scanQtyMap
                                .getOrDefault(oid, Collections.emptyMap())
                                .getOrDefault(finalStage, 0);
                        int pct = Math.min(100, scanned * 100 / total);
                        WorstOrderItem w = new WorstOrderItem();
                        w.setOrderNo(o.getOrderNo() != null ? o.getOrderNo() : oid);
                        w.setPct(pct);
                        return w;
                    })
                    .filter(w -> w.getPct() < 80)
                    .sorted(Comparator.comparingInt(WorstOrderItem::getPct))
                    .limit(3)
                    .collect(Collectors.toList());

            FactoryBottleneckItem item = new FactoryBottleneckItem();
            item.setFactoryName(entry.getKey());
            item.setOrderCount(group.size());
            item.setStuckStage(minStage);
            item.setStuckPct(minAvg);
            item.setWorstOrders(worstOrders);
            result.add(item);
        }

        // 按瓶颈完成率升序（最差工厂排前面）
        result.sort(Comparator.comparingInt(FactoryBottleneckItem::getStuckPct));

        log.debug("[FactoryBottleneck] tenantId={} factories={}", tenantId, result.size());
        return result;
    }

    /**
     * 将扫码记录的 progressStage / scanType 映射到五大标准工序标签。
     * 优先用 scanType，再用 progressStage 文本匹配。
     */
    private String mapToStageLabel(String progressStage, String scanType) {
        // 优先按 scanType 判断（语义最准确）
        if (scanType != null) {
            switch (scanType) {
                case "procurement": case "material": return "采购";
                case "cutting":                      return "裁剪";
                case "quality": case "quality_check": return "质检";
                case "warehouse": case "warehousing": return "入库";
                case "production":                   break; // 继续按 progressStage 判断
            }
        }
        // 按 progressStage 文本匹配
        if (progressStage == null) return null;
        if (progressStage.contains("采购"))                                          return "采购";
        if (progressStage.contains("裁剪"))                                          return "裁剪";
        if (progressStage.contains("车缝") || progressStage.contains("尾部")
                || progressStage.contains("二次") || progressStage.contains("缝制"))  return "车缝";
        if (progressStage.contains("质检") || progressStage.contains("验收"))         return "质检";
        if (progressStage.contains("入库") || progressStage.contains("仓库"))        return "入库";
        return null;
    }
}
