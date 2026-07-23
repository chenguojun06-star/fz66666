package com.fashion.supplychain.intelligence.service;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class AgentHandoffService {

    @Value("${xiaoyun.agent.handoff.enabled:true}")
    private boolean handoffEnabled;

    @Value("${xiaoyun.agent.handoff.max-retries:3}")
    private int maxRetries;

    @Value("${xiaoyun.agent.handoff.timeout-ms:30000}")
    private long timeoutMs;

    private static final Map<String, AgentSpec> AGENT_REGISTRY = Map.of(
            "order_expert", new AgentSpec("订单专家", "处理订单查询、进度跟踪、延期预警、订单关闭等订单相关操作",
                    Arrays.asList("订单", "进度", "延期", "逾期", "关闭", "完成", "返修", "报废"),
                    Arrays.asList("getOrderById", "listOrders", "updateOrderStatus", "confirmProcurementComplete")),
            "production_expert", new AgentSpec("生产专家", "处理生产进度、扫码记录、产量统计、排产建议等生产相关操作",
                    Arrays.asList("扫码", "产量", "排产", "产能", "工序", "进度"),
                    Arrays.asList("scanOrder", "undoScan", "getProductionStats", "getFactoryVelocity")),
            "inventory_expert", new AgentSpec("库存专家", "处理库存查询、入库出库、库存盘点、库存差异等仓储相关操作",
                    Arrays.asList("库存", "入库", "出库", "盘点", "差异"),
                    Arrays.asList("getStock", "createStockIn", "createStockOut", "syncStock")),
            "finance_expert", new AgentSpec("财务专家", "处理工资结算、收款管理、成本核算、对账等财务相关操作",
                    Arrays.asList("工资", "结算", "收款", "成本", "报价", "对账", "账单"),
                    Arrays.asList("calculateWage", "settleWage", "getReceivable", "confirmPayment")),
            "quality_expert", new AgentSpec("质检专家", "处理质检记录、次品处理、合格率统计、质检任务等质检相关操作",
                    Arrays.asList("质检", "次品", "返工", "合格", "不合格"),
                    Arrays.asList("createQualityCheck", "getQualityStats", "handleDefective")),
            "procurement_expert", new AgentSpec("采购专家", "处理采购单、到货登记、物料领取、供应商评估等采购相关操作",
                    Arrays.asList("采购", "到货", "领取", "供应商"),
                    Arrays.asList("createPurchase", "confirmArrival", "confirmPickup", "getSupplierRating")),
            "ecommerce_expert", new AgentSpec("电商专家", "处理电商订单、自动改价、退款处理、库存同步等电商相关操作",
                    Arrays.asList("电商", "改价", "退款", "库存同步", "订单同步"),
                    Arrays.asList("syncEcOrder", "syncEcPrice", "processRefund", "detectStockDiscrepancy")),
            "ai_advisor", new AgentSpec("智能顾问", "处理综合分析、决策建议、趋势预测、方案推荐等综合问题",
                    Arrays.asList("分析", "预测", "建议", "方案", "最优", "比较"),
                    Arrays.asList("getIntelligenceSummary", "predictDelivery", "generateDecisionCard"))
    );

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AgentSpec {
        private String displayName;
        private String description;
        private List<String> triggerKeywords;
        private List<String> availableTools;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class HandoffDecision {
        private boolean shouldHandoff;
        private String targetAgent;
        private String targetAgentName;
        private double confidence;
        private String reason;
        private List<String> matchedKeywords;
        private List<String> recommendedTools;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class HandoffResult {
        private String agentId;
        private String agentName;
        private String result;
        private boolean success;
        private String errorMessage;
        private LocalDateTime executedAt;
        private long durationMs;
        private int retryCount;
    }

    private final Map<String, HandoffContext> handoffContexts = new ConcurrentHashMap<>();

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class HandoffContext {
        private String conversationId;
        private String sourceAgent;
        private String targetAgent;
        private String query;
        private LocalDateTime handoffAt;
        private int retryCount;
    }

    public HandoffDecision evaluateHandoff(String query) {
        if (!handoffEnabled || query == null || query.isBlank()) {
            return new HandoffDecision(false, null, null, 0.0, "Handoff未启用或查询为空", Collections.emptyList(), Collections.emptyList());
        }

        String lowerQuery = query.toLowerCase();
        Map<String, Double> agentScores = new LinkedHashMap<>();

        for (Map.Entry<String, AgentSpec> entry : AGENT_REGISTRY.entrySet()) {
            AgentSpec spec = entry.getValue();
            double score = 0.0;
            List<String> matched = new ArrayList<>();

            for (String keyword : spec.getTriggerKeywords()) {
                if (lowerQuery.contains(keyword.toLowerCase())) {
                    score += 0.25;
                    matched.add(keyword);
                }
            }

            if (matched.size() >= 2) {
                score += 0.2;
            }

            if (score > 0) {
                agentScores.put(entry.getKey(), score);
            }
        }

        if (agentScores.isEmpty()) {
            return new HandoffDecision(false, null, null, 0.0, "未匹配到任何专家Agent", Collections.emptyList(), Collections.emptyList());
        }

        Map.Entry<String, Double> bestMatch = agentScores.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .orElse(null);

        if (bestMatch == null || bestMatch.getValue() < 0.3) {
            return new HandoffDecision(false, null, null, bestMatch != null ? bestMatch.getValue() : 0.0,
                    "匹配置信度不足", Collections.emptyList(), Collections.emptyList());
        }

        AgentSpec bestSpec = AGENT_REGISTRY.get(bestMatch.getKey());
        List<String> matchedKeywords = new ArrayList<>();
        for (String keyword : bestSpec.getTriggerKeywords()) {
            if (lowerQuery.contains(keyword.toLowerCase())) {
                matchedKeywords.add(keyword);
            }
        }

        log.info("[AgentHandoff] 决策: query={}, agent={}, confidence={}, keywords={}",
                query, bestMatch.getKey(), bestMatch.getValue(), matchedKeywords);

        return new HandoffDecision(true, bestMatch.getKey(), bestSpec.getDisplayName(),
                bestMatch.getValue(), "匹配到专家Agent", matchedKeywords, bestSpec.getAvailableTools());
    }

    public HandoffResult performHandoff(String conversationId, String query, HandoffDecision decision) {
        if (!decision.isShouldHandoff() || !handoffEnabled) {
            return new HandoffResult(null, null, null, false, "Handoff决策为否或未启用", LocalDateTime.now(), 0, 0);
        }

        long startTime = System.currentTimeMillis();
        HandoffContext context = new HandoffContext(conversationId, "main_agent",
                decision.getTargetAgent(), query, LocalDateTime.now(), 0);
        handoffContexts.put(conversationId, context);

        try {
            HandoffResult result = executeHandoff(context, decision);
            result.setDurationMs(System.currentTimeMillis() - startTime);
            result.setExecutedAt(LocalDateTime.now());
            return result;
        } catch (Exception e) {
            log.error("[AgentHandoff] 执行失败: conversationId={}, agent={}, error={}",
                    conversationId, decision.getTargetAgent(), e.getMessage());
            return new HandoffResult(decision.getTargetAgent(), decision.getTargetAgentName(),
                    null, false, e.getMessage(), LocalDateTime.now(),
                    System.currentTimeMillis() - startTime, 0);
        } finally {
            handoffContexts.remove(conversationId);
        }
    }

    private HandoffResult executeHandoff(HandoffContext context, HandoffDecision decision) {
        int retries = 0;
        Exception lastError = null;

        while (retries < maxRetries) {
            try {
                String result = dispatchToAgent(context.getTargetAgent(), context.getQuery(), decision.getRecommendedTools());
                if (result != null && !result.isBlank()) {
                    return new HandoffResult(context.getTargetAgent(), decision.getTargetAgentName(),
                            result, true, null, LocalDateTime.now(), 0, retries);
                }
            } catch (Exception e) {
                lastError = e;
                log.warn("[AgentHandoff] 第{}次尝试失败: {}", retries + 1, e.getMessage());
            }
            retries++;
            context.setRetryCount(retries);
            handoffContexts.put(context.getConversationId(), context);

            try {
                Thread.sleep(1000L * retries);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            }
        }

        return new HandoffResult(context.getTargetAgent(), decision.getTargetAgentName(),
                null, false, lastError != null ? lastError.getMessage() : "重试次数耗尽",
                LocalDateTime.now(), 0, retries);
    }

    private String dispatchToAgent(String agentId, String query, List<String> recommendedTools) {
        log.info("[AgentHandoff] 分发到Agent: agentId={}, query={}, tools={}", agentId, query, recommendedTools);
        return String.format("[%s] 正在处理您的问题：%s", AGENT_REGISTRY.get(agentId).getDisplayName(), query);
    }

    public boolean hasActiveHandoff(String conversationId) {
        HandoffContext ctx = handoffContexts.get(conversationId);
        return ctx != null && ctx.getHandoffAt().plusMinutes(5).isAfter(LocalDateTime.now());
    }

    public HandoffContext getHandoffContext(String conversationId) {
        return handoffContexts.get(conversationId);
    }

    public void cancelHandoff(String conversationId) {
        handoffContexts.remove(conversationId);
        log.info("[AgentHandoff] 取消: conversationId={}", conversationId);
    }

    public List<AgentSpec> listAvailableAgents() {
        return new ArrayList<>(AGENT_REGISTRY.values());
    }

    public AgentSpec getAgentSpec(String agentId) {
        return AGENT_REGISTRY.get(agentId);
    }
}