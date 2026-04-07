package com.fashion.supplychain.intelligence.routing;

import com.fashion.supplychain.intelligence.agent.tool.ToolDomain;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Pattern;

/**
 * 领域路由器 — 根据用户消息关键词判定涉及的业务领域，
 * 动态裁剪可见工具集，减少 LLM token 消耗与幻觉。
 * <p>
 * 设计原则：宁多不漏。命中多个领域时全部包含；
 * 无法判断时返回空集（=不裁剪，所有工具可见）。
 */
@Slf4j
@Service
public class AiAgentDomainRouter {

    /**
     * 领域 → 关键词列表（中文 + 英文缩写）
     */
    private static final Map<ToolDomain, List<Pattern>> DOMAIN_PATTERNS;

    static {
        DOMAIN_PATTERNS = new EnumMap<>(ToolDomain.class);

        DOMAIN_PATTERNS.put(ToolDomain.PRODUCTION, compileAll(
                "生产", "订单", "裁剪", "扫码", "进度", "工序", "菲号", "交期",
                "入库", "质检", "返修", "逾期", "产量", "排产", "下单", "推进",
                "回退", "撤回", "工厂", "外发", "产能"
        ));

        DOMAIN_PATTERNS.put(ToolDomain.FINANCE, compileAll(
                "工资", "结算", "对账", "财务", "付款", "薪资", "成本", "费用",
                "账单", "审批", "核销", "毛利", "利润", "收支"
        ));

        DOMAIN_PATTERNS.put(ToolDomain.WAREHOUSE, compileAll(
                "仓库", "库存", "物料", "收发", "采购", "面辅料", "面料",
                "辅料", "备料", "领料", "退料", "盘点"
        ));

        DOMAIN_PATTERNS.put(ToolDomain.STYLE, compileAll(
                "款式", "样衣", "BOM", "设计", "打样", "纸样", "洗水唛",
                "样板", "尺寸", "版型", "模板", "色号"
        ));

        DOMAIN_PATTERNS.put(ToolDomain.ANALYSIS, compileAll(
                "分析", "报告", "统计", "趋势", "对比", "汇总", "预测",
                "风险", "日报", "月报", "周报", "概览", "总览", "雷达"
        ));
    }

    /**
     * 根据用户消息推断涉及的业务领域集合。
     *
     * @param userMessage 原始用户输入
     * @return 命中的领域集合；空集表示无法判断（不裁剪）
     */
    public Set<ToolDomain> route(String userMessage) {
        if (userMessage == null || userMessage.isBlank()) {
            return Collections.emptySet();
        }

        String text = userMessage.toLowerCase(Locale.ROOT);
        Set<ToolDomain> matched = EnumSet.noneOf(ToolDomain.class);

        for (Map.Entry<ToolDomain, List<Pattern>> entry : DOMAIN_PATTERNS.entrySet()) {
            for (Pattern p : entry.getValue()) {
                if (p.matcher(text).find()) {
                    matched.add(entry.getKey());
                    break; // 该领域已命中，跳到下一个领域
                }
            }
        }

        if (!matched.isEmpty()) {
            log.debug("[DomainRouter] 用户意图={}, 命中领域={}", abbreviate(userMessage), matched);
        }
        return matched;
    }

    // ── 内部辅助 ──

    private static List<Pattern> compileAll(String... keywords) {
        List<Pattern> patterns = new ArrayList<>(keywords.length);
        for (String kw : keywords) {
            patterns.add(Pattern.compile(Pattern.quote(kw), Pattern.CASE_INSENSITIVE));
        }
        return patterns;
    }

    private static String abbreviate(String text) {
        return text.length() <= 30 ? text : text.substring(0, 30) + "...";
    }
}
