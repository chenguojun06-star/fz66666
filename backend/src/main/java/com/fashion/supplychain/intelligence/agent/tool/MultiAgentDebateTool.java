package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.SmartNotification;
import com.fashion.supplychain.intelligence.orchestration.agent.MultiAgentDebateOrchestrator;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Slf4j
@Component
public class MultiAgentDebateTool extends AbstractAgentTool {

    @Autowired
    private MultiAgentDebateOrchestrator debateOrchestrator;
    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Override
    public String getName() {
        return "tool_multi_agent_debate";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("orderId", stringProp("订单ID"));
        properties.put("question", stringProp("需要诊断分析的问题，如'为什么逾期''如何加速''存在什么风险'"));

        return buildToolDef(
                "多智能体联合诊断工具：启动PMC(进度)、财务(成本)、品控(质量)三个AI专家并发分析，" +
                "再由CEO智能体综合决策。适用于复杂订单问题的全局诊断、原因分析、风险评估。" +
                "当用户询问'诊断订单'、'分析问题原因'、'这个订单有什么风险'、" +
                "'为什么延期'、'帮我看看这个订单'时调用此工具。",
                properties, List.of("orderId"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String orderId = requireString(args, "orderId");
        String question = optionalString(args, "question");

        ProductionOrder order = productionOrderMapper.selectById(orderId);
        if (order == null) {
            return errorJson("订单不存在: " + orderId);
        }

        String context = buildOrderGlobalContext(order, question);
        log.info("[MultiAgentDebate] 启动多智能体诊断, order={}, question={}", order.getOrderNo(), question);

        SmartNotification result = debateOrchestrator.diagnoseOrderWithMultiAgent(order, context);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("orderId", orderId);
        response.put("orderNo", order.getOrderNo());
        response.put("diagnosis", result != null ? result.getContent() : "诊断完成");
        response.put("priority", result != null ? result.getPriority() : "normal");
        response.put("type", result != null ? result.getNotificationType() : "diagnosis");
        response.put("recommendedAction", result != null ? result.getRecommendedAction() : "");
        response.put("agents", "PMC(进度分析) + 财务(成本分析) + 品控(质量分析) → CEO(综合决策)");

        return MAPPER.writeValueAsString(response);
    }

    private String buildOrderGlobalContext(ProductionOrder order, String question) {
        StringBuilder sb = new StringBuilder();
        sb.append("订单号: ").append(order.getOrderNo()).append("\n");
        sb.append("状态: ").append(order.getStatus()).append("\n");
        sb.append("进度: ").append(order.getProductionProgress() != null ? order.getProductionProgress() + "%" : "未知").append("\n");

        if (order.getPlannedEndDate() != null) {
            long days = ChronoUnit.DAYS.between(LocalDateTime.now(), order.getPlannedEndDate());
            sb.append("距离交期: ").append(days).append(" 天").append("\n");
        }
        if (question != null && !question.isBlank()) {
            sb.append("用户问题: ").append(question).append("\n");
        }
        return sb.toString();
    }
}
