package com.fashion.supplychain.intelligence.agent.router;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.tool.ToolDomain;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class SemanticDomainRouter {

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Value("${xiaoyun.agent.router.use-llm:true}")
    private boolean useLlmRouting;

    @Value("${xiaoyun.agent.router.cache-ttl-seconds:300}")
    private int cacheTtlSeconds;

    private final ConcurrentHashMap<String, CachedRouting> routingCache = new ConcurrentHashMap<>();

    private static final String ROUTING_PROMPT = """
            分析用户消息的意图，返回最相关的业务领域和复杂度等级。

            可选领域（只返回一个最匹配的）：
            - PRODUCTION: 生产订单、裁剪、车缝、进度跟踪、扫码
            - FINANCE: 工资、结算、财务、发票、成本
            - WAREHOUSE: 仓库、库存、入库、出库、物料
            - STYLE: 款式、样衣、报价、模板
            - ANALYSIS: 数据分析、趋势、排名、对比、预测
            - SYSTEM: 系统功能、操作说明、SOP、帮助

            可选复杂度（只返回一个）：
            - SIMPLE: 闲聊、简单查询、单条数据
            - MODERATE: 多条件查询、2-3个工具调用
            - COMPLEX: 多维度分析、写操作、4+工具调用

            只输出两行，格式：
            DOMAIN=xxx
            COMPLEXITY=xxx
            """;

    public RoutingResult route(String userMessage, String pageContext) {
        if (userMessage == null || userMessage.isBlank()) {
            return RoutingResult.defaultResult();
        }

        String cacheKey = userMessage.trim().toLowerCase();
        CachedRouting cached = routingCache.get(cacheKey);
        if (cached != null && !cached.isExpired()) {
            log.debug("[SemanticRouter] 命中缓存: domain={}, complexity={}", cached.result.domain, cached.result.complexity);
            return cached.result;
        }

        RoutingResult keywordResult = routeByKeywords(userMessage, pageContext);

        if (!useLlmRouting) {
            return keywordResult;
        }

        try {
            RoutingResult llmResult = routeByLLM(userMessage);
            if (llmResult != null && llmResult.domain != null) {
                routingCache.put(cacheKey, new CachedRouting(llmResult, cacheTtlSeconds * 1000L));
                return llmResult;
            }
        } catch (Exception e) {
            log.debug("[SemanticRouter] LLM路由失败，降级为关键词: {}", e.getMessage());
        }

        return keywordResult;
    }

    private RoutingResult routeByKeywords(String userMessage, String pageContext) {
        String msg = userMessage.toLowerCase();
        ToolDomain domain = ToolDomain.GENERAL;
        Complexity complexity = Complexity.MODERATE;

        if (msg.matches(".*(?:入库|建单|创建订单|审批|结算|撤回扫码|分配|派单|新建|快速建单|帮我.*做|去做|执行.*操作).*")) {
            complexity = Complexity.COMPLEX;
        } else if (msg.matches(".*(?:对比|排名|趋势|分析|汇总|所有|每个|各个|评估|预测|方案|为什么|怎么办|如何优化).*")) {
            complexity = Complexity.COMPLEX;
            domain = ToolDomain.ANALYSIS;
        } else if (msg.matches(".*(?:你好|hi|hello|谢谢|再见|你是谁|在吗).*")) {
            complexity = Complexity.SIMPLE;
        }

        if (domain == ToolDomain.GENERAL) {
            if (msg.matches(".*(?:订单|生产|裁剪|车缝|进度|扫码|工序|菲号).*")) {
                domain = ToolDomain.PRODUCTION;
            } else if (msg.matches(".*(?:工资|结算|财务|发票|成本|应付|应收).*")) {
                domain = ToolDomain.FINANCE;
            } else if (msg.matches(".*(?:仓库|库存|入库|出库|物料|面料|辅料).*")) {
                domain = ToolDomain.WAREHOUSE;
            } else if (msg.matches(".*(?:款式|样衣|报价|模板|版型).*")) {
                domain = ToolDomain.STYLE;
            } else if (msg.matches(".*(?:分析|趋势|排名|对比|预测|仪表盘|经营).*")) {
                domain = ToolDomain.ANALYSIS;
            } else if (msg.matches(".*(?:怎么操作|如何使用|sop|帮助|说明).*")) {
                domain = ToolDomain.SYSTEM;
            }
        }

        if (pageContext != null) {
            domain = refineByPageContext(domain, pageContext);
        }

        return new RoutingResult(domain, complexity, 0.6);
    }

    private ToolDomain refineByPageContext(ToolDomain current, String pageContext) {
        if (pageContext.contains("/orders") || pageContext.contains("/cutting") || pageContext.contains("/progress")) {
            return ToolDomain.PRODUCTION;
        }
        if (pageContext.contains("/finance") || pageContext.contains("/payroll")) {
            return ToolDomain.FINANCE;
        }
        if (pageContext.contains("/warehouse") || pageContext.contains("/material")) {
            return ToolDomain.WAREHOUSE;
        }
        if (pageContext.contains("/style")) {
            return ToolDomain.STYLE;
        }
        if (pageContext.contains("/dashboard") || pageContext.contains("/intelligence")) {
            return ToolDomain.ANALYSIS;
        }
        return current;
    }

    private RoutingResult routeByLLM(String userMessage) {
        List<AiMessage> prompt = new ArrayList<>();
        prompt.add(AiMessage.system(ROUTING_PROMPT));
        String userPrompt = "用户消息：" + (userMessage.length() > 200 ? userMessage.substring(0, 200) : userMessage);
        prompt.add(AiMessage.user(userPrompt));

        var result = inferenceOrchestrator.chat("nl-intent", prompt, null);
        if (result == null || result.getContent() == null) return null;

        String content = result.getContent().trim();
        ToolDomain domain = ToolDomain.GENERAL;
        Complexity complexity = Complexity.MODERATE;

        for (String line : content.split("\n")) {
            line = line.trim().toUpperCase();
            if (line.startsWith("DOMAIN=")) {
                String val = line.substring(7).trim();
                try { domain = ToolDomain.valueOf(val); } catch (Exception ignored) {}
            } else if (line.startsWith("COMPLEXITY=")) {
                String val = line.substring(11).trim();
                try { complexity = Complexity.valueOf(val); } catch (Exception ignored) {}
            }
        }

        return new RoutingResult(domain, complexity, 0.85);
    }

    public int estimateMaxIterations(RoutingResult routing) {
        if (routing == null) return 5;
        return switch (routing.complexity) {
            case SIMPLE -> 2;
            case MODERATE -> 5;
            case COMPLEX -> 8;
        };
    }

    @Data
    public static class RoutingResult {
        private final ToolDomain domain;
        private final Complexity complexity;
        private final double confidence;

        public RoutingResult(ToolDomain domain, Complexity complexity, double confidence) {
            this.domain = domain;
            this.complexity = complexity;
            this.confidence = confidence;
        }

        public static RoutingResult defaultResult() {
            return new RoutingResult(ToolDomain.GENERAL, Complexity.MODERATE, 0.3);
        }
    }

    public enum Complexity {
        SIMPLE, MODERATE, COMPLEX
    }

    private static class CachedRouting {
        final RoutingResult result;
        final long expireAt;

        CachedRouting(RoutingResult result, long ttlMs) {
            this.result = result;
            this.expireAt = System.currentTimeMillis() + ttlMs;
        }

        boolean isExpired() {
            return System.currentTimeMillis() > expireAt;
        }
    }
}
