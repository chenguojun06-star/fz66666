package com.fashion.supplychain.intelligence.helper;

import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * 上下文块意图动态优先级路由器（借鉴 CL4R1T4S "具体而非泛泛"设计）。
 *
 * <p>问题：17 个上下文块用固定低优先级标签，复杂场景下"该有的上下文被缩减"。
 * <p>方案：根据用户意图，把"意图相关块"从低优先级列表移除（保护它们不被缩减）。
 *
 * <p>例如：
 * <ul>
 *   <li>用户问历史订单 → entityMemory 提升优先级（不缩减）</li>
 *   <li>用户问排产/产能 → factoryProfile 提升优先级</li>
 *   <li>用户问知识/SOP → ragContext 提升优先级</li>
 *   <li>用户问趋势/分析 → graphRag 提升优先级</li>
 * </ul>
 */
@Component
@Lazy
public class IntentBasedPriorityRouter {

    /** 默认低优先级块（可被缩减） */
    private static final Set<String> DEFAULT_LOW_PRIORITY = new HashSet<>(Arrays.asList(
            "proceduralMem", "userBehavior", "longTermMem", "masInsight",
            "contextFile", "selfCritique", "graphRag", "factoryProfile"
    ));

    /**
     * 根据用户消息意图，返回该场景下可降级的块列表。
     *
     * <p>意图相关块会从低优先级列表中移除（保护不被缩减）。
     *
     * @param userMessage 用户消息
     * @return 可降级的块标签数组
     */
    public String[] routeLowPriority(String userMessage) {
        if (userMessage == null || userMessage.isBlank()) {
            return DEFAULT_LOW_PRIORITY.toArray(new String[0]);
        }

        Set<String> lowPriority = new HashSet<>(DEFAULT_LOW_PRIORITY);
        String lower = userMessage.toLowerCase();

        // 意图→保护块映射
        if (containsAny(lower, "订单", "款号", "order", "style", "历史", "上次", "刚才", "那个")) {
            lowPriority.remove("entityMemory"); // 实体记忆保护
        }
        if (containsAny(lower, "排产", "产能", "进度", "交期", "工厂", "工期", "排程", "瓶颈")) {
            lowPriority.remove("factoryProfile"); // 工厂画像保护
        }
        if (containsAny(lower, "知识", "规则", "流程", "sop", "怎么", "如何", "标准", "规范")) {
            lowPriority.remove("ragContext"); // RAG保护（但 ragContext 不在默认低优先级，此处预留）
        }
        if (containsAny(lower, "趋势", "分析", "预测", "对比", "排名", "走势", "变化")) {
            lowPriority.remove("graphRag"); // 知识图谱保护
            lowPriority.remove("masInsight"); // 多Agent分析保护
        }
        if (containsAny(lower, "建议", "推荐", "下一步", "怎么办", "怎么处理", "优化")) {
            lowPriority.remove("selfCritique"); // 自我评分保护（用于改进建议）
        }
        if (containsAny(lower, "之前", "上次", "历史", "记住", "记得", "你说过")) {
            lowPriority.remove("longTermMem"); // 长期记忆保护
        }

        return lowPriority.toArray(new String[0]);
    }

    private boolean containsAny(String text, String... keywords) {
        for (String kw : keywords) {
            if (text.contains(kw.toLowerCase())) return true;
        }
        return false;
    }
}
