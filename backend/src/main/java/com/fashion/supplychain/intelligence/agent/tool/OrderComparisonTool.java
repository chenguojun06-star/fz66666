package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.production.entity.ScanRecord;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * AI对话工具 — 订单对比分析（功能 K）
 *
 * <p>针对"异常订单 vs 同款正常订单"的对比场景，找出该单为何比同类单耗时更长/成本更高/不良率更高。
 *
 * <p>触发关键词：对比这单 / 为什么这单异常 / 跟正常单比 / 这单出了什么问题
 *
 * <p>输入：orderNo（必填，异常订单号）
 * <br>输出：对比 JSON，包含：
 * <ul>
 *   <li>target: 目标订单基础信息 + 关键指标（总耗时/扫码次数/不良率/工人数）</li>
 *   <li>peers: 最多 3 条同款同尺码的正常订单作为对照组</li>
 *   <li>deltas: 逐项差异（target - peers 平均），正值=target 更差</li>
 *   <li>hints: 根据最大偏差项给出的排查方向提示</li>
 * </ul>
 */
@Slf4j
@Component
public class OrderComparisonTool extends AbstractAgentTool {

    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private ScanRecordService scanRecordService;

    @Override
    public String getName() {
        return "tool_order_comparison";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("orderNo", stringProp("要对比分析的异常订单号，例如 PO20260301001"));
        return buildToolDef(
                "对比异常订单与同款同尺码的正常订单差异，定位异常根因。"
                        + "当用户说'对比这单'、'为什么这单异常'、'跟正常单比'、'这单出了什么问题'时调用。"
                        + "返回目标订单、对照组、逐项偏差和排查方向。",
                properties, List.of("orderNo"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String orderNo = requireString(args, "orderNo");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 1) 定位目标订单
        ProductionOrder target = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getOrderNo, orderNo)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .select(ProductionOrder::getId, ProductionOrder::getOrderNo, ProductionOrder::getStyleNo,
                        ProductionOrder::getColor, ProductionOrder::getOrderQuantity, ProductionOrder::getProductionProgress,
                        ProductionOrder::getStatus, ProductionOrder::getExpectedShipDate, ProductionOrder::getCreateTime,
                        ProductionOrder::getFactoryName, ProductionOrder::getUrgencyLevel)
                .one();
        if (target == null) {
            return errorJson("订单 " + orderNo + " 不存在或无权限查看");
        }

        // 2) 拉取同款同颜色的其他订单（排除自身），优先取最近完成的
        LambdaQueryWrapper<ProductionOrder> peerQuery = new LambdaQueryWrapper<>();
        peerQuery.eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getStyleNo, target.getStyleNo())
                .ne(ProductionOrder::getOrderNo, orderNo)
                .in(ProductionOrder::getStatus, Arrays.asList("completed", "shipped"))
                .select(ProductionOrder::getId, ProductionOrder::getOrderNo, ProductionOrder::getOrderQuantity,
                        ProductionOrder::getProductionProgress, ProductionOrder::getCreateTime,
                        ProductionOrder::getExpectedShipDate, ProductionOrder::getFactoryName)
                .orderByDesc(ProductionOrder::getCreateTime)
                .last("LIMIT 3");
        List<ProductionOrder> peers = productionOrderService.list(peerQuery);

        if (peers.isEmpty()) {
            return successJson("未找到同款已完成订单作为对比基线",
                    Map.of("target", snapshotMap(target, null),
                            "peers", Collections.emptyList(),
                            "hints", List.of("暂无同款订单历史数据，建议等待 1-2 单完成后再对比")));
        }

        // 3) 计算目标与对照组的关键指标
        Map<String, Object> targetSnap = snapshotMap(target, computeOrderMetrics(target));
        List<Map<String, Object>> peerSnaps = new ArrayList<>();
        double avgCycleDays = 0, avgScanCount = 0, avgDefectRate = 0;
        int valid = 0;
        for (ProductionOrder p : peers) {
            Map<String, Object> pm = computeOrderMetrics(p);
            peerSnaps.add(snapshotMap(p, pm));
            Number cd = (Number) pm.getOrDefault("cycleDays", 0);
            Number sc = (Number) pm.getOrDefault("scanCount", 0);
            Number dr = (Number) pm.getOrDefault("defectRate", 0.0);
            avgCycleDays += cd.doubleValue();
            avgScanCount += sc.doubleValue();
            avgDefectRate += dr.doubleValue();
            valid++;
        }
        if (valid > 0) {
            avgCycleDays /= valid;
            avgScanCount /= valid;
            avgDefectRate /= valid;
        }

        // 4) 计算偏差（target - peer 平均），正值=target 更差
        Map<String, Object> targetMetrics = computeOrderMetrics(target);
        Map<String, Object> deltas = new LinkedHashMap<>();
        deltas.put("cycleDaysDelta", ((Number) targetMetrics.getOrDefault("cycleDays", 0)).doubleValue() - avgCycleDays);
        deltas.put("scanCountDelta", ((Number) targetMetrics.getOrDefault("scanCount", 0)).doubleValue() - avgScanCount);
        deltas.put("defectRateDelta", ((Number) targetMetrics.getOrDefault("defectRate", 0.0)).doubleValue() - avgDefectRate);

        // 5) 生成排查提示（依据最大偏差项）
        List<String> hints = new ArrayList<>();
        double cd = (double) deltas.get("cycleDaysDelta");
        double dr = (double) deltas.get("defectRateDelta");
        double sc = (double) deltas.get("scanCountDelta");
        if (cd > 3) hints.add("生产周期比同款平均多 " + String.format("%.1f", cd) + " 天，建议检查是否有工序卡点或工厂排产延误");
        if (dr > 0.02) hints.add("不良率比同款平均高 " + String.format("%.1f", dr * 100) + "%，建议抽查质检记录和工厂操作员");
        if (sc > 10) hints.add("扫码次数比平均多 " + String.format("%.0f", sc) + " 次，可能存在反复返工或重复扫码");
        if (hints.isEmpty()) hints.add("各项指标与同款接近，未发现明显异常。可进一步看扫码时间分布或工资占比。");

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("target", targetSnap);
        data.put("peers", peerSnaps);
        data.put("peerAverages", Map.of("cycleDays", avgCycleDays, "scanCount", avgScanCount, "defectRate", avgDefectRate));
        data.put("deltas", deltas);
        data.put("hints", hints);
        return successJson("对比完成，共对比 " + peers.size() + " 条同款订单", data);
    }

    /** 计算订单的关键指标：周期天数、扫码次数、不良率 */
    private Map<String, Object> computeOrderMetrics(ProductionOrder order) {
        Map<String, Object> m = new LinkedHashMap<>();
        // 周期天数：createTime 到 expectedShipDate（或 now）
        if (order.getCreateTime() != null) {
            LocalDateTime end = order.getExpectedShipDate() != null
                    ? order.getExpectedShipDate().atStartOfDay() : LocalDateTime.now();
            long days = ChronoUnit.DAYS.between(order.getCreateTime(), end);
            m.put("cycleDays", Math.max(0, days));
        } else {
            m.put("cycleDays", 0);
        }

        // 扫码次数与不良率
        try {
            List<ScanRecord> scans = scanRecordService.lambdaQuery()
                    .eq(ScanRecord::getOrderId, order.getId())
                    .ne(ScanRecord::getScanType, "orchestration")
                    .eq(ScanRecord::getTenantId, UserContext.tenantId())
                    .select(ScanRecord::getScanResult, ScanRecord::getQuantity)
                    .list();
            int total = scans.size();
            long failCount = scans.stream().filter(s -> "fail".equalsIgnoreCase(s.getScanResult())).count();
            m.put("scanCount", total);
            m.put("defectRate", total > 0 ? (double) failCount / total : 0.0);
        } catch (Exception e) {
            log.debug("[OrderComparison] 扫码记录查询失败: {}", e.getMessage());
            m.put("scanCount", 0);
            m.put("defectRate", 0.0);
        }
        return m;
    }

    private Map<String, Object> snapshotMap(ProductionOrder o, Map<String, Object> metrics) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("orderNo", o.getOrderNo());
        m.put("styleNo", o.getStyleNo());
        m.put("color", o.getColor());
        m.put("orderQuantity", o.getOrderQuantity());
        m.put("progress", o.getProductionProgress());
        m.put("status", o.getStatus());
        m.put("factory", o.getFactoryName());
        m.put("expectedShipDate", o.getExpectedShipDate());
        if (metrics != null) m.putAll(metrics);
        return m;
    }
}
