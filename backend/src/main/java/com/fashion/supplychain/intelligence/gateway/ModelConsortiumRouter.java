package com.fashion.supplychain.intelligence.gateway;

import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * 模型智能路由 — 根据查询复杂度自动选择最优模型。
 * <p>
 * 核心策略：
 * <ul>
 *   <li><b>简单查询</b>（问候、状态查询）→ 快速模型（低成本、低延迟）</li>
 *   <li><b>复杂分析</b>（趋势、对比、多维度）→ 深度推理模型</li>
 *   <li><b>视觉任务</b>（图片分析）→ 视觉模型</li>
 *   <li><b>工具密集</b>（多工具调用）→ 推理增强模型</li>
 * </ul>
 * </p>
 *
 * <p>预计节省 Token 成本 40-60%，简单查询延迟降低 50-70%。</p>
 */
@Slf4j
@Service
public class ModelConsortiumRouter {

    @Value("${ai.model.fast:deepseek-v4-flash}")
    private String fastModel;

    @Value("${ai.model.reasoning:deepseek-v4-flash}")
    private String reasoningModel;

    @Value("${ai.model.vision:doubao-1-5-vision-pro-32k-250115}")
    private String visionModel;

    @Value("${ai.model.default:deepseek-v4-flash}")
    private String defaultModel;

    @Value("${ai.consortium.enabled:true}")
    private boolean consortiumEnabled;

    private final com.github.benmanes.caffeine.cache.Cache<String, Complexity> complexityCache = com.github.benmanes.caffeine.cache.Caffeine.newBuilder()
            .maximumSize(500)
            .expireAfterWrite(5, java.util.concurrent.TimeUnit.MINUTES)
            .build();

    /** 关键词模式 */
    private static final Pattern SIMPLE_GREETING = Pattern.compile(
            "(?s).*(你好|hi|hello|谢谢|再见|你是谁|在吗|早上好|晚上好|晚安).*");
    private static final Pattern COMPLEX_ANALYSIS = Pattern.compile(
            "(?s).*(对比|排名|趋势|分析|汇总|所有|每个|各个|评估|预测|方案|为什么|怎么办|如何优化|"
                    + "哪些.*风险|哪些.*问题|什么问题|什么情况|什么原因|看一下|查一下|帮我查|告诉我|"
                    + "利润|亏损|盈亏|成本|毛利|净利|异常|逾期|延迟|瓶颈).*");
    private static final Pattern TOOL_HEAVY = Pattern.compile(
            "(?s).*(建单|创建订单|审批|结算|撤回|分配|派单|执行|操作|批量|全部|每个订单|所有订单).*");
    private static final Pattern VISUAL_TASK = Pattern.compile(
            "(?s).*(图片|照片|这张图|看看这张|分析这张|识别|扫描件|拍照|截图).*");

    public enum Complexity {
        /** 简单 — 问候、单实体查询、知识问答 */
        SIMPLE,
        /** 中等 — 状态查询、单维度分析 */
        MODERATE,
        /** 复杂 — 多维度分析、趋势预测、风险评估 */
        COMPLEX,
        /** 工具密集 — 需要多个工具协作 */
        TOOL_HEAVY,
        /** 视觉 — 需要图片/文档分析 */
        VISUAL
    }

    /**
     * 根据用户消息判定复杂度并选择模型
     *
     * @param userMessage 用户输入
     * @param hasImage    是否包含图片
     * @param toolCount   当前可用工具数量
     * @return 选中的模型名称
     */
    public String selectModel(String userMessage, boolean hasImage, int toolCount) {
        if (!consortiumEnabled) {
            return defaultModel;
        }

        if (userMessage == null || userMessage.isBlank()) {
            return defaultModel;
        }

        Complexity complexity = classifyComplexity(userMessage, hasImage, toolCount);
        String model = resolveModel(complexity, hasImage);

        log.info("[ModelRouter] 复杂度={} → 模型={} | query={}",
                complexity, model,
                userMessage.length() > 80 ? userMessage.substring(0, 80) + "..." : userMessage);

        return model;
    }

    /**
     * 分类查询复杂度
     */
    public Complexity classifyComplexity(String userMessage, boolean hasImage, int toolCount) {
        // 视觉优先
        if (hasImage) return Complexity.VISUAL;

        String msg = userMessage.trim();

        // 简单问候
        if (msg.length() < 30 && SIMPLE_GREETING.matcher(msg).matches()) {
            return Complexity.SIMPLE;
        }

        // 工具密集
        if (TOOL_HEAVY.matcher(msg).matches()) {
            return Complexity.TOOL_HEAVY;
        }

        // 复杂分析
        if (msg.length() > 80 || COMPLEX_ANALYSIS.matcher(msg).matches()) {
            return Complexity.COMPLEX;
        }

        // 默认为中等
        return Complexity.MODERATE;
    }

    /**
     * 解析复杂度到具体模型
     */
    private String resolveModel(Complexity complexity, boolean hasImage) {
        return switch (complexity) {
            case SIMPLE -> fastModel;
            case COMPLEX, TOOL_HEAVY -> reasoningModel;
            case VISUAL -> visionModel;
            case MODERATE -> defaultModel;
        };
    }

    /**
     * 获取模型的推荐参数
     */
    public ModelParams getModelParams(Complexity complexity) {
        return switch (complexity) {
            case SIMPLE -> new ModelParams(0.3, 512, 15);
            case MODERATE -> new ModelParams(0.5, 1024, 30);
            case COMPLEX -> new ModelParams(0.7, 2048, 60);
            case TOOL_HEAVY -> new ModelParams(0.5, 2048, 60);
            case VISUAL -> new ModelParams(0.5, 1024, 45);
        };
    }

    /**
     * 模型参数
     */
    public record ModelParams(double temperature, int maxTokens, int timeoutSeconds) {}

    // ===== 缓存管理 =====

    /**
     * 缓存复杂度判定
     */
    public void cacheComplexity(String key, Complexity complexity) {
        complexityCache.put(key, complexity);
    }

    public Complexity getCachedComplexity(String key) {
        return complexityCache.getIfPresent(key);
    }

    // ===== 配置热更新 =====

    public void updateFastModel(String model) { this.fastModel = model; }
    public void updateReasoningModel(String model) { this.reasoningModel = model; }
    public void updateVisionModel(String model) { this.visionModel = model; }
    public void updateDefaultModel(String model) { this.defaultModel = model; }
    public void setConsortiumEnabled(boolean enabled) { this.consortiumEnabled = enabled; }

    /**
     * 获取当前配置信息（供管理面板展示）
     */
    public Map<String, Object> getConfig() {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("enabled", consortiumEnabled);
        config.put("fastModel", fastModel);
        config.put("reasoningModel", reasoningModel);
        config.put("visionModel", visionModel);
        config.put("defaultModel", defaultModel);
        config.put("cacheSize", complexityCache.estimatedSize());
        return config;
    }
}
