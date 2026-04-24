package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.mapper.ShipmentReconciliationMapper;
import com.fashion.supplychain.intelligence.dto.ReconciliationAnomalyResponse;
import com.fashion.supplychain.intelligence.dto.ReconciliationAnomalyResponse.ReconciliationAnomalyItem;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * B5 - 对账异常优先级编排器
 * 扫描挂单中/审核中的对账单，识别高扣款、低利润、超时挂单三类异常，
 * 按优先分 = |扣款额| × 挂账天数 × 类型权重 降序排列，供智能驾驶舱展示。
 */
@Service
@Slf4j
public class ReconciliationAnomalyOrchestrator {

    private static final BigDecimal HIGH_DEDUCTION_RATIO = new BigDecimal("0.05"); // 扣款 > 总额 5%
    private static final BigDecimal LOW_PROFIT_THRESHOLD = new BigDecimal("5.00"); // 利润率 < 5%
    private static final int OVERDUE_PENDING_DAYS = 7;                              // 挂单 > 7 天
    private static final List<String> PENDING_STATUSES =
            Arrays.asList("PENDING", "UNDER_REVIEW", "SUBMITTED");

    @Autowired
    private ShipmentReconciliationMapper shipmentReconciliationMapper;

    public ReconciliationAnomalyResponse analyze() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LocalDateTime now = LocalDateTime.now();

        QueryWrapper<ShipmentReconciliation> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
                .in("status", PENDING_STATUSES)
                .eq("delete_flag", 0)
                .orderByDesc("create_time");
        List<ShipmentReconciliation> records = shipmentReconciliationMapper.selectList(qw);

        List<ReconciliationAnomalyItem> items = new ArrayList<>();
        for (ShipmentReconciliation r : records) {
            List<ReconciliationAnomalyItem> detected = detectAnomalies(r, now);
            items.addAll(detected);
        }

        // 按优先分降序排列，取前 50
        items.sort((a, b) -> Double.compare(b.getPriorityScore(), a.getPriorityScore()));
        List<ReconciliationAnomalyItem> top = items.size() > 50 ? items.subList(0, 50) : items;

        ReconciliationAnomalyResponse resp = new ReconciliationAnomalyResponse();
        resp.setTotalChecked(records.size());
        resp.setAnomalyCount(top.size());
        resp.setItems(top);
        log.debug("[ReconciliationAnomaly] tenantId={} checked={} anomalies={}",
                tenantId, records.size(), top.size());
        return resp;
    }

    private List<ReconciliationAnomalyItem> detectAnomalies(
            ShipmentReconciliation r, LocalDateTime now) {
        List<ReconciliationAnomalyItem> found = new ArrayList<>();
        int pendingDays = (int) ChronoUnit.DAYS.between(
                r.getCreateTime() != null ? r.getCreateTime() : now, now);
        if (pendingDays < 0) pendingDays = 0;

        BigDecimal totalAmount = r.getTotalAmount() != null ? r.getTotalAmount() : BigDecimal.ZERO;
        BigDecimal deduction = r.getDeductionAmount() != null ? r.getDeductionAmount() : BigDecimal.ZERO;
        BigDecimal profitMargin = r.getProfitMargin() != null ? r.getProfitMargin() : BigDecimal.ZERO;

        // 检测 high_deduction — 扣款 > 总额 5%
        if (totalAmount.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal deductRatio = deduction.abs().divide(totalAmount, 4, RoundingMode.HALF_UP);
            if (deductRatio.compareTo(HIGH_DEDUCTION_RATIO) >= 0) {
                double pct = deductRatio.multiply(new BigDecimal("100")).doubleValue();
                String desc = String.format("扣款金额 %.2f 占总额 %.1f%%，超出5%%阈值",
                        deduction.abs().doubleValue(), pct);
                found.add(buildItem(r, "high_deduction", desc, pendingDays, 1.8, now));
            }
        }

        // 检测 low_profit — 利润率 < 5%
        if (profitMargin.compareTo(LOW_PROFIT_THRESHOLD) < 0
                && profitMargin.compareTo(BigDecimal.ZERO) >= 0) {
            String desc = String.format("利润率 %.1f%% 低于5%%警戒线，建议复核成本",
                    profitMargin.doubleValue());
            found.add(buildItem(r, "low_profit", desc, pendingDays, 1.2, now));
        }

        // 检测 overdue_pending — 挂单超 7 天
        if (pendingDays >= OVERDUE_PENDING_DAYS) {
            String desc = String.format("已挂单 %d 天未结算，影响资金流转", pendingDays);
            found.add(buildItem(r, "overdue_pending", desc, pendingDays, 1.5, now));
        }

        return found;
    }

    private ReconciliationAnomalyItem buildItem(
            ShipmentReconciliation r, String anomalyType, String anomalyDesc,
            int pendingDays, double typeWeight, LocalDateTime now) {
        ReconciliationAnomalyItem item = new ReconciliationAnomalyItem();
        item.setReconciliationId(r.getId());
        item.setReconciliationNo(r.getReconciliationNo());
        item.setOrderNo(r.getOrderNo());
        item.setStyleNo(r.getStyleNo());
        item.setFactoryName(r.getCustomerName()); // 字段映射：客户名=工厂名
        item.setAnomalyType(anomalyType);
        item.setAnomalyDesc(anomalyDesc);
        item.setDeductionAmount(r.getDeductionAmount() != null
                ? r.getDeductionAmount().doubleValue() : 0.0);
        item.setProfitMarginPct(r.getProfitMargin() != null
                ? r.getProfitMargin().doubleValue() : 0.0);
        item.setStatus(r.getStatus());
        item.setCreateTime(r.getCreateTime() != null ? r.getCreateTime().toString() : "");
        item.setPendingDays(pendingDays);

        double baseAmount = r.getDeductionAmount() != null
                ? r.getDeductionAmount().abs().doubleValue() : 1.0;
        double score = baseAmount * (pendingDays + 1) * typeWeight / 10000.0;
        item.setPriorityScore(Math.round(score * 100.0) / 100.0);

        item.setAdvice(resolveAdvice(anomalyType, pendingDays));
        return item;
    }

    private String resolveAdvice(String anomalyType, int pendingDays) {
        return switch (anomalyType) {
            case "high_deduction" -> "建议财务核实扣款依据，与工厂协商扣款明细";
            case "low_profit" -> "建议核查工序成本分摊，如偏差大可启动复核流程";
            case "overdue_pending" -> pendingDays >= 14
                    ? "挂单已超14天，建议升级至主管审批结算"
                    : "建议催促工厂对账确认，加快资金回笼";
            default -> "请人工核实后处理";
        };
    }
}
