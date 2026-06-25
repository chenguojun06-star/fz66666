package com.fashion.supplychain.intelligence.agent.router;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.tool.ToolDomain;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Component
@Lazy
public class SemanticDomainRouter {

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Value("${xiaoyun.agent.router.use-llm:true}")
    private boolean useLlmRouting;

    @Value("${xiaoyun.agent.router.cache-ttl-seconds:300}")
    private int cacheTtlSeconds;

    private final ConcurrentHashMap<String, CachedRouting> routingCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, CachedMultiRouting> multiRoutingCache = new ConcurrentHashMap<>();

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

    private static final String MULTI_ROUTING_PROMPT = """
            分析用户消息，识别所有涉及的业务领域，按相关性从高到低排序，最多3个。

            可选领域：
            - PRODUCTION: 生产订单、裁剪、车缝、进度跟踪、扫码、工厂、交期、逾期
            - FINANCE: 工资、结算、财务、发票、成本、利润
            - WAREHOUSE: 仓库、库存、入库、出库、物料、采购
            - STYLE: 款式、样衣、报价、模板
            - ANALYSIS: 数据分析、趋势、排名、对比、预测
            - SYSTEM: 系统功能、操作说明、SOP、帮助

            输出格式（每行一个，按相关性排序）：
            DOMAIN_1=xxx
            DOMAIN_2=xxx
            DOMAIN_3=xxx
            COMPLEXITY=xxx
            """;

    private static final Map<String, List<ToolDomain>> INTENT_COMBINATION_TEMPLATES = Map.of(
            "overdue+ranking", List.of(ToolDomain.PRODUCTION, ToolDomain.ANALYSIS),
            "inventory+procurement", List.of(ToolDomain.WAREHOUSE, ToolDomain.WAREHOUSE),
            "quality+cost", List.of(ToolDomain.PRODUCTION, ToolDomain.FINANCE),
            "delivery+factory", List.of(ToolDomain.PRODUCTION, ToolDomain.PRODUCTION),
            "finance+production", List.of(ToolDomain.FINANCE, ToolDomain.PRODUCTION)
    );

    private static final List<CombinationPattern> COMBINATION_PATTERNS = List.of(
            new CombinationPattern("overdue+ranking",
                    Pattern.compile("(?s).*(延期|逾期|超期|延迟).*?(严重|排名|最多|最少|最差|最好|对比|哪个)"),
                    List.of(ToolDomain.PRODUCTION, ToolDomain.ANALYSIS)),
            new CombinationPattern("inventory+procurement",
                    Pattern.compile("(?s).*(缺货|缺料|库存不足|面料不够|物料不够).*?(采购|补货|下单|进货|购买)"),
                    List.of(ToolDomain.WAREHOUSE, ToolDomain.WAREHOUSE)),
            new CombinationPattern("quality+cost",
                    Pattern.compile("(?s).*(次品|质量|返工|报废|不良率).*?(成本|费用|利润|亏|花费)"),
                    List.of(ToolDomain.PRODUCTION, ToolDomain.FINANCE)),
            new CombinationPattern("delivery+factory",
                    Pattern.compile("(?s).*(交期|交付|准时率|达成率).*?(工厂|车间|产线|各厂|每个厂)"),
                    List.of(ToolDomain.PRODUCTION, ToolDomain.PRODUCTION)),
            new CombinationPattern("finance+production",
                    Pattern.compile("(?s).*(成本|费用|利润|工资|结算).*?(订单|生产|完成率|产量|进度)"),
                    List.of(ToolDomain.FINANCE, ToolDomain.PRODUCTION))
    );

    public RoutingResult route(String userMessage, String pageContext) {
        MultiRoutingResult multi = routeMulti(userMessage, pageContext);
        if (multi.domains.isEmpty()) {
            return RoutingResult.defaultResult();
        }
        return new RoutingResult(multi.domains.get(0), multi.complexity, multi.confidence);
    }

    public MultiRoutingResult routeMulti(String userMessage, String pageContext) {
        if (userMessage == null || userMessage.isBlank()) {
            return MultiRoutingResult.defaultResult();
        }

        String cacheKey = userMessage.trim().toLowerCase();
        CachedMultiRouting cached = multiRoutingCache.get(cacheKey);
        if (cached != null && !cached.isExpired()) {
            log.debug("[SemanticRouter] 多域缓存命中: domains={}", cached.result.domains);
            return cached.result;
        }

        MultiRoutingResult templateResult = routeByCombinationTemplates(userMessage);
        if (templateResult != null) {
            multiRoutingCache.put(cacheKey, new CachedMultiRouting(templateResult, cacheTtlSeconds * 1000L));
            return templateResult;
        }

        MultiRoutingResult keywordResult = routeMultiByKeywords(userMessage, pageContext);

        if (!useLlmRouting) {
            return keywordResult;
        }

        try {
            MultiRoutingResult llmResult = routeMultiByLLM(userMessage);
            if (llmResult != null && !llmResult.domains.isEmpty()) {
                multiRoutingCache.put(cacheKey, new CachedMultiRouting(llmResult, cacheTtlSeconds * 1000L));
                return llmResult;
            }
        } catch (Exception e) {
            log.debug("[SemanticRouter] LLM多域路由失败，降级为关键词: {}", e.getMessage());
        }

        return keywordResult;
    }

    private MultiRoutingResult routeByCombinationTemplates(String userMessage) {
        for (CombinationPattern pattern : COMBINATION_PATTERNS) {
            if (pattern.regex.matcher(userMessage).matches()) {
                log.info("[SemanticRouter] 命中组合模板: {}, domains={}", pattern.name, pattern.domains);
                return new MultiRoutingResult(pattern.domains, Complexity.COMPLEX, 0.9);
            }
        }
        return null;
    }

    private MultiRoutingResult routeMultiByKeywords(String userMessage, String pageContext) {
        String msg = userMessage.toLowerCase();
        List<ToolDomain> domains = new ArrayList<>();
        Complexity complexity = Complexity.MODERATE;

        if (msg.matches(".*(?:入库|建单|创建订单|审批|结算|撤回扫码|分配|派单|新建|快速建单|帮我.*做|去做|执行.*操作).*")) {
            complexity = Complexity.COMPLEX;
        } else if (msg.matches(".*(?:对比|排名|趋势|分析|汇总|所有|每个|各个|评估|预测|方案|为什么|怎么办|如何优化).*")) {
            complexity = Complexity.COMPLEX;
        } else if (msg.matches(".*(?:你好|hi|hello|谢谢|再见|你是谁|在吗).*")) {
            complexity = Complexity.SIMPLE;
        }

        if (msg.matches(".*(?:订单|生产|裁剪|车缝|进度|扫码|工序|菲号|交期|逾期|工厂|产能).*")) {
            domains.add(ToolDomain.PRODUCTION);
        }
        if (msg.matches(".*(?:工资|结算|财务|发票|成本|应付|应收|利润|费用).*")) {
            domains.add(ToolDomain.FINANCE);
        }
        if (msg.matches(".*(?:仓库|库存|入库|出库|物料|面料|辅料|采购|缺货).*")) {
            domains.add(ToolDomain.WAREHOUSE);
        }
        if (msg.matches(".*(?:款式|样衣|报价|模板|版型).*")) {
            domains.add(ToolDomain.STYLE);
        }
        if (msg.matches(".*(?:分析|趋势|排名|对比|预测|仪表盘|经营|严重|哪个).*")) {
            domains.add(ToolDomain.ANALYSIS);
        }
        if (msg.matches(".*(?:怎么操作|如何使用|sop|帮助|说明).*")) {
            domains.add(ToolDomain.SYSTEM);
        }

        if (domains.isEmpty()) {
            domains.add(ToolDomain.GENERAL);
        }

        if (pageContext != null) {
            ToolDomain pageDomain = resolvePageDomain(pageContext);
            if (pageDomain != null && !domains.contains(pageDomain)) {
                domains.add(0, pageDomain);
            }
        }

        List<ToolDomain> top3 = domains.stream().limit(3).collect(Collectors.toList());
        return new MultiRoutingResult(top3, complexity, 0.6);
    }

    private ToolDomain resolvePageDomain(String pageContext) {
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
        return null;
    }

    private MultiRoutingResult routeMultiByLLM(String userMessage) {
        List<AiMessage> prompt = new ArrayList<>();
        prompt.add(AiMessage.system(MULTI_ROUTING_PROMPT));
        String userPrompt = "用户消息：" + (userMessage.length() > 200 ? userMessage.substring(0, 200) : userMessage);
        prompt.add(AiMessage.user(userPrompt));

        var result = inferenceOrchestrator.chat("nl-intent-multi", prompt, null);
        if (result == null || result.getContent() == null) return null;

        String content = result.getContent().trim();
        List<ToolDomain> domains = new ArrayList<>();
        Complexity complexity = Complexity.MODERATE;

        for (String line : content.split("\n")) {
            line = line.trim().toUpperCase();
            if (line.startsWith("DOMAIN_")) {
                String val = line.substring(line.indexOf('=') + 1).trim();
                try {
                    ToolDomain d = ToolDomain.valueOf(val);
                    if (!domains.contains(d)) domains.add(d);
                } catch (Exception e) { log.debug("Invalid ToolDomain value: {}", val); }
            } else if (line.startsWith("COMPLEXITY=")) {
                String val = line.substring(11).trim();
                try { complexity = Complexity.valueOf(val); } catch (Exception e) { log.debug("Invalid Complexity value: {}", val); }
            }
        }

        if (domains.isEmpty()) return null;
        List<ToolDomain> top3 = domains.stream().limit(3).collect(Collectors.toList());
        return new MultiRoutingResult(top3, complexity, 0.85);
    }

    public int estimateMaxIterations(RoutingResult routing) {
        if (routing == null) return 5;
        return switch (routing.complexity) {
            case SIMPLE -> 2;
            case MODERATE -> 5;
            case COMPLEX -> 8;
        };
    }

    public int estimateMaxIterationsMulti(MultiRoutingResult routing) {
        if (routing == null) return 5;
        int base = switch (routing.complexity) {
            case SIMPLE -> 2;
            case MODERATE -> 5;
            case COMPLEX -> 8;
        };
        int extraIterations = Math.max(0, routing.domains.size() - 1) * 2;
        return base + extraIterations;
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

    @Data
    public static class MultiRoutingResult {
        private final List<ToolDomain> domains;
        private final Complexity complexity;
        private final double confidence;

        public MultiRoutingResult(List<ToolDomain> domains, Complexity complexity, double confidence) {
            this.domains = domains != null ? domains : List.of();
            this.complexity = complexity;
            this.confidence = confidence;
        }

        public static MultiRoutingResult defaultResult() {
            return new MultiRoutingResult(List.of(ToolDomain.GENERAL), Complexity.MODERATE, 0.3);
        }

        public boolean isMultiDomain() {
            return domains.size() > 1;
        }

        public String describeDomains() {
            return domains.stream()
                    .map(d -> d.getLabel())
                    .collect(Collectors.joining("和"));
        }

        // ══════════════════════════════════════════════════════════════════════════
        // 【P2升级】SwarmExecutionEngine 拓扑选择
        // 根据领域数量和复杂度选择合适的 Swarm 拓扑
        // - 2个领域：HIERARCHICAL（顺序协作）
        // - 3个以上领域：STAR（中心协调 + 外围并行）
        // - COMPLEX 复杂度：MESH（全并行）
        // ══════════════════════════════════════════════════════════════════════════

        public String getSwarmTopology() {
            if (complexity == Complexity.COMPLEX && domains.size() >= 3) {
                return "MESH";  // 复杂多领域 → 全并行
            } else if (domains.size() >= 3) {
                return "STAR";  // 多领域 → 星型（中心协调）
            } else if (domains.size() == 2) {
                return "HIERARCHICAL";  // 2个领域 → 层级顺序
            } else {
                return "RING";  // 单领域 → 环形流水线
            }
        }
    }

    public enum Complexity {
        SIMPLE, MODERATE, COMPLEX
    }

    private record CombinationPattern(String name, Pattern regex, List<ToolDomain> domains) {}

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

    private static class CachedMultiRouting {
        final MultiRoutingResult result;
        final long expireAt;

        CachedMultiRouting(MultiRoutingResult result, long ttlMs) {
            this.result = result;
            this.expireAt = System.currentTimeMillis() + ttlMs;
        }

        boolean isExpired() {
            return System.currentTimeMillis() > expireAt;
        }
    }
}
