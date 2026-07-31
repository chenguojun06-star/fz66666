package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.entity.PayrollSettlementItem;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Component
public class PayrollSettlementItemBuilderHelper {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private PayrollSettlementNoGenerator settlementNoGenerator;

    public PayrollSettlement buildSettlement(PayrollSettlementQuery q) {
        LocalDateTime now = LocalDateTime.now();
        PayrollSettlement settlement = new PayrollSettlement();
        settlement.setSettlementNo(settlementNoGenerator.nextSettlementNo());
        settlement.setOrderId(q.getOrderId());
        settlement.setOrderNo(q.getOrderNo());
        settlement.setStyleNo(q.getStyleNo());
        settlement.setStartTime(q.getStartTime());
        settlement.setEndTime(q.getEndTime());
        settlement.setStatus("pending");
        settlement.setCreateTime(now);
        settlement.setUpdateTime(now);
        String uid = null;
        UserContext ctx = UserContext.get();
        if (ctx != null && StringUtils.hasText(ctx.getUserId())) {
            uid = ctx.getUserId().trim();
        }
        if (StringUtils.hasText(uid)) {
            settlement.setCreateBy(uid);
            settlement.setUpdateBy(uid);
        }
        return settlement;
    }

    public List<PayrollSettlementItem> buildSettlementItems(List<Map<String, Object>> rows, PayrollSettlement settlement) {
        Map<String, Map<String, String>> orderNoToProcessCodeMap = buildProcessCodeMapFromRows(rows);

        LocalDateTime now = LocalDateTime.now();
        List<PayrollSettlementItem> items = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if (row == null) continue;
            PayrollSettlementItem item = new PayrollSettlementItem();
            String opId = TextUtils.safeText(row.get("operatorId"));
            String opName = TextUtils.safeText(row.get("operatorName"));
            String processName = TextUtils.safeText(row.get("processName"));
            item.setOperatorId(StringUtils.hasText(opId) ? opId : "unknown");
            item.setOperatorName(StringUtils.hasText(opName) ? opName : "未知人员");
            item.setProcessName(StringUtils.hasText(processName) ? processName : "未知环节");
            Integer qty = PayrollSettlementQueryHelper.toInt(row.get("quantity"));
            BigDecimal amount = PayrollSettlementQueryHelper.toBigDecimal(row.get("totalAmount"));
            if (qty == null) qty = 0;
            if (amount == null) amount = BigDecimal.ZERO;
            item.setQuantity(qty);
            item.setTotalAmount(amount.setScale(2, RoundingMode.HALF_UP));
            // P1 修复对齐：优先直读 SQL 返回的 unitPrice（operatorSummary 已写入 row），避免反推精度损失
            BigDecimal storedUnitPrice = PayrollSettlementQueryHelper.toBigDecimal(row.get("unitPrice"));
            BigDecimal up;
            if (storedUnitPrice != null && storedUnitPrice.compareTo(BigDecimal.ZERO) > 0) {
                up = storedUnitPrice.setScale(2, RoundingMode.HALF_UP);
            } else if (qty > 0) {
                up = amount.divide(BigDecimal.valueOf(qty), 2, RoundingMode.HALF_UP);
            } else {
                up = BigDecimal.ZERO;
            }
            item.setUnitPrice(up);
            item.setOrderId(TextUtils.safeText(row.get("orderId")));
            item.setOrderNo(TextUtils.safeText(row.get("orderNo")));
            item.setStyleNo(TextUtils.safeText(row.get("styleNo")));
            item.setColor(TextUtils.safeText(row.get("color")));
            item.setSize(TextUtils.safeText(row.get("size")));

            String processCode = TextUtils.safeText(row.get("processCode"));
            if ((processCode.isEmpty() || processCode.equals(processName)) && !processName.isEmpty()) {
                String orderNo = TextUtils.safeText(row.get("orderNo"));
                Map<String, String> nameToCode = orderNoToProcessCodeMap.get(orderNo);
                if (nameToCode != null) {
                    String resolved = nameToCode.get(processName.trim());
                    if (resolved != null) processCode = resolved;
                }
            }
            item.setProcessCode(processCode);

            Object bundleNoRaw = row.get("cuttingBundleNo");
            if (bundleNoRaw instanceof Number num) {
                item.setCuttingBundleNo(num.intValue());
            }
            item.setScanType(TextUtils.safeText(row.get("scanType")));
            // P1 修复：明细级精确追溯 ID
            item.setScanRecordIds(TextUtils.safeText(row.get("scanRecordIds")));
            item.setTrackingIds(TextUtils.safeText(row.get("trackingIds")));
            item.setCreateTime(now);
            item.setUpdateTime(now);
            items.add(item);
        }
        return items;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Map<String, String>> buildProcessCodeMapFromRows(List<Map<String, Object>> rows) {
        Map<String, Map<String, String>> result = new HashMap<>();
        Set<String> orderNos = new HashSet<>();
        for (Map<String, Object> row : rows) {
            String on = TextUtils.safeText(row.get("orderNo"));
            if (!on.isEmpty()) orderNos.add(on);
        }
        if (orderNos.isEmpty()) return result;
        try {
            List<ProductionOrder> orders = productionOrderService.list(
                    new QueryWrapper<ProductionOrder>()
                            .in("order_no", orderNos)
                            .eq("tenant_id", UserContext.tenantId())
                            .last("LIMIT 5000"));
            for (ProductionOrder order : orders) {
                String wf = order.getProgressWorkflowJson();
                if (wf == null || wf.trim().isEmpty()) continue;
                try {
                    com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                    Map<String, Object> workflow = mapper.readValue(wf, Map.class);
                    Object nodesObj = workflow.get("nodes");
                    if (!(nodesObj instanceof List)) continue;
                    List<Map<String, Object>> nodeList = (List<Map<String, Object>>) nodesObj;
                    Map<String, String> nameToCode = new HashMap<>();
                    for (Map<String, Object> node : nodeList) {
                        String name = node.get("name") != null ? node.get("name").toString().trim() : "";
                        String id = node.get("id") != null ? node.get("id").toString().trim() : "";
                        if (!name.isEmpty() && !id.isEmpty() && !id.equals(name)) {
                            nameToCode.put(name, id);
                        }
                    }
                    if (!nameToCode.isEmpty()) result.put(order.getOrderNo(), nameToCode);
                } catch (com.fasterxml.jackson.core.JsonProcessingException jpe) {
                    log.warn("[PayrollSettlement] 解析订单 workflow JSON 失败 (跳过该订单 processCode 回填): orderNo={}, err={}",
                            order.getOrderNo(), jpe.getMessage());
                } catch (Exception e) {
                    log.warn("[PayrollSettlement] 解析订单 workflow 发生异常: orderNo={}, err={}",
                            order.getOrderNo(), e.getMessage());
                }
            }
        } catch (Exception e) {
            // 工资单价计算关键路径：批量查询订单失败会导致 processCode 无法回填，
            // 进而导致 unitPrice 反推精度损失（详见 buildSettlementItems 注释）。
            // 必须记录告警，便于排查为何部分工资单价的 processCode 缺失。
            log.warn("[PayrollSettlement] 批量查询订单构建 processCode 映射失败 (可能影响工资单价精度): orderNos={}, err={}",
                    orderNos, e.getMessage());
        }
        return result;
    }
}
