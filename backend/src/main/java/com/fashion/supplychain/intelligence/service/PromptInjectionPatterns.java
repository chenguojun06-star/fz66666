package com.fashion.supplychain.intelligence.service;

import java.util.List;
import java.util.regex.Pattern;

/**
 * Prompt 注入检测模式（公共类）。
 *
 * <p>统一管理 prompt injection 的检测模式，供以下组件复用：
 * <ul>
 *   <li>{@link JailbreakDetector} — 用户输入侧越狱检测</li>
 *   <li>{@link com.fashion.supplychain.intelligence.agent.resource.McpResourceSanitizer} — MCP 资源描述清洗</li>
 *   <li>{@link GuardrailsConfigService} — 输入侧净化</li>
 * </ul>
 *
 * <p>参考：
 * <ul>
 *   <li>OWASP LLM Top 10 (2025-2026) — Prompt Injection 列为头号威胁</li>
 *   <li>阿里云 Anolisa 2026 — 规则引擎+轻量分类模型混合扫描器，延迟≤10ms</li>
 *   <li>2026 业界标准 — 规则匹配 + 多语言（中英文）+ 编码绕过防护</li>
 * </ul>
 */
public final class PromptInjectionPatterns {

    private PromptInjectionPatterns() {}

    /** 英文注入短语（大小写不敏感） */
    public static final List<Pattern> ENGLISH_PATTERNS = List.of(
            Pattern.compile("ignore\\s+(all\\s+)?(previous|prior|above)\\s+(instructions?|prompts?|rules?)",
                    Pattern.CASE_INSENSITIVE),
            Pattern.compile("disregard\\s+(all\\s+)?(previous|prior|above|the)\\s+(instructions?|prompts?|rules?|context)",
                    Pattern.CASE_INSENSITIVE),
            Pattern.compile("you\\s+are\\s+now\\s+(a|an)?\\s*(different|new|developer|admin|root|superuser)",
                    Pattern.CASE_INSENSITIVE),
            Pattern.compile("forget\\s+(everything|all|previous|prior)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("new\\s+instructions?\\s*:", Pattern.CASE_INSENSITIVE),
            Pattern.compile("act\\s+as\\s+(if|a|an)\\s*(you|different|admin|root|developer)",
                    Pattern.CASE_INSENSITIVE),
            Pattern.compile("system\\s*:\\s*", Pattern.CASE_INSENSITIVE),
            Pattern.compile("override\\s+(system|safety|policy|rules?)", Pattern.CASE_INSENSITIVE),
            // 补充：常见英文越狱变体
            Pattern.compile("\\bDAN\\b|do\\s+anything\\s+now", Pattern.CASE_INSENSITIVE),
            Pattern.compile("jailbreak|break\\s+out\\s+of\\s+your\\s+restrictions",
                    Pattern.CASE_INSENSITIVE),
            Pattern.compile("you\\s+have\\s+no\\s+(rules|restrictions|limitations|boundaries)",
                    Pattern.CASE_INSENSITIVE),
            Pattern.compile("pretend\\s+(you\\s+are|to\\s+be)\\s+(a|an)?\\s*(different|admin|root|developer|unrestricted)",
                    Pattern.CASE_INSENSITIVE),
            Pattern.compile("enter\\s+(developer|admin|root|debug|maintenance)\\s+mode",
                    Pattern.CASE_INSENSITIVE),
            Pattern.compile("bypass\\s+(your|the|all)\\s+(safety|security|filter|guardrail|restriction)",
                    Pattern.CASE_INSENSITIVE)
    );

    /** 中文注入短语 */
    public static final List<Pattern> CHINESE_PATTERNS = List.of(
            Pattern.compile("忽略(上面|之前|前面|上方|上述)(所有)?(指令|提示|规则|约束|限制)"),
            Pattern.compile("无视(上面|之前|前面|上方|上述)(所有)?(指令|提示|规则|约束|限制|上下文)"),
            Pattern.compile("你现在是(一个)?(不同的|新的|开发者|管理员|root|超级用户|超级管理员)"),
            Pattern.compile("忘记(一切|所有|之前|前面|上述)(内容|指令|规则|约束)?"),
            Pattern.compile("新(的)?指令\\s*[:：]"),
            Pattern.compile("(扮演|假装)(你是|成一个|为)(管理员|root|开发者|超级用户|无限制|不同)"),
            Pattern.compile("(绕过|突破|解除)(你的|所有|系统)(安全|过滤|护栏|限制|规则|约束)"),
            Pattern.compile("进入(开发者|管理员|root|调试|维护)模式"),
            Pattern.compile("你(没有|无)(任何)?(规则|限制|约束|边界|限制)"),
            Pattern.compile("(开启|激活|进入)(DAN|越狱|无限制)模式"),
            Pattern.compile("从现在起(你)?(可以|能)做任何事"),
            Pattern.compile("(我是|这是)(开发者|管理员|root|超级用户|系统管理员)"),
            Pattern.compile("(请|请直接|请立即)?输出(你的|系统)(提示词|prompt|规则|指令|约束)"),
            Pattern.compile("(请|请直接|请立即)?显示(你的|系统)(初始|原始|完整)(提示词|prompt|规则)")
    );

    /** XML 风格标签（开闭标签一起匹配） */
    public static final Pattern TAG_PATTERN = Pattern.compile(
            "</?(system|instruction|prompt|assistant|user|tool|function|im_start|im_end)\\s*>",
            Pattern.CASE_INSENSITIVE
    );

    /** 控制字符（除普通空格） */
    public static final Pattern CONTROL_CHARS = Pattern.compile("[\\p{Cntrl}&&[^\\t\\n\\r]]");

    /**
     * 检测文本是否命中任一注入模式。
     * @param text 待检测文本
     * @return 命中的模式描述（如 "english:DAN"），未命中返回 null
     */
    public static String detect(String text) {
        if (text == null || text.isEmpty()) return null;

        for (Pattern p : ENGLISH_PATTERNS) {
            if (p.matcher(text).find()) {
                return "english:" + p.pattern();
            }
        }
        for (Pattern p : CHINESE_PATTERNS) {
            if (p.matcher(text).find()) {
                return "chinese:" + p.pattern();
            }
        }
        if (TAG_PATTERN.matcher(text).find()) {
            return "xml_tag";
        }
        return null;
    }

    /** 清洗文本：移除 XML 标签 + 控制字符 + 注入短语（不截断） */
    public static String scrub(String text) {
        if (text == null || text.isEmpty()) return text;
        String s = CONTROL_CHARS.matcher(text).replaceAll("");
        s = TAG_PATTERN.matcher(s).replaceAll("");
        for (Pattern p : ENGLISH_PATTERNS) s = p.matcher(s).replaceAll("");
        for (Pattern p : CHINESE_PATTERNS) s = p.matcher(s).replaceAll("");
        return s.replaceAll("\\s{2,}", " ").trim();
    }
}
