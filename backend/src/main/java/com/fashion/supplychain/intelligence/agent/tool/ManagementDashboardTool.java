package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.orchestration.ManagementInsightOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 管理层经营仪表盘 AgentTool —— 老板/管理人员通过小云直接查询经营数据。
 *
 * 典型对话：
 *   "利润最高的款是哪个？"  → section=profitability
 *   "各工厂表现对比"        → section=factory_performance
 *   "目前有什么风险订单？"  → section=risks
 *   "给我一个经营概览"      → section=summary
 */
@Slf4j
@Component
public class ManagementDashboardTool extends AbstractAgentTool {

    @Autowired
    private ManagementInsightOrchestrator insightOrchestrator;

    @Override
    public String getName() {
        return "tool_management_dashboard";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.ANALYSIS;
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("section", stringProp(
                "查询维度：profitability（款式利润排名）、factory_performance（工厂绩效对比）、"
                + "risks（关键风险识别）、summary（老板摘要，默认）"));

        return buildToolDef(
                "管理层经营仪表盘：查询款式利润排名、工厂绩效对比、关键风险订单、老板级经营概览。"
                + "仅管理层/老板可使用。",
                properties,
                List.of()  // section 非必填，默认 summary
        );
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Map<String, Object> args = parseArgs(argumentsJson);
        String section = optionalString(args, "section");
        if (section == null || section.isBlank()) {
            section = "summary";
        }

        Map<String, Object> data;
        String message;

        switch (section) {
            case "profitability" -> {
                data = insightOrchestrator.getStyleProfitability(tenantId);
                message = "款式利润排名已生成";
            }
            case "factory_performance" -> {
                data = insightOrchestrator.getFactoryPerformance(tenantId);
                message = "工厂绩效对比已生成";
            }
            case "risks" -> {
                data = insightOrchestrator.getKeyRisks(tenantId);
                message = "关键风险识别已生成";
            }
            default -> {
                data = insightOrchestrator.getExecutiveSummary(tenantId);
                message = "老板经营概览已生成";
            }
        }

        return successJson(message, data);
    }
}
