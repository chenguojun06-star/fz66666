package com.fashion.supplychain.intelligence.agent.handoff;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Slf4j
@Component
@Lazy
public class SubAgentRegistry {

    private final Map<String, SubAgentDefinition> agents = new ConcurrentHashMap<>();

    @Value("${xiaoyun.handoff.enabled:true}")
    private boolean handoffEnabled;

    public SubAgentRegistry() {
        registerBuiltinAgents();
    }

    private void registerBuiltinAgents() {
        SubAgentDefinition finance = new SubAgentDefinition();
        finance.setAgentId("finance-expert");
        finance.setName("财务专家Agent");
        finance.setDescription("专门处理财务计算、成本核算、利润分析、工资结算等财务相关问题");
        finance.setDomain("finance");
        finance.setTriggers(List.of("工资", "成本", "利润", "报价", "付款", "应收", "应付", "发票", "税务",
                "发工资", "结算", "薪资", "报销", "工资单", "财务"));
        finance.setSystemPrompt(
                "你是服装供应链的财务专家。你擅长：成本核算（面料/辅料/加工费）、利润分析、报价合理性判断、" +
                "工资结算审核、应收账款催收提醒。你的回答必须包含具体数字，不确定时标注'建议人工复核'。" +
                "跨租户数据绝不混淆。");
        finance.setToolWhitelist(List.of("FinancialReportTool", "InvoiceTool", "TaxConfigTool",
                "UnitPriceQueryTool", "BargainPriceTool", "StyleQuotationTool"));
        finance.setMaxIterations(5);
        agents.put(finance.getAgentId(), finance);

        SubAgentDefinition quality = new SubAgentDefinition();
        quality.setAgentId("quality-expert");
        quality.setName("质量专家Agent");
        quality.setDescription("专门处理质检、次品、质量异常分析、返修等品控相关问题");
        quality.setDomain("quality");
        quality.setTriggers(List.of("质检", "次品", "返修", "质量", "缺陷", "不良品", "不合格",
                "退货", "品质", "品控", "瑕疵", "报废"));
        quality.setSystemPrompt(
                "你是服装供应链的质量品控专家。你擅长：识别质检异常模式、次品根因分析（面料/裁剪/缝制/后整）、" +
                "返修率趋势分析、供应商质量评分。回答时用具体质检数据支撑，给改善建议要可执行。");
        quality.setToolWhitelist(List.of("QualityStatisticsTool", "QualityInboundTool",
                "DefectiveBoardTool", "SupplierScorecardTool", "ProductionExceptionTool"));
        quality.setMaxIterations(5);
        agents.put(quality.getAgentId(), quality);

        SubAgentDefinition delivery = new SubAgentDefinition();
        delivery.setAgentId("delivery-expert");
        delivery.setName("交期风控Agent");
        delivery.setDescription("专门处理订单交期风险评估、逾期预警、排期优化建议");
        delivery.setDomain("delivery");
        delivery.setTriggers(List.of("交期", "逾期", "延期", "交货", "货期", "来不及",
                "能按时", "什么时候做完", "还要多久", "进度", "排期", "排单"));
        delivery.setSystemPrompt(
                "你是服装供应链的交期风控专家。你擅长：基于当前工序进度预测交期、识别逾期风险、" +
                "分析瓶颈工序、提出排期调整建议。风险分级使用🔴/🟠/🟡/🟢。你的建议必须有数据支撑。");
        delivery.setToolWhitelist(List.of("DeliveryPredictionTool", "AvgCompletionTimeTool",
                "ProductionProgressTool", "DelayTrendTool"));
        delivery.setMaxIterations(5);
        agents.put(delivery.getAgentId(), delivery);

        SubAgentDefinition capacity = new SubAgentDefinition();
        capacity.setAgentId("capacity-expert");
        capacity.setName("产能规划Agent");
        capacity.setDescription("专门处理产能评估、工厂承载力分析、外发建议");
        capacity.setDomain("capacity");
        capacity.setTriggers(List.of("产能", "做不过来", "能接多少", "外发", "转单",
                "工厂忙不忙", "排得下吗", "承接能力", "满载", "空闲"));
        capacity.setSystemPrompt(
                "你是服装供应链的产能规划专家。你擅长：评估工厂当前负荷、计算剩余产能、" +
                "提出订单外发/转单建议、分析产能瓶颈工序。回答时给具体数字和百分比。");
        capacity.setToolWhitelist(List.of("ProductionProgressTool", "SupplierTool",
                "OrderFactoryTransferTool", "SchedulingSuggestionTool"));
        capacity.setMaxIterations(4);
        agents.put(capacity.getAgentId(), capacity);
    }

    public SubAgentDefinition matchAgent(String userMessage) {
        if (!handoffEnabled) return null;
        String lower = userMessage.toLowerCase();
        for (SubAgentDefinition agent : agents.values()) {
            if (!agent.isEnabled()) continue;
            for (String trigger : agent.getTriggers()) {
                if (lower.contains(trigger)) {
                    log.info("[Handoff] Matched sub-agent: {} for trigger: {}", agent.getName(), trigger);
                    return agent;
                }
            }
        }
        return null;
    }

    public SubAgentDefinition getAgent(String agentId) {
        return agents.get(agentId);
    }

    public List<SubAgentDefinition> getAllAgents() {
        return new ArrayList<>(agents.values());
    }

    public String buildHandoffPrompt() {
        return agents.values().stream()
                .filter(SubAgentDefinition::isEnabled)
                .map(a -> "- " + a.getName() + "(" + a.getAgentId() + "): " + a.getDescription() +
                        " 触发词: " + String.join(", ", a.getTriggers()))
                .collect(Collectors.joining("\n"));
    }
}