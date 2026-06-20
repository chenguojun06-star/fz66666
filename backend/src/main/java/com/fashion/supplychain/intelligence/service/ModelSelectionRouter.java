package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.agent.loop.AgentLoopContext;
import com.fashion.supplychain.intelligence.helper.XiaoyunPatterns;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Per-call 模型选择路由器（借鉴 Claude Agent SDK per-call model selection）。
 *
 * <p>问题：所有 AI 任务用同一模型，简单查询浪费成本，复杂排产又可能能力不足。
 * <p>方案：根据任务复杂度路由到不同模型分级。
 *
 * <p>三级模型：
 * <ul>
 *   <li>{@link ModelTier#ECONOMY} — 经济型：简单查询（如"今天多少款"）→ GLM-Flash</li>
 *   <li>{@link ModelTier#STANDARD} — 标准型：普通对话（如"这个款号进度"）→ GLM-4</li>
 *   <li>{@link ModelTier#PREMIUM} — 旗舰型：复杂排产/多域分析（如"排产优化建议"）→ GLM-4-Plus</li>
 * </ul>
 *
 * <p>复杂度评估四维度（取最高级别）：
 * <ol>
 *   <li>用户消息长度</li>
 *   <li>意图关键词（排产/优化/分析 → PREMIUM；查询/列出 → ECONOMY）</li>
 *   <li>工具调用数</li>
 *   <li>多域标识（AgentLoopContext.routedDomains.size > 1 → PREMIUM）</li>
 * </ol>
 */
@Slf4j
@Service
@Lazy
public class ModelSelectionRouter {

    /** 消息长度阈值 */
    private static final int ECONOMY_MAX_LEN = 20;
    private static final int STANDARD_MAX_LEN = 100;
    /** 工具调用数阈值 */
    private static final int ECONOMY_MAX_TOOLS = 2;
    private static final int STANDARD_MAX_TOOLS = 5;

    /** PREMIUM 意图关键词 */
    private static final String[] PREMIUM_KEYWORDS = {
            "排产", "优化", "分析", "预测", "对比", "趋势", "瓶颈", "方案", "建议",
            "汇总", "排名", "评估", "如何优化", "怎么办"
    };
    /** ECONOMY 意图关键词 */
    private static final String[] ECONOMY_KEYWORDS = {
            "查询", "列出", "多少", "是什么", "是谁", "在吗", "你好", "谢谢"
    };

    @Value("${xiaoyun.model-selection.enabled:true}")
    private boolean enabled;

    @Value("${xiaoyun.model-selection.economy.model-id:glm-4-flash}")
    private String economyModelId;
    @Value("${xiaoyun.model-selection.economy.max-tokens:1024}")
    private int economyMaxTokens;

    @Value("${xiaoyun.model-selection.standard.model-id:glm-4}")
    private String standardModelId;
    @Value("${xiaoyun.model-selection.standard.max-tokens:2048}")
    private int standardMaxTokens;

    @Value("${xiaoyun.model-selection.premium.model-id:glm-4-plus}")
    private String premiumModelId;
    @Value("${xiaoyun.model-selection.premium.max-tokens:4096}")
    private int premiumMaxTokens;

    /** 模型选择分布统计（D-021 合规可观测） */
    private final AtomicLong economyCount = new AtomicLong(0);
    private final AtomicLong standardCount = new AtomicLong(0);
    private final AtomicLong premiumCount = new AtomicLong(0);

    /** 模型分级 */
    public enum ModelTier {
        ECONOMY,
        STANDARD,
        PREMIUM
    }

    /**
     * 根据任务复杂度选择模型分级（综合评估四维度，取最高级别）。
     *
     * @param userMessage        用户消息
     * @param estimatedToolCalls 预估工具调用数
     * @param isMultiDomain      是否多域任务
     * @return 模型分级
     */
    public ModelTier selectModel(String userMessage, int estimatedToolCalls, boolean isMultiDomain) {
        if (!enabled) {
            return ModelTier.STANDARD;
        }
        ModelTier tier = evaluateComplexity(userMessage, estimatedToolCalls, isMultiDomain);
        recordSelection(tier);
        log.info("[ModelSelection] tier={} msgLen={} toolCalls={} multiDomain={} | query={}",
                tier,
                userMessage != null ? userMessage.length() : 0,
                estimatedToolCalls, isMultiDomain,
                userMessage != null && userMessage.length() > 60
                        ? userMessage.substring(0, 60) + "..." : userMessage);
        return tier;
    }

    /** 综合评估四维度，取最高级别 */
    private ModelTier evaluateComplexity(String userMessage, int estimatedToolCalls, boolean isMultiDomain) {
        ModelTier byLength = tierByLength(userMessage);
        ModelTier byIntent = tierByIntent(userMessage);
        ModelTier byTools = tierByToolCalls(estimatedToolCalls);
        ModelTier byDomain = isMultiDomain ? ModelTier.PREMIUM : ModelTier.ECONOMY;
        return highest(byLength, byIntent, byTools, byDomain);
    }

    private ModelTier tierByLength(String msg) {
        if (msg == null) return ModelTier.ECONOMY;
        int len = msg.length();
        if (len < ECONOMY_MAX_LEN) return ModelTier.ECONOMY;
        if (len <= STANDARD_MAX_LEN) return ModelTier.STANDARD;
        return ModelTier.PREMIUM;
    }

    private ModelTier tierByIntent(String msg) {
        if (msg == null || msg.isBlank()) return ModelTier.ECONOMY;
        String lower = msg.toLowerCase();
        if (containsAny(lower, PREMIUM_KEYWORDS)) return ModelTier.PREMIUM;
        if (containsAny(lower, ECONOMY_KEYWORDS)) return ModelTier.ECONOMY;
        return ModelTier.STANDARD;
    }

    private ModelTier tierByToolCalls(int toolCalls) {
        if (toolCalls <= ECONOMY_MAX_TOOLS) return ModelTier.ECONOMY;
        if (toolCalls <= STANDARD_MAX_TOOLS) return ModelTier.STANDARD;
        return ModelTier.PREMIUM;
    }

    private ModelTier highest(ModelTier... tiers) {
        ModelTier result = ModelTier.ECONOMY;
        for (ModelTier t : tiers) {
            if (t.ordinal() > result.ordinal()) {
                result = t;
            }
        }
        return result;
    }

    private boolean containsAny(String text, String[] keywords) {
        for (String kw : keywords) {
            if (text.contains(kw.toLowerCase())) return true;
        }
        return false;
    }

    /**
     * 从分级解析到具体模型 ID。
     *
     * @param tier 模型分级
     * @return 模型 ID
     */
    public String resolveModelId(ModelTier tier) {
        return switch (tier) {
            case ECONOMY -> economyModelId;
            case STANDARD -> standardModelId;
            case PREMIUM -> premiumModelId;
        };
    }

    /** 获取分级的 max-tokens 配置 */
    public int resolveMaxTokens(ModelTier tier) {
        return switch (tier) {
            case ECONOMY -> economyMaxTokens;
            case STANDARD -> standardMaxTokens;
            case PREMIUM -> premiumMaxTokens;
        };
    }

    /**
     * 运行时升级判断：工具调用超预期或多域展开时升级到 PREMIUM。
     *
     * @param current 当前分级
     * @param ctx     Agent 循环上下文
     * @return true 表示应升级到 PREMIUM
     */
    public boolean shouldUpgrade(ModelTier current, AgentLoopContext ctx) {
        if (!enabled || current == ModelTier.PREMIUM) return false;
        if (ctx == null) return false;
        // 工具调用数超过 STANDARD 阈值 → 升级
        int actualToolCalls = ctx.getAllExecRecords() != null ? ctx.getAllExecRecords().size() : 0;
        if (actualToolCalls > STANDARD_MAX_TOOLS) {
            log.info("[ModelSelection] 运行时升级 {} → PREMIUM (toolCalls={})", current, actualToolCalls);
            return true;
        }
        // 多域展开 → 升级
        Set<?> domains = ctx.getRoutedDomains();
        if (domains != null && domains.size() > 1) {
            log.info("[ModelSelection] 运行时升级 {} → PREMIUM (multiDomain={})", current, domains.size());
            return true;
        }
        // 复杂分析意图 → 升级
        if (XiaoyunPatterns.isComplexTrigger(ctx.getUserMessage())) {
            log.info("[ModelSelection] 运行时升级 {} → PREMIUM (complexTrigger)", current);
            return true;
        }
        return false;
    }

    private void recordSelection(ModelTier tier) {
        switch (tier) {
            case ECONOMY -> economyCount.incrementAndGet();
            case STANDARD -> standardCount.incrementAndGet();
            case PREMIUM -> premiumCount.incrementAndGet();
        }
    }

    /** 获取模型选择分布统计（D-021 合规） */
    public Map<String, Object> getSelectionStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("enabled", enabled);
        stats.put("economy", economyCount.get());
        stats.put("standard", standardCount.get());
        stats.put("premium", premiumCount.get());
        long total = economyCount.get() + standardCount.get() + premiumCount.get();
        stats.put("total", total);
        if (total > 0) {
            Map<String, Object> distribution = new LinkedHashMap<>();
            distribution.put("economy", String.format("%.1f%%", 100.0 * economyCount.get() / total));
            distribution.put("standard", String.format("%.1f%%", 100.0 * standardCount.get() / total));
            distribution.put("premium", String.format("%.1f%%", 100.0 * premiumCount.get() / total));
            stats.put("distribution", distribution);
        }
        return stats;
    }

    public boolean isEnabled() {
        return enabled;
    }
}
