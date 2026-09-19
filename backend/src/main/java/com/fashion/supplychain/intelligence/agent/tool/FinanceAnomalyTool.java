package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.entity.WagePayment;
import com.fashion.supplychain.finance.service.BillAggregationService;
import com.fashion.supplychain.finance.service.WagePaymentService;
import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * D-474 财务异常检测工具（AI 可用）。
 *
 * <p>原有的 tool_anomaly_detection 只覆盖生产 4 维度（产量飙升/质量异常/工人闲置/夜间扫码），
 * 财务域完全没有信号。这个工具补齐收付款侧的风险识别，全部只读，不做任何写操作：
 * <ul>
 *   <li>长期挂账：部分付款后迟迟没付清（结算中超过 60 天）</li>
 *   <li>金额突增：某对象本月账单合计超过前 3 个月均值 2 倍</li>
 *   <li>账实不符：已结清的账单没有对应付款记录</li>
 *   <li>疑似重复：同对象、同来源、同金额、同月存在多笔未取消账单</li>
 *   <li>扣款异常：某对象本月扣款占比超过 30%</li>
 * </ul>
 */
@Slf4j
@Component
@Lazy
@AgentToolDef(name = "tool_finance_anomaly", description = "财务异常检测工具，识别长期挂账/金额突增/账实不符/疑似重复账单/扣款异常，自动发现收付款中的风险信号", domain = ToolDomain.FINANCE)
public class FinanceAnomalyTool extends AbstractAgentTool {

    @Autowired(required = false)
    private BillAggregationService billAggregationService;

    @Autowired(required = false)
    private WagePaymentService wagePaymentService;

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter MONTH_FMT = DateTimeFormatter.ofPattern("yyyy-MM");
    private static final long LONG_PENDING_DAYS = 60L;

    @Override
    public String getName() {
        return "tool_finance_anomaly";
    }

    @Override
    public AiTool getToolDefinition() {
        AiTool tool = new AiTool();
        AiTool.AiFunction fn = new AiTool.AiFunction();
        fn.setName(getName());
        fn.setDescription("财务异常检测工具：识别长期挂账（部分付款后超过60天未付清）、金额突增（本月超过前3个月均值2倍）、"
                + "账实不符（已结清却没有付款记录）、疑似重复账单、扣款占比异常。"
                + "当用户问\"财务有没有异常\"\"收付款有问题吗\"\"有没有账单不对\"\"谁的钱还没付\"时调用此工具。无需参数。");
        AiTool.AiParameters params = new AiTool.AiParameters();
        params.setProperties(new LinkedHashMap<>());
        fn.setParameters(params);
        tool.setFunction(fn);
        return tool;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return errorJson("缺少租户上下文，无法进行财务异常检测");
        }
        if (billAggregationService == null) {
            return errorJson("账单服务不可用");
        }
        try {
            log.info("[FinanceAnomalyTool] 执行财务异常检测, tenantId={}", tenantId);

            List<BillAggregation> bills = billAggregationService.lambdaQuery()
                    .eq(BillAggregation::getTenantId, tenantId)
                    .eq(BillAggregation::getDeleteFlag, 0)
                    .last("LIMIT 2000")
                    .list();
            if (bills == null) {
                bills = new ArrayList<>();
            }

            String thisMonth = LocalDate.now().format(MONTH_FMT);
            String lastMonth = LocalDate.now().minusMonths(1).format(MONTH_FMT);
            String twoMonthsAgo = LocalDate.now().minusMonths(2).format(MONTH_FMT);
            String threeMonthsAgo = LocalDate.now().minusMonths(3).format(MONTH_FMT);

            List<Map<String, Object>> anomalies = new ArrayList<>();
            anomalies.addAll(detectLongPending(bills));
            anomalies.addAll(detectAmountSurge(bills, thisMonth, lastMonth, twoMonthsAgo, threeMonthsAgo));
            anomalies.addAll(detectMissingPayment(bills, tenantId));
            anomalies.addAll(detectDuplicates(bills));
            anomalies.addAll(detectDeductionRatio(bills, thisMonth));

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("totalChecked", bills.size());
            result.put("anomalyCount", anomalies.size());
            result.put("anomalies", anomalies);
            if (!anomalies.isEmpty()) {
                long critical = anomalies.stream().filter(a -> "critical".equals(a.get("severity"))).count();
                long warning = anomalies.stream().filter(a -> "warning".equals(a.get("severity"))).count();
                result.put("alert", critical > 0
                        ? "🔴 发现 " + critical + " 个严重财务异常 + " + warning + " 个警告"
                        : "🟡 发现 " + warning + " 个财务警告");
            } else {
                result.put("summary", "✅ 收付款未发现异常");
            }
            return JSON.writeValueAsString(result);
        } catch (Exception e) {
            log.error("[FinanceAnomalyTool] 财务异常检测失败", e);
            return errorJson("财务异常检测失败: " + e.getMessage());
        }
    }

    /** 长期挂账：部分付款后超过 60 天仍未付清 */
    private List<Map<String, Object>> detectLongPending(List<BillAggregation> bills) {
        List<Map<String, Object>> out = new ArrayList<>();
        LocalDate limit = LocalDate.now().minusDays(LONG_PENDING_DAYS);
        for (BillAggregation b : bills) {
            if (!"SETTLING".equals(b.getStatus())) {
                continue;
            }
            LocalDate base = b.getSettledAt() != null ? b.getSettledAt().toLocalDate()
                    : (b.getUpdateTime() != null ? b.getUpdateTime().toLocalDate() : null);
            if (base == null || base.isAfter(limit)) {
                continue;
            }
            BigDecimal rest = (b.getAmount() != null ? b.getAmount() : BigDecimal.ZERO)
                    .subtract(b.getSettledAmount() != null ? b.getSettledAmount() : BigDecimal.ZERO);
            out.add(item("warning", "长期挂账", b.getCounterpartyName(),
                    b.getBillNo() + " 已挂账 " + java.time.temporal.ChronoUnit.DAYS.between(base, LocalDate.now())
                            + " 天，剩余未付 ¥" + rest));
        }
        return out;
    }

    /** 金额突增：本月合计 > 前 3 个月均值 × 2 */
    private List<Map<String, Object>> detectAmountSurge(List<BillAggregation> bills, String thisMonth,
                                                        String m1, String m2, String m3) {
        List<Map<String, Object>> out = new ArrayList<>();
        Map<String, BigDecimal> cur = new LinkedHashMap<>();
        Map<String, BigDecimal> hist = new LinkedHashMap<>();
        for (BillAggregation b : bills) {
            if (b.getCounterpartyName() == null || b.getAmount() == null) {
                continue;
            }
            if ("CANCELLED".equals(b.getStatus())) {
                continue;
            }
            String m = b.getSettlementMonth();
            BigDecimal amt = b.getAmount();
            if (thisMonth.equals(m)) {
                cur.merge(b.getCounterpartyName(), amt, BigDecimal::add);
            } else if (m1.equals(m) || m2.equals(m) || m3.equals(m)) {
                hist.merge(b.getCounterpartyName(), amt, BigDecimal::add);
            }
        }
        for (Map.Entry<String, BigDecimal> e : cur.entrySet()) {
            BigDecimal avg = hist.getOrDefault(e.getKey(), BigDecimal.ZERO)
                    .divide(BigDecimal.valueOf(3), 2, java.math.RoundingMode.HALF_UP);
            if (avg.compareTo(BigDecimal.ZERO) > 0 && e.getValue().compareTo(avg.multiply(BigDecimal.valueOf(2))) > 0) {
                out.add(item("warning", "金额突增", e.getKey(),
                        "本月 ¥" + e.getValue() + "，前 3 个月月均 ¥" + avg + "（超过 2 倍）"));
            }
        }
        return out;
    }

    /** 账实不符：已结清却没有付款记录 */
    private List<Map<String, Object>> detectMissingPayment(List<BillAggregation> bills, Long tenantId) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (wagePaymentService == null) {
            return out;
        }
        for (BillAggregation b : bills) {
            if (!"SETTLED".equals(b.getStatus())) {
                continue;
            }
            boolean has = wagePaymentService.lambdaQuery()
                    .eq(WagePayment::getTenantId, tenantId)
                    .eq(WagePayment::getBizId, b.getId())
                    .ne(WagePayment::getStatus, "cancelled")
                    .last("LIMIT 1")
                    .one() != null;
            if (!has) {
                out.add(item("critical", "账实不符", b.getCounterpartyName(),
                        b.getBillNo() + " 已结清（¥" + b.getSettledAmount() + "）但付款记录缺失"));
            }
        }
        return out;
    }

    /** 疑似重复：同对象 + 同来源 + 同金额 + 同月 的多笔未取消账单 */
    private List<Map<String, Object>> detectDuplicates(List<BillAggregation> bills) {
        List<Map<String, Object>> out = new ArrayList<>();
        Map<String, List<BillAggregation>> group = new LinkedHashMap<>();
        for (BillAggregation b : bills) {
            if ("CANCELLED".equals(b.getStatus()) || b.getAmount() == null) {
                continue;
            }
            String key = b.getCounterpartyName() + "|" + b.getSourceType() + "|" + b.getAmount()
                    + "|" + b.getSettlementMonth();
            group.computeIfAbsent(key, k -> new ArrayList<>()).add(b);
        }
        for (Map.Entry<String, List<BillAggregation>> e : group.entrySet()) {
            if (e.getValue().size() > 1) {
                List<String> nos = new ArrayList<>();
                for (BillAggregation b : e.getValue()) {
                    nos.add(String.valueOf(b.getBillNo()));
                }
                out.add(item("critical", "疑似重复账单", e.getValue().get(0).getCounterpartyName(),
                        String.join("、", nos) + " 金额与来源完全相同（¥" + e.getValue().get(0).getAmount() + "）"));
            }
        }
        return out;
    }

    /** 扣款占比异常：本月扣款合计占该对象账单总额 30% 以上 */
    private List<Map<String, Object>> detectDeductionRatio(List<BillAggregation> bills, String thisMonth) {
        List<Map<String, Object>> out = new ArrayList<>();
        Map<String, BigDecimal> total = new LinkedHashMap<>();
        Map<String, BigDecimal> deduction = new LinkedHashMap<>();
        for (BillAggregation b : bills) {
            if (b.getCounterpartyName() == null || b.getAmount() == null || "CANCELLED".equals(b.getStatus())) {
                continue;
            }
            if (!thisMonth.equals(b.getSettlementMonth())) {
                continue;
            }
            BigDecimal abs = b.getAmount().abs();
            total.merge(b.getCounterpartyName(), abs, BigDecimal::add);
            if (b.getAmount().compareTo(BigDecimal.ZERO) < 0 || "DEDUCTION".equals(b.getBillCategory())) {
                deduction.merge(b.getCounterpartyName(), abs, BigDecimal::add);
            }
        }
        for (Map.Entry<String, BigDecimal> e : deduction.entrySet()) {
            BigDecimal t = total.getOrDefault(e.getKey(), BigDecimal.ZERO);
            if (t.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            if (e.getValue().multiply(BigDecimal.valueOf(100))
                    .divide(t, 2, java.math.RoundingMode.HALF_UP).compareTo(BigDecimal.valueOf(30)) > 0) {
                out.add(item("warning", "扣款占比异常", e.getKey(),
                        "本月扣款 ¥" + e.getValue() + "，占其账单 ¥" + t + " 的 30% 以上"));
            }
        }
        return out;
    }

    private Map<String, Object> item(String severity, String type, String target, String desc) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("severity", severity);
        m.put("type", type);
        m.put("targetName", target);
        m.put("description", desc);
        return m;
    }
}
