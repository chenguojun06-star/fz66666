package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.LiveCostResponse;
import com.fashion.supplychain.intelligence.dto.LiveCostResponse.ProcessCostItem;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.util.OrderPricingSnapshotUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 实时成本追踪编排器
 *
 * <p>计算逻辑：
 * <ol>
 *   <li>从 production_process_json 中解析各工序单价</li>
 *   <li>从 t_scan_record 中统计各工序已完成件数</li>
 *   <li>已发生成本 = Σ (工序单价 × 已扫码件数)</li>
 *   <li>利润率 = (报价收入 - 预估成本) / 报价收入</li>
 * </ol>
 */
@Service
@Slf4j
public class LiveCostTrackerOrchestrator {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    public LiveCostResponse track(String orderId) {
        LiveCostResponse resp = new LiveCostResponse();
        try {
            TenantAssert.assertTenantContext();
            Long tenantId = UserContext.tenantId();

            // 1. 加载订单
            ProductionOrder order = productionOrderMapper.selectById(orderId);
            if (order == null || !tenantId.equals(order.getTenantId())) {
                resp.setSuggestion("订单不存在或无权访问");
                return resp;
            }

            resp.setOrderNo(order.getOrderNo());
            resp.setStyleNo(order.getStyleNo());
            resp.setFactoryName(order.getFactoryName());
            int totalQty = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
            resp.setOrderQuantity(totalQty);

            // 2. 解析工序单价表（从 progressWorkflowJson 中的 nodes 解析）
            Map<String, BigDecimal> processPriceMap = parseProcessPrices(order.getProgressWorkflowJson());

            // 3. 加载扫码记录，按工序统计成功件数
            QueryWrapper<ScanRecord> sq = new QueryWrapper<>();
            sq.eq("order_id", String.valueOf(order.getId()))
              .eq("scan_result", "success")
              .ne("scan_type", "orchestration");
            List<ScanRecord> records = scanRecordMapper.selectList(sq);

            Map<String, Integer> processQtyMap = new LinkedHashMap<>();
            int totalCompleted = 0;
            for (ScanRecord r : records) {
                String pName = r.getProcessName();
                if (pName == null || pName.isBlank()) pName = r.getProgressStage();
                if (pName == null) continue;
                int qty = r.getQuantity() != null ? r.getQuantity() : 0;
                processQtyMap.merge(pName, qty, Integer::sum);
                totalCompleted += qty;
            }
            // 按件数去重（取最大）
            int completedQty = order.getCompletedQuantity() != null
                    ? order.getCompletedQuantity() : totalCompleted / Math.max(1, processPriceMap.size());
            resp.setCompletedQty(Math.min(completedQty, totalQty));

            // 4. 计算各工序成本
            BigDecimal actualCost = BigDecimal.ZERO;
            BigDecimal estimatedCost = BigDecimal.ZERO;
            List<ProcessCostItem> breakdown = new ArrayList<>();

            for (Map.Entry<String, BigDecimal> e : processPriceMap.entrySet()) {
                String proc = e.getKey();
                BigDecimal price = e.getValue();
                int scanned = processQtyMap.getOrDefault(proc, 0);

                ProcessCostItem item = new ProcessCostItem();
                item.setProcessName(proc);
                item.setUnitPrice(price);
                item.setScannedQty(scanned);
                BigDecimal itemCost = price.multiply(BigDecimal.valueOf(scanned));
                item.setCost(itemCost.setScale(2, RoundingMode.HALF_UP));
                item.setProgress(totalQty > 0 ? Math.min(100, scanned * 100 / totalQty) : 0);
                breakdown.add(item);

                actualCost = actualCost.add(itemCost);
                estimatedCost = estimatedCost.add(price.multiply(BigDecimal.valueOf(totalQty)));
            }
            resp.setProcessBreakdown(breakdown);

            // 如果没有工序配置，用factoryUnitPrice兜底
            if (processPriceMap.isEmpty() && order.getFactoryUnitPrice() != null) {
                estimatedCost = order.getFactoryUnitPrice().multiply(BigDecimal.valueOf(totalQty));
                actualCost = order.getFactoryUnitPrice().multiply(BigDecimal.valueOf(resp.getCompletedQty()));
            }

            resp.setActualLaborCost(actualCost.setScale(2, RoundingMode.HALF_UP));
            resp.setEstimatedLaborCost(estimatedCost.setScale(2, RoundingMode.HALF_UP));

            // 5. 收入和利润
            BigDecimal lockedOrderUnitPrice = OrderPricingSnapshotUtils.resolveLockedOrderUnitPrice(
                    order.getFactoryUnitPrice(),
                    order.getOrderDetails());
            BigDecimal revenue = lockedOrderUnitPrice.multiply(BigDecimal.valueOf(totalQty));
            resp.setEstimatedRevenue(revenue.setScale(2, RoundingMode.HALF_UP));

            BigDecimal profit = revenue.subtract(estimatedCost);
            resp.setEstimatedProfit(profit.setScale(2, RoundingMode.HALF_UP));

            if (revenue.compareTo(BigDecimal.ZERO) > 0) {
                BigDecimal margin = profit.divide(revenue, 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100));
                resp.setProfitMargin(margin.setScale(1, RoundingMode.HALF_UP));
            } else {
                resp.setProfitMargin(BigDecimal.ZERO);
            }

            // 6. 成本进度
            int costProgress = estimatedCost.compareTo(BigDecimal.ZERO) > 0
                    ? actualCost.divide(estimatedCost, 2, RoundingMode.HALF_UP)
                          .multiply(BigDecimal.valueOf(100)).intValue()
                    : 0;
            resp.setCostProgress(Math.min(100, costProgress));

            // 7. 状态和建议
            int prodProgress = order.getProductionProgress() != null ? order.getProductionProgress() : 0;
            String status;
            String suggestion;
            if (costProgress > prodProgress + 15) {
                status = "OVER_BUDGET";
                suggestion = String.format("⚠️ 成本进度超出生产进度 %d%%，请检查工序单价或扫码数据", costProgress - prodProgress);
            } else if (costProgress < prodProgress - 20) {
                status = "UNDER_BUDGET";
                suggestion = "✅ 成本控制良好，生产进度领先于成本消耗";
            } else {
                status = "ON_TRACK";
                suggestion = String.format("📊 成本节奏正常，当前利润率预估 %.1f%%",
                        resp.getProfitMargin() != null ? resp.getProfitMargin().doubleValue() : 0);
            }
            resp.setCostStatus(status);
            resp.setSuggestion(suggestion);

        } catch (Exception e) {
            log.error("[实时成本追踪] orderId={} 异常: {}", orderId, e.getMessage(), e);
            resp.setSuggestion("成本分析异常，请稍后重试");
            resp.setCostStatus("ON_TRACK");
        }
        return resp;
    }

    /**
     * 从 progressWorkflowJson 解析工序名→单价映射
     * 支持结构：{ "nodes": [{"name":"...", "unitPrice":...}] } 或直接数组 [{"name":"...", "unitPrice":...}]
     */
    private Map<String, BigDecimal> parseProcessPrices(String json) {
        Map<String, BigDecimal> map = new LinkedHashMap<>();
        if (json == null || json.isBlank()) return map;
        try {
            JsonNode root = MAPPER.readTree(json);
            JsonNode arr = root.isArray() ? root : root.path("nodes");
            if (arr.isArray()) {
                for (JsonNode node : arr) {
                    String name = node.path("name").asText(null);
                    double price = node.path("unitPrice").asDouble(0);
                    if (price <= 0) price = node.path("price").asDouble(0);
                    if (name != null && !name.isBlank() && price > 0) {
                        map.put(name, BigDecimal.valueOf(price));
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[成本追踪] 解析工序JSON失败: {}", e.getMessage());
        }
        return map;
    }
}
