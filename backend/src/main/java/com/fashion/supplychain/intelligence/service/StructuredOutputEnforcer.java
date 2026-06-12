package com.fashion.supplychain.intelligence.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

/**
 * 结构化输出强制执行器 — 确保AI回答格式符合预期。
 *
 * <p>核心策略：
 * <ol>
 *   <li>在系统提示词中注入格式要求，引导模型输出结构化内容</li>
 *   <li>提供后处理验证，检测并修复格式问题</li>
 *   <li>对常见场景（订单查询/工厂状态/数据汇总）定义输出模板</li>
 * </ol>
 *
 * <p>设计原则：薄服务层，格式规则外置，不依赖LLM做格式判断。
 */
@Service
@Lazy
@Slf4j
public class StructuredOutputEnforcer {

    // ── 输出格式模板 ──

    /** 订单查询类回答格式要求 */
    public static final String ORDER_FORMAT = """
            【订单查询格式要求】
            当回答涉及订单状态、进度、交期等信息时，请按以下格式组织：
            1. 订单概览：订单号、款号、客户、下单日期（一行）
            2. 当前状态：进度百分比 + 当前工序 + 预计完成时间
            3. 关键节点：列出已完成和待完成的里程碑
            4. 风险提示：如有逾期风险，明确标注
            请使用简洁的列表格式，每条信息一行，不要大段文字。""";

    /** 工厂状态类回答格式要求 */
    public static final String FACTORY_FORMAT = """
            【工厂状态格式要求】
            当回答涉及工厂产能、质量、交期等状态时，请按以下格式组织：
            1. 工厂概览：名称、类型、当前订单数
            2. 产能状态：满载/正常/空闲 + 具体数据
            3. 质量表现：近30天合格率 + 返工率
            4. 交期表现：准时率 + 逾期订单数
            请使用数字说话，禁止模糊表述如"表现不错""还可以"。""";

    /** 数据汇总类回答格式要求 */
    public static final String SUMMARY_FORMAT = """
            【数据汇总格式要求】
            当回答涉及数据统计、汇总、排名时，请按以下格式组织：
            1. 先给出核心结论（一句话）
            2. 再列出关键数据（数字 + 单位）
            3. 最后给出趋势判断（上升/下降/持平）
            禁止使用"据统计""根据数据"等模糊开头，直接说结论。""";

    /** 知识问答类格式要求 */
    public static final String KNOWLEDGE_FORMAT = """
            【知识问答格式要求】
            当回答术语定义、行业知识、操作指南时：
            1. 先给出定义/答案（一句话）
            2. 再给出关键要点（不超过3条）
            3. 如有示例，给出一个具体案例
            禁止长篇大论，禁止引用不存在的"行业标准"。""";

    // ── 格式注入 ──

    /**
     * 根据用户问题类型，返回应注入的格式要求。
     * 返回空字符串表示不需要特殊格式要求。
     */
    public String getFormatHint(String userMessage) {
        if (userMessage == null || userMessage.isBlank()) return "";

        String lower = userMessage.toLowerCase();

        // 订单查询
        if (lower.matches(".*(订单|工单|生产单|进度|交期|状态).*")
                && !lower.matches(".*(怎么|如何|什么是).*")) {
            return ORDER_FORMAT;
        }

        // 工厂状态
        if (lower.matches(".*(工厂|加工厂|供应商|产能|质量|合格率).*")) {
            return FACTORY_FORMAT;
        }

        // 数据汇总
        if (lower.matches(".*(统计|汇总|排名|多少|几个|多少件|多少人).*")) {
            return SUMMARY_FORMAT;
        }

        // 知识问答
        if (lower.matches(".*(什么是|FOB|CMT|ODM|术语|含义|定义).*")) {
            return KNOWLEDGE_FORMAT;
        }

        return "";
    }

    // ── 后处理验证 ──

    /**
     * 后处理检查：验证AI回答是否包含明显的格式问题。
     * @return 修复后的内容，如果无需修复则返回原内容
     */
    public String postProcess(String aiResponse) {
        if (aiResponse == null || aiResponse.isBlank()) return aiResponse;

        String result = aiResponse;

        // 检测1：过度使用的模糊表述（每种表述最多保留2次）
        result = replaceExcessive(result, "据统计", "根据数据分析",
                "根据数据", "根据统计", "据我所知", "根据我的了解", "一般来说", "通常情况下");

        // 检测2：连续重复的段落
        result = deduplicateParagraphs(result);

        // 检测3：过长的无换行文本
        result = breakLongLines(result);

        return result;
    }

    // ── 工具方法 ──

    private String replaceExcessive(String text, String... patterns) {
        String result = text;
        for (String pattern : patterns) {
            int count = 0;
            int idx = 0;
            while ((idx = result.indexOf(pattern, idx)) != -1) {
                count++;
                idx += pattern.length();
            }
            if (count > 2) {
                // 保留前2个，其余替换
                int replaced = 0;
                StringBuilder sb = new StringBuilder();
                int pos = 0;
                while (pos < result.length()) {
                    int next = result.indexOf(pattern, pos);
                    if (next == -1) {
                        sb.append(result.substring(pos));
                        break;
                    }
                    sb.append(result, pos, next);
                    replaced++;
                    if (replaced <= 2) {
                        sb.append(pattern);
                    }
                    pos = next + pattern.length();
                }
                result = sb.toString();
            }
        }
        return result;
    }

    private String deduplicateParagraphs(String text) {
        String[] paragraphs = text.split("\n\n+");
        if (paragraphs.length <= 1) return text;

        StringBuilder sb = new StringBuilder();
        String prev = "";
        for (String p : paragraphs) {
            String trimmed = p.trim();
            if (trimmed.isEmpty()) continue;
            // 计算与前一段的相似度
            if (similarity(prev, trimmed) > 0.8) {
                continue; // 跳过高度重复的段落
            }
            if (!sb.isEmpty()) sb.append("\n\n");
            sb.append(trimmed);
            prev = trimmed;
        }
        return sb.toString();
    }

    private double similarity(String a, String b) {
        if (a.isEmpty() || b.isEmpty()) return 0;
        int maxLen = Math.max(a.length(), b.length());
        int dist = levenshteinDistance(
                a.substring(0, Math.min(a.length(), 100)),
                b.substring(0, Math.min(b.length(), 100)));
        return 1.0 - (double) dist / Math.min(100, maxLen);
    }

    private int levenshteinDistance(String a, String b) {
        int[][] dp = new int[a.length() + 1][b.length() + 1];
        for (int i = 0; i <= a.length(); i++) dp[i][0] = i;
        for (int j = 0; j <= b.length(); j++) dp[0][j] = j;
        for (int i = 1; i <= a.length(); i++) {
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                dp[i][j] = Math.min(Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1), dp[i - 1][j - 1] + cost);
            }
        }
        return dp[a.length()][b.length()];
    }

    private String breakLongLines(String text) {
        // 单行超过200字符且无换行，在句号处插入换行
        StringBuilder sb = new StringBuilder();
        for (String line : text.split("\n")) {
            if (line.length() > 200) {
                sb.append(line.replaceAll("。", "。\n"));
            } else {
                sb.append(line);
            }
            sb.append("\n");
        }
        return sb.toString().trim();
    }
}