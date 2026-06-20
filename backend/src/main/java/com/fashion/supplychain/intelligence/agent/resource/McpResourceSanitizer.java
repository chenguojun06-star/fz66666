package com.fashion.supplychain.intelligence.agent.resource;

import java.util.List;
import java.util.regex.Pattern;

/**
 * MCP Resource description sanitizer — 防 prompt injection。
 *
 * <p>背景：2026-03 披露 MCP resource description 字段 prompt injection 漏洞
 * （影响 Firecrawl / Context7 等）。恶意 description 可在 LLM 上下文中注入指令，
 * 诱导模型执行越权操作。
 *
 * <p>本类对所有暴露给外部 LLM 的 description 字段做统一清洗：
 * <ul>
 *   <li>移除 XML 风格标签（&lt;system&gt; / &lt;instruction&gt; / &lt;prompt&gt; 等）</li>
 *   <li>移除常见注入短语（"ignore previous"、"you are now"、"disregard above" 等）</li>
 *   <li>移除控制字符（\r \n \t 等不可见字符）</li>
 *   <li>截断长度 ≤500 字符，防止超长 payload</li>
 * </ul>
 *
 * <p>调用点：所有 {@link McpResourceProvider#listResources} 返回前 + 
 * {@link com.fashion.supplychain.intelligence.service.McpProtocolService#listResources} 聚合时（双保险）。
 */
public final class McpResourceSanitizer {

    /** 最大描述长度（超出截断） */
    private static final int MAX_LENGTH = 500;

    /** 需要移除的 XML 风格标签（开闭标签一起匹配） */
    private static final Pattern TAG_PATTERN = Pattern.compile(
            "</?(system|instruction|prompt|assistant|user|tool|function|im_start|im_end)\\s*>",
            Pattern.CASE_INSENSITIVE
    );

    /** 常见 prompt injection 短语（大小写不敏感） */
    private static final List<Pattern> INJECTION_PATTERNS = List.of(
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
            Pattern.compile("override\\s+(system|safety|policy|rules?)", Pattern.CASE_INSENSITIVE)
    );

    /** 控制字符（除普通空格） */
    private static final Pattern CONTROL_CHARS = Pattern.compile("[\\p{Cntrl}&&[^\\t\\n\\r]]");

    private McpResourceSanitizer() {
        // 工具类，禁止实例化
    }

    /**
     * 清洗 description 字段，防止 prompt injection。
     *
     * @param desc 原始描述（可能为 null）
     * @return 清洗后的安全描述（null 输入返回空串）
     */
    public static String sanitizeDescription(String desc) {
        if (desc == null || desc.isEmpty()) {
            return "";
        }

        String s = desc;

        // 1. 移除控制字符（保留 \t \n \r）
        s = CONTROL_CHARS.matcher(s).replaceAll("");

        // 2. 移除 XML 风格标签
        s = TAG_PATTERN.matcher(s).replaceAll("");

        // 3. 移除注入短语
        for (Pattern p : INJECTION_PATTERNS) {
            s = p.matcher(s).replaceAll("");
        }

        // 4. 压缩多余空白
        s = s.replaceAll("\\s{2,}", " ").trim();

        // 5. 截断长度
        if (s.length() > MAX_LENGTH) {
            s = s.substring(0, MAX_LENGTH);
        }

        return s;
    }
}
