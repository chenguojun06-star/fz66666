package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.orchestration.FinancialReportOrchestrator;
import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Slf4j
@Component
public class FinancialReportTool extends AbstractAgentTool {

    @Autowired
    private FinancialReportOrchestrator financialReportOrchestrator;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: profit_loss | balance_sheet | cash_flow | profit_trend(利润环比) | health_check(健康诊断)"));
        properties.put("startDate", stringProp("开始日期(yyyy-MM-dd)，默认本月1号"));
        properties.put("endDate", stringProp("结束日期(yyyy-MM-dd)，默认今天"));
        properties.put("asOfDate", stringProp("截止日期(yyyy-MM-dd)，资产负债表专用，默认今天"));
        return buildToolDef(
                "财务报表：利润表(损益)、资产负债表、现金流量表、利润环比分析、财务健康诊断。" +
                        "用户说「利润表」「损益表」「资产负债」「现金流」「财务报表」「环比」「财务健康」时必须调用。仅管理员可用。",
                properties, List.of("action"));
    }

    @Override
    public String getName() {
        return "tool_financial_report";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.FINANCE;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (UserContext.factoryId() != null) {
            return errorJson("外发工厂账号无权访问财务报表");
        }
        return switch (action) {
            case "profit_loss" -> profitLoss(args);
            case "balance_sheet" -> balanceSheet(args);
            case "cash_flow" -> cashFlow(args);
            case "profit_trend" -> profitTrend(args);
            case "health_check" -> healthCheck(args);
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String profitLoss(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        LocalDate startDate = resolveStartDate(args);
        LocalDate endDate = resolveEndDate(args);
        Map<String, Object> report = financialReportOrchestrator.generateProfitLoss(startDate, endDate);

        List<String> insights = generateProfitInsights(report);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("report", report);
        data.put("startDate", startDate.toString());
        data.put("endDate", endDate.toString());
        data.put("insights", insights);
        return successJson("利润表生成成功", data);
    }

    private String balanceSheet(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        LocalDate asOfDate = resolveAsOfDate(args);
        Map<String, Object> report = financialReportOrchestrator.generateBalanceSheet(asOfDate);

        List<String> insights = generateBalanceInsights(report);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("report", report);
        data.put("asOfDate", asOfDate.toString());
        data.put("insights", insights);
        return successJson("资产负债表生成成功", data);
    }

    private String cashFlow(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        LocalDate startDate = resolveStartDate(args);
        LocalDate endDate = resolveEndDate(args);
        Map<String, Object> report = financialReportOrchestrator.generateCashFlow(startDate, endDate);

        List<String> insights = generateCashFlowInsights(report);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("report", report);
        data.put("startDate", startDate.toString());
        data.put("endDate", endDate.toString());
        data.put("insights", insights);
        return successJson("现金流量表生成成功", data);
    }

    @SuppressWarnings("unchecked")
    private String profitTrend(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        LocalDate endDate = resolveEndDate(args);
        LocalDate currentStart = resolveStartDate(args);
        long days = ChronoUnit.DAYS.between(currentStart, endDate) + 1;
        LocalDate prevStart = currentStart.minusDays(days);
        LocalDate prevEnd = currentStart.minusDays(1);

        Map<String, Object> currentReport = financialReportOrchestrator.generateProfitLoss(currentStart, endDate);
        Map<String, Object> prevReport = financialReportOrchestrator.generateProfitLoss(prevStart, prevEnd);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("currentPeriod", currentStart + " ~ " + endDate);
        data.put("previousPeriod", prevStart + " ~ " + prevEnd);

        List<Map<String, Object>> comparisons = new ArrayList<>();
        String[] metrics = {"totalRevenue", "materialCost", "grossProfit", "expenseTotal", "operatingProfit", "netProfit"};
        String[] labels = {"总收入", "物料成本", "毛利润", "费用合计", "营业利润", "净利润"};

        for (int i = 0; i < metrics.length; i++) {
            double current = toDouble(currentReport.get(metrics[i]));
            double previous = toDouble(prevReport.get(metrics[i]));
            double change = previous != 0 ? (current - previous) / Math.abs(previous) * 100 : 0;
            double absChange = current - previous;

            Map<String, Object> comp = new LinkedHashMap<>();
            comp.put("metric", labels[i]);
            comp.put("current", current);
            comp.put("previous", previous);
            comp.put("absoluteChange", absChange);
            comp.put("percentageChange", String.format("%.1f%%", change));
            comp.put("trend", change > 5 ? "📈" : change < -5 ? "📉" : "➡️");
            comparisons.add(comp);
        }

        data.put("comparisons", comparisons);

        List<String> insights = new ArrayList<>();
        double revenueChange = getChangePercent(currentReport, prevReport, "totalRevenue");
        double profitChange = getChangePercent(currentReport, prevReport, "netProfit");

        if (revenueChange > 10 && profitChange > 10) {
            insights.add("📈 收入和利润双增长，经营状况良好");
        } else if (revenueChange > 0 && profitChange < 0) {
            insights.add("⚠️ 收入增长但利润下降，需关注成本控制");
        } else if (revenueChange < 0 && profitChange < 0) {
            insights.add("📉 收入和利润双降，需分析原因并制定对策");
        } else if (revenueChange < 0 && profitChange > 0) {
            insights.add("✅ 收入下降但利润增长，成本管控效果显著");
        }

        double currentGrossMargin = toDouble(currentReport.get("grossMargin"));
        double prevGrossMargin = toDouble(prevReport.get("grossMargin"));
        if (currentGrossMargin < 20) {
            insights.add("🔴 毛利率仅" + String.format("%.1f%%", currentGrossMargin) + "，低于行业健康水平(20%+)");
        } else if (currentGrossMargin < prevGrossMargin) {
            insights.add("🟡 毛利率从" + String.format("%.1f%%", prevGrossMargin) + "降至" + String.format("%.1f%%", currentGrossMargin) + "，成本在上升");
        }

        if (insights.isEmpty()) {
            insights.add("➡️ 财务指标环比变化不大，经营稳定");
        }
        data.put("insights", insights);

        return successJson("利润环比分析完成", data);
    }

    @SuppressWarnings("unchecked")
    private String healthCheck(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        LocalDate endDate = resolveEndDate(args);
        LocalDate startDate = endDate.minusDays(29);

        Map<String, Object> profitReport = financialReportOrchestrator.generateProfitLoss(startDate, endDate);
        Map<String, Object> balanceReport = financialReportOrchestrator.generateBalanceSheet(endDate);
        Map<String, Object> cashReport = financialReportOrchestrator.generateCashFlow(startDate, endDate);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("period", startDate + " ~ " + endDate);

        List<Map<String, Object>> checks = new ArrayList<>();
        int score = 100;

        double grossMargin = toDouble(profitReport.get("grossMargin"));
        checks.add(buildCheck("毛利率", grossMargin, "%",
                grossMargin >= 30 ? "健康" : grossMargin >= 20 ? "一般" : "偏低",
                grossMargin >= 30 ? 0 : grossMargin >= 20 ? -10 : -25));
        if (grossMargin < 20) score -= 25;
        else if (grossMargin < 30) score -= 10;

        double netMargin = toDouble(profitReport.get("netMargin"));
        checks.add(buildCheck("净利率", netMargin, "%",
                netMargin >= 10 ? "健康" : netMargin >= 5 ? "一般" : "亏损风险",
                netMargin >= 10 ? 0 : netMargin >= 5 ? -10 : -20));
        if (netMargin < 5) score -= 20;
        else if (netMargin < 10) score -= 10;

        double netCashFlow = toDouble(cashReport.get("netCashFlow"));
        checks.add(buildCheck("净现金流", netCashFlow, "元",
                netCashFlow > 0 ? "正向" : netCashFlow == 0 ? "持平" : "负向",
                netCashFlow > 0 ? 0 : -15));
        if (netCashFlow <= 0) score -= 15;

        double invoiceBalance = toDouble(balanceReport.get("invoiceBalance"));
        double payableBalance = toDouble(balanceReport.get("payableBalance"));
        double netPosition = toDouble(balanceReport.get("netPosition"));
        checks.add(buildCheck("应收应付净额", netPosition, "元",
                netPosition > 0 ? "应收>应付" : "应付>应收",
                netPosition > 0 ? 0 : -10));
        if (netPosition <= 0) score -= 10;

        score = Math.max(0, score);
        data.put("checks", checks);
        data.put("score", score);
        data.put("level", score >= 80 ? "🟢 健康" : score >= 60 ? "🟡 一般" : "🔴 需关注");

        List<String> recommendations = new ArrayList<>();
        if (grossMargin < 20) {
            recommendations.add("💡 毛利率偏低，建议审查物料采购成本和产品定价策略");
        }
        if (netMargin < 5) {
            recommendations.add("💡 净利率偏低，建议控制运营费用和间接成本");
        }
        if (netCashFlow <= 0) {
            recommendations.add("💡 现金流为负，建议加快应收账款回收，优化付款节奏");
        }
        if (netPosition <= 0) {
            recommendations.add("💡 应付大于应收，建议关注供应商账期和客户回款速度");
        }
        if (recommendations.isEmpty()) {
            recommendations.add("✅ 财务状况整体健康，继续保持当前经营策略");
        }
        data.put("recommendations", recommendations);

        return successJson("财务健康诊断完成", data);
    }

    private Map<String, Object> buildCheck(String name, double value, String unit, String status, int scoreDelta) {
        Map<String, Object> check = new LinkedHashMap<>();
        check.put("name", name);
        check.put("value", String.format("%.2f" + unit, value));
        check.put("status", status);
        check.put("impact", scoreDelta < 0 ? scoreDelta + "分" : "无影响");
        return check;
    }

    private List<String> generateProfitInsights(Map<String, Object> report) {
        List<String> insights = new ArrayList<>();
        double grossMargin = toDouble(report.get("grossMargin"));
        double netMargin = toDouble(report.get("netMargin"));
        double totalRevenue = toDouble(report.get("totalRevenue"));
        double materialCost = toDouble(report.get("materialCost"));

        if (totalRevenue == 0) {
            insights.add("📊 本期无收入数据");
            return insights;
        }
        if (grossMargin >= 40) {
            insights.add("✅ 毛利率" + String.format("%.1f%%", grossMargin) + "，盈利能力强");
        } else if (grossMargin >= 20) {
            insights.add("🟡 毛利率" + String.format("%.1f%%", grossMargin) + "，处于正常水平");
        } else {
            insights.add("🔴 毛利率" + String.format("%.1f%%", grossMargin) + "，需关注成本控制");
        }

        double costRatio = totalRevenue > 0 ? materialCost / totalRevenue * 100 : 0;
        if (costRatio > 70) {
            insights.add("⚠️ 物料成本占收入" + String.format("%.1f%%", costRatio) + "，占比过高");
        }

        if (netMargin < 0) {
            insights.add("🔴 本期净亏损，需分析亏损原因");
        }
        return insights;
    }

    private List<String> generateBalanceInsights(Map<String, Object> report) {
        List<String> insights = new ArrayList<>();
        double invoiceBalance = toDouble(report.get("invoiceBalance"));
        double payableBalance = toDouble(report.get("payableBalance"));
        double netPosition = toDouble(report.get("netPosition"));

        if (invoiceBalance > payableBalance * 2) {
            insights.add("⚠️ 应收账款远大于应付，需关注回款效率");
        } else if (payableBalance > invoiceBalance * 2) {
            insights.add("⚠️ 应付账款远大于应收，需关注偿债压力");
        }
        if (netPosition > 0) {
            insights.add("✅ 净头寸为正，资金面相对宽裕");
        } else {
            insights.add("🟡 净头寸为负，需关注资金流动性");
        }
        return insights;
    }

    private List<String> generateCashFlowInsights(Map<String, Object> report) {
        List<String> insights = new ArrayList<>();
        double netCashFlow = toDouble(report.get("netCashFlow"));
        double cashIn = toDouble(report.get("cashIn"));
        double cashOut = toDouble(report.get("cashOut"));

        if (netCashFlow > 0) {
            insights.add("✅ 净现金流为正(" + String.format("%.2f", netCashFlow) + "元)，经营现金流健康");
        } else {
            insights.add("🔴 净现金流为负(" + String.format("%.2f", netCashFlow) + "元)，需关注资金链安全");
        }

        if (cashIn > 0) {
            double outRatio = cashOut / cashIn * 100;
            if (outRatio > 90) {
                insights.add("⚠️ 支出占收入" + String.format("%.1f%%", outRatio) + "，现金流缓冲空间小");
            }
        }
        return insights;
    }

    private double toDouble(Object val) {
        if (val == null) return 0;
        if (val instanceof Number n) return n.doubleValue();
        try {
            return Double.parseDouble(val.toString().replace("%", "").trim());
        } catch (Exception e) {
            log.debug("[FinancialReport] toDouble解析失败: val={}", val);
            return 0;
        }
    }

    private double getChangePercent(Map<String, Object> current, Map<String, Object> previous, String key) {
        double c = toDouble(current.get(key));
        double p = toDouble(previous.get(key));
        return p != 0 ? (c - p) / Math.abs(p) * 100 : 0;
    }

    private LocalDate resolveStartDate(Map<String, Object> args) {
        String s = optionalString(args, "startDate");
        if (s != null) return LocalDate.parse(s);
        return LocalDate.now().withDayOfMonth(1);
    }

    private LocalDate resolveEndDate(Map<String, Object> args) {
        String s = optionalString(args, "endDate");
        if (s != null) return LocalDate.parse(s);
        return LocalDate.now();
    }

    private LocalDate resolveAsOfDate(Map<String, Object> args) {
        String s = optionalString(args, "asOfDate");
        if (s != null) return LocalDate.parse(s);
        return LocalDate.now();
    }
}
