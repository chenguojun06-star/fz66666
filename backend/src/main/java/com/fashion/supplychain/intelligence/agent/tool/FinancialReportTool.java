package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.orchestration.FinancialReportOrchestrator;
import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class FinancialReportTool extends AbstractAgentTool {

    @Autowired
    private FinancialReportOrchestrator financialReportOrchestrator;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: profit_loss | balance_sheet | cash_flow"));
        properties.put("startDate", stringProp("开始日期(yyyy-MM-dd)，默认本月1号"));
        properties.put("endDate", stringProp("结束日期(yyyy-MM-dd)，默认今天"));
        properties.put("asOfDate", stringProp("截止日期(yyyy-MM-dd)，资产负债表专用，默认今天"));
        return buildToolDef(
                "财务报表：利润表(损益)、资产负债表、现金流量表。用户说「利润表」「损益表」「资产负债」「现金流」「财务报表」时必须调用。仅管理员可用。",
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
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String profitLoss(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        LocalDate startDate = resolveStartDate(args);
        LocalDate endDate = resolveEndDate(args);
        Map<String, Object> report = financialReportOrchestrator.generateProfitLoss(startDate, endDate);
        return successJson("利润表生成成功", Map.of("report", report, "startDate", startDate.toString(), "endDate", endDate.toString()));
    }

    private String balanceSheet(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        LocalDate asOfDate = resolveAsOfDate(args);
        Map<String, Object> report = financialReportOrchestrator.generateBalanceSheet(asOfDate);
        return successJson("资产负债表生成成功", Map.of("report", report, "asOfDate", asOfDate.toString()));
    }

    private String cashFlow(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        LocalDate startDate = resolveStartDate(args);
        LocalDate endDate = resolveEndDate(args);
        Map<String, Object> report = financialReportOrchestrator.generateCashFlow(startDate, endDate);
        return successJson("现金流量表生成成功", Map.of("report", report, "startDate", startDate.toString(), "endDate", endDate.toString()));
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
