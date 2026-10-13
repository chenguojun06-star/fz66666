package com.fashion.supplychain.common.util;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * 从大模型输出里「抠」出 JSON 的工具。
 *
 * <p><b>为什么需要它（2026-10-13 线上日志实证）</b>：大模型返回的从来不是干净 JSON ——
 * <ul>
 *   <li>爱加 Markdown 围栏（{@code ```json ... ```}）；</li>
 *   <li>爱在前后加一段解释（"好的，我的分析如下：{...} 希望对你有帮助"）；</li>
 *   <li><b>最要命的是被输出长度截断</b>：内容写到一半就没了，JSON 结构不闭合。
 *       线上实例：CEO 智能体的 {@code recommendedAction} 写到"…并评估外"就断了，
 *       直接 {@code JSON.readValue} 必然抛 {@code JsonEOFException}，
 *       整条诊断降级成"解析失败"。</li>
 * </ul>
 *
 * <p>本工具做三件事：**去围栏 → 抠出最外层 JSON 值 → 截断时尽量修补**。
 * 修补只保证「结构能解析」，不保证内容完整 —— 截断掉的部分就是没有，
 * 调用方要按"部分数据"处理，而不是当成完整结果。
 *
 * <p>注意：这里刻意不做"猜内容"（比如补一个假的结束语），只做结构闭合。
 * 宁可让 {@code content} 少半句，也不要凭空编一句。
 */
public final class LlmJsonUtils {

    private static final ObjectMapper MAPPER = new ObjectMapper()
            // 模型偶尔多给一个字段/字段名写错，不该让整条解析失败
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private LlmJsonUtils() {
    }

    /**
     * 从模型原始输出里抠出可解析的 JSON 文本。
     *
     * @return 可解析的 JSON 字符串；完全找不到 JSON 结构时返回 {@code null}
     */
    public static String extractJson(String raw) {
        if (raw == null) {
            return null;
        }
        String s = stripCodeFence(raw.trim());
        int start = indexOfJsonStart(s);
        if (start < 0) {
            return null;
        }

        Deque<Character> stack = new ArrayDeque<>();
        boolean inString = false;
        boolean escaped = false;
        for (int i = start; i < s.length(); i++) {
            char c = s.charAt(i);
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (c == '\\') {
                    escaped = true;
                } else if (c == '"') {
                    inString = false;
                }
                continue;
            }
            if (c == '"') {
                inString = true;
            } else if (c == '{') {
                stack.push('}');
            } else if (c == '[') {
                stack.push(']');
            } else if (c == '}' || c == ']') {
                if (stack.isEmpty() || stack.peek() != c) {
                    // 结构本身就是坏的（括号错配），不做猜测
                    return null;
                }
                stack.pop();
                if (stack.isEmpty()) {
                    return s.substring(start, i + 1);
                }
            }
        }

        // 走到这里说明没闭合 —— 模型输出被截断了，尽力修补结构
        return repairTruncated(s.substring(start), stack, inString);
    }

    /**
     * 解析模型输出为对象。先 {@link #extractJson} 再反序列化。
     *
     * @throws IllegalArgumentException 抠不出 JSON 或反序列化失败（带原始片段便于排查）
     */
    public static <T> T parse(String raw, Class<T> type) {
        String json = extractJson(raw);
        if (json == null) {
            throw new IllegalArgumentException("模型输出里找不到 JSON 结构: " + snippet(raw));
        }
        try {
            return MAPPER.readValue(json, type);
        } catch (Exception e) {
            throw new IllegalArgumentException(
                    "模型输出 JSON 反序列化失败(" + e.getMessage() + "): " + snippet(json), e);
        }
    }

    /** 去 Markdown 代码围栏（```json ... ``` / ``` ... ```） */
    private static String stripCodeFence(String s) {
        if (!s.startsWith("```")) {
            return s;
        }
        int firstNewline = s.indexOf('\n');
        if (firstNewline < 0) {
            return s;
        }
        String body = s.substring(firstNewline + 1);
        int closing = body.lastIndexOf("```");
        if (closing >= 0) {
            body = body.substring(0, closing);
        }
        return body.trim();
    }

    /** 找第一个可能是 JSON 起始的 { 或 [ */
    private static int indexOfJsonStart(String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '{' || c == '[') {
                return i;
            }
        }
        return -1;
    }

    /**
     * 修补被截断的 JSON：闭合未结束的字符串、去掉尾部悬挂的片段、补齐未闭合的括号。
     *
     * @param tail   从第一个 { / [ 开始到结尾的片段
     * @param stack  已扫描出的待闭合括号（栈顶是最近一个需要补的）
     * @param inString 截断处是否正处在字符串里
     */
    private static String repairTruncated(String tail, Deque<Character> stack, boolean inString) {
        StringBuilder sb = new StringBuilder(tail);
        if (inString) {
            // 断在字符串中间：把字符串收尾。转义符残缺（结尾是单个 \）时先去掉它
            if (sb.length() > 0 && sb.charAt(sb.length() - 1) == '\\') {
                sb.setLength(sb.length() - 1);
            }
            sb.append('"');
        }
        dropDanglingTail(sb);
        while (!stack.isEmpty()) {
            sb.append(stack.pop());
        }
        return sb.toString();
    }

    /**
     * 去掉尾部"悬挂"的片段，让 JSON 能合法闭合。
     *
     * <p>截断点可能落在这些位置，逐个处理：
     * <pre>
     *   {"a":1,               → 去掉末尾逗号
     *   {"a":1,"b":           → 去掉 "b":
     *   {"a":1,"b"            → 去掉 ,"b"（有 key 没值）
     *   {"a":{"x":1,"y":      → 逐层处理，最后补齐 }
     *   {"a":{"x":1,          → 空容器留着（{"a":{}} 里那个 {} 是有意义的）
     * </pre>
     */
    private static void dropDanglingTail(StringBuilder sb) {
        while (sb.length() > 0) {
            trimTrailingWhitespace(sb);
            if (sb.length() == 0) {
                break;
            }
            char last = sb.charAt(sb.length() - 1);

            if (last == ',' || last == ':') {
                sb.setLength(sb.length() - 1);
                continue;
            }

            if (last == '"') {
                int start = findStringStartBefore(sb, sb.length() - 1);
                if (start < 0) {
                    break;
                }
                char before = charBefore(sb, start);
                if (before == ':') {
                    // 这是一个"值"（字符串值），结构上是完整的，保留
                    break;
                }
                if (before == ',') {
                    // key 位置但没写值 → 连逗号一起删
                    sb.setLength(start - 1);
                    continue;
                }
                if (before == '{') {
                    // key 位置且是第一个 → 只删 key，留 {（后面会补成 {}）
                    sb.setLength(start);
                    continue;
                }
                break;
            }

            if (last == '{' || last == '[') {
                if (charBefore(sb, sb.length() - 1) == ':') {
                    // "key":{ 这种悬挂的 key 也删掉
                    sb.setLength(sb.length() - 1);
                    continue;
                }
                // 合法的空对象/空数组，保留
                break;
            }

            break;
        }
    }

    private static void trimTrailingWhitespace(StringBuilder sb) {
        while (sb.length() > 0 && Character.isWhitespace(sb.charAt(sb.length() - 1))) {
            sb.setLength(sb.length() - 1);
        }
    }

    /** index 之前（跳过空白）的字符；没有则返回 '\0' */
    private static char charBefore(StringBuilder sb, int index) {
        int i = index - 1;
        while (i >= 0 && Character.isWhitespace(sb.charAt(i))) {
            i--;
        }
        return i >= 0 ? sb.charAt(i) : '\0';
    }

    /** 从 endQuote 位置（一个字符串的结束引号）往回找它的开始引号下标 */
    private static int findStringStartBefore(StringBuilder sb, int endQuote) {
        boolean escaped = false;
        for (int i = endQuote - 1; i >= 0; i--) {
            char c = sb.charAt(i);
            if (escaped) {
                escaped = false;
                continue;
            }
            if (c == '\\') {
                escaped = true;
            } else if (c == '"') {
                return i;
            }
        }
        return -1;
    }

    private static String snippet(String s) {
        if (s == null) {
            return "null";
        }
        String t = s.replace('\n', ' ').trim();
        return t.length() <= 200 ? t : t.substring(0, 200) + "…(共" + t.length() + "字)";
    }
}
