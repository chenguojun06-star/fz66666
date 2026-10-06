package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * D-754：财务三方一致性审计（账单 ↔ 应付单 ↔ 付款）。
 *
 * <p>补上「对不上自动预警」这块最关键的空白：此前 FinanceDataConsistencyJob 只补缺失单据，
 * 金额对不上（超付/账单与应付金额漂移/两边已付口径分叉）没有任何检测，全靠人眼对账发现。</p>
 *
 * <p>检测三类差异（数据全部现成，纯计算）：</p>
 * <ol>
 *   <li>超付：应付单 paidAmount &gt; amount</li>
 *   <li>金额漂移：应付单与来源账单 amount 不一致（账单改了应付没跟着改）</li>
 *   <li>已付口径分叉：账单 settledAmount 与关联应付 paidAmount 不一致</li>
 * </ol>
 *
 * <p>发现即建 FINANCE_DIFF 工单（每租户每天最多一张，24h 去重由闭环层保证）。</p>
 */
@Slf4j
@Component
public class FinanceConsistencyAuditJob extends AbstractPatrolJob {

    private static final BigDecimal TOLERANCE = new BigDecimal("0.01");

    @Scheduled(cron = "0 50 6 * * ?")
    public void patrol() {
        log.info("[FinanceAudit] ===== 财务三方一致性审计开始 =====");
        var tenants = getActiveTenantIds();
        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "finance-audit",
                        "财务审计：账单/应付/付款三方一致性核查");
                long s1 = System.currentTimeMillis();

                List<Map<String, Object>> diffs = auditTenant(tenantId);
                if (!diffs.isEmpty() && isPatrolEnabledForTenant(tenantId)) {
                    String sample = diffs.stream()
                            .map(d -> String.valueOf(d.get("summary")))
                            .limit(5)
                            .collect(Collectors.joining("；"));
                    String issue = String.format("财务审计：发现 %d 处账单/应付/付款金额不一致（超付/金额漂移/已付分叉），示例：%s",
                            diffs.size(), sample);
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("action", "finance_diff_alert");
                    payload.put("diffs", diffs);
                    String payloadJson;
                    try {
                        payloadJson = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(payload);
                    } catch (Exception e) {
                        payloadJson = "{\"action\":\"finance_diff_alert\"}";
                    }
                    final String json = payloadJson;
                    withTenantContext(tenantId, () -> patrolOrchestrator.createAction(
                            "FINANCE_CONSISTENCY_JOB", issue, "FINANCE_DIFF",
                            "HIGH", "finance", "tenant-finance-audit", json,
                            BigDecimal.valueOf(0.95), "NEED_APPROVAL"));
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "finance_consistency_audit",
                        String.format("三方一致性核查完成，发现 %d 处差异", diffs.size()),
                        System.currentTimeMillis() - s1, true);
                finishAndSnapshot(tenantId, commandId, "finance-audit", "财务审计",
                        String.format("财务三方一致性审计完成，发现 %d 处差异", diffs.size()),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[FinanceAudit] 租户{} 审计异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "审计异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[FinanceAudit] ===== 财务三方一致性审计完成 =====");
    }

    /** 单租户三方核查，返回差异明细（每条含 type/payableNo/billNo/summary） */
    private List<Map<String, Object>> auditTenant(Long tenantId) {
        try {
            // 关联应付单与其来源账单，一次联查带出三方金额
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT p.payable_no, p.amount AS payable_amount, p.paid_amount, " +
                    "       b.bill_no, b.amount AS bill_amount, b.settled_amount, b.counterparty_name " +
                    "FROM t_payable p " +
                    "JOIN t_bill_aggregation b ON b.id = p.bill_aggregation_id " +
                    "WHERE p.tenant_id = ? AND p.delete_flag = 0 AND b.delete_flag = 0 " +
                    "LIMIT 2000", tenantId);

            return rows.stream()
                    .map(this::classifyDiff)
                    .filter(java.util.Objects::nonNull)
                    .limit(20)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[FinanceAudit] 租户{} 三方联查失败: {}", tenantId, e.getMessage());
            return List.of();
        }
    }

    private Map<String, Object> classifyDiff(Map<String, Object> r) {
        BigDecimal payableAmount = toDecimal(r.get("payable_amount"));
        BigDecimal paidAmount = toDecimal(r.get("paid_amount"));
        BigDecimal billAmount = toDecimal(r.get("bill_amount"));
        BigDecimal settledAmount = toDecimal(r.get("settled_amount"));
        String payableNo = String.valueOf(r.getOrDefault("payable_no", "-"));
        String billNo = String.valueOf(r.getOrDefault("bill_no", "-"));
        String counterparty = String.valueOf(r.getOrDefault("counterparty_name", "-"));

        String type = null;
        String detail = null;
        if (paidAmount != null && payableAmount != null
                && paidAmount.compareTo(payableAmount.add(TOLERANCE)) > 0) {
            type = "OVERPAID";
            detail = String.format("超付：已付 %s 超过应付 %s", paidAmount, payableAmount);
        } else if (payableAmount != null && billAmount != null
                && payableAmount.subtract(billAmount).abs().compareTo(TOLERANCE) > 0) {
            type = "AMOUNT_DRIFT";
            detail = String.format("金额漂移：应付单 %s 与来源账单 %s 不一致", payableAmount, billAmount);
        } else if (paidAmount != null && settledAmount != null
                && paidAmount.subtract(settledAmount).abs().compareTo(TOLERANCE) > 0) {
            type = "PAID_MISMATCH";
            detail = String.format("已付口径分叉：应付单已付 %s，账单已结转 %s", paidAmount, settledAmount);
        }
        if (type == null) {
            return null;
        }
        Map<String, Object> diff = new LinkedHashMap<>();
        diff.put("type", type);
        diff.put("payableNo", payableNo);
        diff.put("billNo", billNo);
        diff.put("counterparty", counterparty);
        diff.put("summary", String.format("%s（%s / 应付单 %s / 账单 %s / %s）", detail, counterparty, payableNo, billNo, type));
        return diff;
    }

    private BigDecimal toDecimal(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal bd) return bd;
        try {
            return new BigDecimal(String.valueOf(v));
        } catch (Exception e) {
            return null;
        }
    }
}
