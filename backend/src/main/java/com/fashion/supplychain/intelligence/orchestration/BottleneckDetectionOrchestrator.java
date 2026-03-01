package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.BottleneckDetectionRequest;
import com.fashion.supplychain.intelligence.dto.BottleneckDetectionResponse;
import com.fashion.supplychain.intelligence.dto.BottleneckDetectionResponse.BottleneckItem;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 工序瓶颈自动发现引擎
 *
 * <p>算法：比较生产流程中相邻工序的已完成件数，对于同一订单，
 * 若前道已完成件数远大于后道，则后道形成"积压瓶颈"。
 *
 * <pre>
 *   backlog = upstreamDone - currentDone
 *   severity:
 *     critical  — backlog ≥ 总件数 × 50%
 *     warning   — backlog ≥ 总件数 × 25%
 *     normal    — 其他
 * </pre>
 */
@Service
@Slf4j
public class BottleneckDetectionOrchestrator {

    /** 标准生产工序流转顺序 */
    private static final List<String> STAGE_ORDER = List.of(
            "采购", "裁剪", "二次工艺", "车缝", "尾部", "质检", "入库");

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    public BottleneckDetectionResponse detect(BottleneckDetectionRequest request) {
        BottleneckDetectionResponse response = new BottleneckDetectionResponse();

        Long tenantId = UserContext.tenantId();
        List<ProductionOrder> orders = loadActiveOrders(tenantId, request);
        if (orders.isEmpty()) {
            response.setSummary("暂无进行中的订单");
            return response;
        }

        List<String> orderIds = orders.stream()
                .map(ProductionOrder::getId).collect(Collectors.toList());

        // 批量查询所有订单的各工序完成件数
        List<Map<String, Object>> allAggs = scanRecordMapper.selectStageDoneAgg(orderIds);
        Map<String, Map<String, Integer>> orderStageMap = buildOrderStageMap(allAggs);

        // 逐订单分析瓶颈
        for (ProductionOrder order : orders) {
            Map<String, Integer> stageDone = orderStageMap
                    .getOrDefault(order.getId(), Collections.emptyMap());
            int totalQty = resolveTotalQty(order);
            if (totalQty <= 0) continue;

            analyzeOrderBottleneck(order, stageDone, totalQty, response);
        }

        // 按积压件数降序
        response.getBottlenecks().sort(
                Comparator.comparingInt(BottleneckItem::getBacklog).reversed());
        response.setHasBottleneck(!response.getBottlenecks().isEmpty());
        response.setSummary(buildSummary(response));
        return response;
    }

    // ── 私有方法 ──────────────────────────────────────────────────────────

    private void analyzeOrderBottleneck(ProductionOrder order,
            Map<String, Integer> stageDone, int totalQty,
            BottleneckDetectionResponse response) {

        for (int i = 1; i < STAGE_ORDER.size(); i++) {
            String upstream = STAGE_ORDER.get(i - 1);
            String current = STAGE_ORDER.get(i);
            int upDone = stageDone.getOrDefault(upstream, 0);
            int curDone = stageDone.getOrDefault(current, 0);
            int backlog = upDone - curDone;

            if (backlog <= 0) continue;

            String severity;
            if (backlog >= totalQty * 0.5) severity = "critical";
            else if (backlog >= totalQty * 0.25) severity = "warning";
            else continue; // 小于25%不报告

            BottleneckItem item = new BottleneckItem();
            item.setStageName(current);
            item.setUpstreamDone(upDone);
            item.setCurrentDone(curDone);
            item.setBacklog(backlog);
            item.setSeverity(severity);
            item.setSuggestion(buildSuggestion(current, backlog, order));
            response.getBottlenecks().add(item);
        }
    }

    private List<ProductionOrder> loadActiveOrders(Long tenantId,
            BottleneckDetectionRequest request) {
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq("delete_flag", 0)
          .in("status", "IN_PROGRESS", "PENDING");

        if (request != null && request.getOrderId() != null
                && !request.getOrderId().isBlank()) {
            qw.eq("id", request.getOrderId());
        }
        return productionOrderService.list(qw);
    }

    private Map<String, Map<String, Integer>> buildOrderStageMap(
            List<Map<String, Object>> aggs) {
        Map<String, Map<String, Integer>> result = new HashMap<>();
        if (aggs == null) return result;

        for (Map<String, Object> row : aggs) {
            String orderId = Objects.toString(row.get("orderId"), "");
            String stage = Objects.toString(row.get("stageName"), "");
            int done = row.get("doneQuantity") != null
                    ? Integer.parseInt(row.get("doneQuantity").toString()) : 0;

            result.computeIfAbsent(orderId, k -> new HashMap<>())
                    .merge(stage, done, Integer::sum);
        }
        return result;
    }

    private int resolveTotalQty(ProductionOrder order) {
        if (order.getCuttingQuantity() != null && order.getCuttingQuantity() > 0)
            return order.getCuttingQuantity();
        return order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
    }

    private String buildSuggestion(String stage, int backlog, ProductionOrder order) {
        return String.format("「%s」工序积压 %d 件（订单 %s），建议增加人手或调整排产",
                stage, backlog, order.getOrderNo());
    }

    private String buildSummary(BottleneckDetectionResponse response) {
        List<BottleneckItem> items = response.getBottlenecks();
        if (items.isEmpty()) return "当前所有工序流转顺畅，无明显瓶颈";
        long critical = items.stream().filter(i -> "critical".equals(i.getSeverity())).count();
        return String.format("发现 %d 个瓶颈工序（%d 个严重），请及时处理",
                items.size(), critical);
    }
}
