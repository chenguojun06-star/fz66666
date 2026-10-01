package com.fashion.supplychain.intelligence.helper;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiToolCall;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * deepseek-flash 新版工具协议（DSML）解析兜底（D-361b）。
 *
 * <p>现象：新版模型偶尔不通过 API 的 tool_calls 结构返回工具调用，而是把内部协议原文
 * （&lt;｜｜DSML｜｜ invoke name="tool_xxx"&gt; / &lt;｜｜DSML｜｜ parameter name="p" string="false"&gt;20）
 * 直接写进 content。旧解析链只认 OpenAI 兼容的 tool_calls 字段，协议原文就会原样泄漏给用户。
 *
 * <p>处理：把协议原文解析回结构化 AiToolCall（工具照常执行），并把标记从展示文本中剥除。
 * 按行状态机实现，对未闭合/残缺标签容错。
 */
public final class DsmlToolCallParser {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 含 DSML 标记的行（开/闭标签均命中；竖线兼容全角｜与半角|） */
    private static final Pattern DSML_LINE = Pattern.compile(".*[｜|]{1,4}\\s*DSML[｜|]{1,4}.*");
    /** 只匹配标记本身（不含行首锚点），供 stripLines 逐段扫描定位；竖线兼容全角｜与半角| */
    private static final Pattern MARKER_ONLY = Pattern.compile("[｜|]{1,4}\\s*DSML[｜|]{1,4}");
    private static final Pattern INVOKE_OPEN = Pattern.compile("invoke\\s+name=\"([^\"]+)\"");
    private static final Pattern PARAM_LINE = Pattern.compile("parameter\\s+name=\"([^\"]+)\"\\s+string=\"(true|false)\"\\s*>(.*)$");

    private DsmlToolCallParser() {
    }

    public static boolean hasMarkup(String content) {
        return content != null && content.contains("DSML");
    }

    /** 解析 content 中的 DSML 工具调用，返回结构化调用列表（不修改原文） */
    public static List<AiToolCall> extractToolCalls(String content) {
        List<AiToolCall> calls = new ArrayList<>();
        if (!hasMarkup(content)) return calls;
        String currentName = null;
        List<String[]> currentParams = new ArrayList<>(); // [name, typedJson]
        for (String line : content.split("\\R", -1)) {
            if (!line.contains("DSML")) continue;
            Matcher inv = INVOKE_OPEN.matcher(line);
            if (inv.find()) {
                flush(currentName, currentParams, calls);
                currentName = inv.group(1);
                continue;
            }
            Matcher pm = PARAM_LINE.matcher(line);
            if (pm.find() && currentName != null) {
                currentParams.add(new String[]{pm.group(1), typedValue(pm.group(3), "true".equals(pm.group(2)))});
            }
        }
        flush(currentName, currentParams, calls);
        return calls;
    }

    /** 从展示文本中剔除所有 DSML 协议行 */
    public static String strip(String content) {
        if (!hasMarkup(content)) return content;
        // 与流式路径共用 stripLines，保证「流式看到的」与「落库后重读的」是同一套清洗结果。
        // 否则同一条回答在流式气泡里被清洗、落库后却是另一副样子。
        return stripLines(content).trim();
    }

    /** 标记前若只剩空白与标签尖括号（'<'、'/'），说明整行都是协议，不含正文 */
    private static final Pattern MARKUP_ONLY_PREFIX = Pattern.compile("^[\\s</]*$");

    /**
     * 流式专用：按行剔除 DSML 协议行，**原样保留其余字符**（不 trim、不改行尾、不补换行）。
     *
     * <p>与 {@link #strip(String)} 的区别：strip 面向一次性完整文本，会 trim；
     * 本方法面向 SSE 增量推送的「已确定完整的行片段」，必须逐字符保真，否则会吞掉回答的换行。
     *
     * <p>存在的意义（D-699）：模型把 {@code <｜｜DSML｜｜} 标记与其后的
     * {@code invoke name=...} / {@code parameter name=...} 行拆到**不同的 SSE delta** 里。
     * 逐 delta 做正则时，续行本身不含 "DSML" 字样 → 逃过清洗 → 协议原文泄漏到前端气泡。
     * 调用方须先用「攒够一个完整换行」的方式切分，再把完整行片段交给本方法。
     *
     * <p>行内处理规则：
     * <ul>
     *   <li>整行都是协议（标记前只有空白 / {@code <} / {@code /}）→ 整行连行尾一起丢弃。</li>
     *   <li>标记前有正常正文（模型偶尔不换行，如 {@code 好的<｜｜DSML｜｜...}）→ 保留正文，
     *       只丢紧贴标记的 {@code <} / {@code </}（那是协议标签本身）与标记后内容；
     *       且不吞该行换行，避免把两行粘成一行。</li>
     * </ul>
     */
    public static String stripLines(String text) {
        if (text == null || text.isEmpty() || !hasMarkup(text)) {
            return text == null ? "" : text;
        }
        StringBuilder out = new StringBuilder(text.length());
        int i = 0;
        while (i < text.length()) {
            Matcher m = MARKER_ONLY.matcher(text);
            m.region(i, text.length());
            if (!m.find()) {
                out.append(text, i, text.length());
                break;
            }
            int lineStart = text.lastIndexOf('\n', m.start() - 1) + 1;
            String prefix = text.substring(lineStart, m.start());
            if (MARKUP_ONLY_PREFIX.matcher(prefix).matches()) {
                out.append(text, i, lineStart);
            } else {
                int keepEnd = m.start();
                while (keepEnd > 0
                        && (text.charAt(keepEnd - 1) == '<' || text.charAt(keepEnd - 1) == '/')) {
                    keepEnd--;
                }
                out.append(text, i, keepEnd);
            }
            int nl = text.indexOf('\n', m.end());
            i = nl >= 0 ? nl + 1 : text.length();
        }
        return out.toString();
    }

    private static void flush(String name, List<String[]> params, List<AiToolCall> calls) {
        if (name == null || name.isBlank()) {
            params.clear();
            return;
        }
        StringBuilder json = new StringBuilder("{");
        for (int i = 0; i < params.size(); i++) {
            if (i > 0) json.append(',');
            json.append(jsonString(params.get(i)[0])).append(':').append(params.get(i)[1]);
        }
        json.append('}');
        AiToolCall tc = new AiToolCall();
        tc.setId("dsml_" + calls.size());
        AiToolCall.AiFunctionCall fn = new AiToolCall.AiFunctionCall();
        fn.setName(name);
        fn.setArguments(json.toString());
        tc.setFunction(fn);
        calls.add(tc);
        params.clear();
    }

    /** string="false" 的值按布尔/整数/浮点解析，均失败回落字符串 */
    private static String typedValue(String raw, boolean asString) {
        String v = raw == null ? "" : raw.trim();
        if (asString) return jsonString(v);
        if (v.equalsIgnoreCase("true") || v.equalsIgnoreCase("false")) return v.toLowerCase();
        try {
            return String.valueOf(Long.parseLong(v));
        } catch (Exception ignore) {
            // 继续尝试浮点
        }
        try {
            return String.valueOf(Double.parseDouble(v));
        } catch (Exception ignore) {
            return jsonString(v);
        }
    }

    private static String jsonString(String s) {
        try {
            return MAPPER.writeValueAsString(s);
        } catch (Exception e) {
            return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
        }
    }
}
