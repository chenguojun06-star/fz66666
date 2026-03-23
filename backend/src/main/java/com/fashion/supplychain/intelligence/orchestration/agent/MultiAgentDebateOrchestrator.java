package com.fashion.supplychain.intelligence.orchestration.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.dto.SmartNotification;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.production.entity.ProductionOrder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

/**
 * 多智能体协同辩论引擎 (Multi-Agent Debate Engine)
 *
 * 核心思想：
 * 打破单一 LLM 的思维局限，针对复杂的供应链问题，引入多个具有不同“人设”和“目标函数”的子智能体。
 * 它们在后台进行并发思考与辩论，最后由“总管智能体 (CEO Agent)”进行利益权衡和最终决策。
 *
 * 这对现有 UI 完全透明，但能大幅提升 AI 输出建议的全局观和深度。
 */
@Service
@Slf4j
public class MultiAgentDebateOrchestrator {

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    private static final ObjectMapper JSON = new ObjectMapper();

    /**
     * 对关键订单进行多维度联合诊断
     */
    public SmartNotification diagnoseOrderWithMultiAgent(ProductionOrder order, String orderContextStr) {
        log.info("[MultiAgent] 启动多智能体联合诊断会议，订单: {}", order.getOrderNo());

        // 1. PMC 智能体：只关心进度、交期、物料是否齐套
        CompletableFuture<String> pmcFuture = CompletableFuture.supplyAsync(() -> {
            String prompt = "你是 PMC（生产物料控制）专家。你的唯一目标是确保按时交货。请分析以下订单状态，指出潜在的延期风险并给出粗略建议。";
            return askAgent("pmc-agent", prompt, orderContextStr);
        });

        // 2. 财务智能体：只关心成本、利润率、加班费
        CompletableFuture<String> financeFuture = CompletableFuture.supplyAsync(() -> {
            String prompt = "你是财务总监。你的唯一目标是控制成本、最大化利润。如果为了赶交期而盲目外发或加班，你会坚决反对。请分析以下订单的成本风险。";
            return askAgent("finance-agent", prompt, orderContextStr);
        });

        // 3. 品控智能体：只关心质量、返工率
        CompletableFuture<String> qcFuture = CompletableFuture.supplyAsync(() -> {
            String prompt = "你是 QA（质量保证）经理。你的唯一目标是零次品。分析以下订单在当前进度下，如果盲目加速可能会导致哪些质量隐患。";
            return askAgent("qc-agent", prompt, orderContextStr);
        });

        // 等待所有子智能体汇报完毕
        CompletableFuture.allOf(pmcFuture, financeFuture, qcFuture).join();

        String pmcReport = pmcFuture.join();
        String financeReport = financeFuture.join();
        String qcReport = qcFuture.join();

        log.info("[MultiAgent] 各部门汇报完毕。PMC: [{}...], 财务: [{}...], 品控: [{}...]", 
                left(pmcReport, 20), left(financeReport, 20), left(qcReport, 20));

        // 4. CEO 智能体（总协调）：进行权衡与最终决策
        String ceoSystemPrompt = "你是服装厂的厂长 (CEO)。" +
                "你手下的 PMC、财务、品控刚刚对订单 " + order.getOrderNo() + " 提交了各自视角的分析报告。" +
                "你需要综合他们的意见（处理他们之间的冲突，比如 PMC要赶工而财务嫌贵），得出最终的最优决策。" +
                "请直接输出一段 JSON，不要任何 Markdown 标记。格式如下：" +
                "{\"title\":\"诊断标题\",\"content\":\"综合分析说明\",\"recommendedAction\":\"具体的操作建议\",\"priority\":\"high/normal/low\",\"notificationType\":\"risk\"}";
        
        String ceoUserPrompt = String.format("【PMC报告】：%s\n【财务报告】：%s\n【品控报告】：%s\n请给出最终 JSON 决策。", 
                pmcReport, financeReport, qcReport);

        String ceoDecisionJson = askAgent("ceo-agent", ceoSystemPrompt, ceoUserPrompt);

        // 5. 解析并封装为标准通知格式
        try {
            SmartNotification notification = JSON.readValue(ceoDecisionJson, SmartNotification.class);
            notification.setNotificationId(UUID.randomUUID().toString());
            notification.setOrderId(String.valueOf(order.getId()));
            notification.setTenantId(order.getTenantId());
            notification.setCreatedAt(System.currentTimeMillis());
            return notification;
        } catch (Exception e) {
            log.error("[MultiAgent] CEO 智能体输出 JSON 解析失败: {}", ceoDecisionJson, e);
            // 降级处理
            return SmartNotification.builder()
                    .notificationId(UUID.randomUUID().toString())
                    .orderId(String.valueOf(order.getId()))
                    .title("多智能体诊断失败")
                    .content("解析异常：" + e.getMessage())
                    .priority("normal")
                    .build();
        }
    }

    private String askAgent(String agentName, String systemPrompt, String userMessage) {
        try {
            var result = inferenceOrchestrator.chat(agentName, systemPrompt, userMessage);
            if (result != null && result.isSuccess()) {
                return result.getContent();
            }
            return "该部门无意见 (API 失败)";
        } catch (Exception e) {
            log.warn("[MultiAgent] {} 调用失败: {}", agentName, e.getMessage());
            return "该部门无意见 (异常)";
        }
    }

    private String left(String str, int len) {
        if (str == null) return "";
        return str.length() > len ? str.substring(0, len) : str;
    }
}
