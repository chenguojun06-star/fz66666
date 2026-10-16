package com.fashion.supplychain.shop.helper;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * D-806：详情描述内容块（图 + 文交错）的**唯一**解析/归一化出口。
 *
 * <p>写入侧（管理端保存）与读取侧（顾客端下发）都必须走这里，否则会出现
 * 「保存时按 20 块截断、下发时不过滤」这类不一致 —— 症状是顾客端看到的
 * 块数和运营保存的不一样，且没有任何报错。
 */
public final class ShopDetailBlockHelper {

    /**
     * 平台上限：淘宝/天猫「电脑版描述最多支持发布 20 个有内容的描述模块」。
     * 这里按**块**算（而不是按图算），因为平台的限制对象就是「描述模块」。
     */
    public static final int MAX_BLOCKS = 20;

    /**
     * 单个文字块的**原始标记**长度上限，防止把整篇文章塞进一个块把详情页撑爆。
     * 富文本的标签本身也要占字符，所以比纯文本宽松。
     */
    public static final int MAX_TEXT_LEN = 5000;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ShopDetailBlockHelper() {
    }

    /**
     * 归一化任意来源的内容块（Map 或字符串），过滤脏数据并截断到上限。
     *
     * <p><b>丢弃规则</b>（宁可少一块，也不要给顾客看到半截内容）：
     * <ul>
     *   <li>type 不是 image/text → 丢弃</li>
     *   <li>image 的 url 为空 → 丢弃（否则渲染出一个空图框）</li>
     *   <li>text 的 content 为空 → 丢弃（同上，留个空白块更糟）</li>
     * </ul>
     *
     * @return 有序内容块；入参为空或全部非法时返回空列表
     */
    public static List<Map<String, String>> normalize(Object raw) {
        List<Map<String, String>> out = new ArrayList<>();
        for (Map<String, String> b : read(raw)) {
            if (out.size() == MAX_BLOCKS) {
                break;
            }
            String type = b.get("type");
            if ("image".equals(type)) {
                String url = trim(b.get("url"));
                if (url == null) {
                    continue;
                }
                out.add(block("image", null, url));
            } else if ("text".equals(type)) {
                String content = trim(b.get("content"));
                if (content == null) {
                    continue;
                }
                // D-809：富文本入库前先清洗。渲染层（C 端 richHtml）也会再过滤一次，
                // 但只在渲染时过滤意味着库里躺着一段可执行的 HTML ——
                // 任何绕过 C 端的下游（导出、分享卡片、其它端）都会中招。
                content = sanitizeRichText(content);
                if (!StringUtils.hasText(content)) {
                    // 清洗后空了的（整段都是危险标签）直接丢弃，
                    // 留一个空块会让顾客看到凭空多出一段空白
                    continue;
                }
                if (content.length() > MAX_TEXT_LEN) {
                    content = content.substring(0, MAX_TEXT_LEN);
                }
                // D-810：caption=1 表示这段文字是「上面那张图的说明」，
                // 顾客端会用图注样式（紧贴图片、无大间距、字号小一号）。
                // 运营不勾就是普通段落，行为与 D-809 一致。
                String caption = b.get("caption");
                out.add(block("text", content, null, "1".equals(caption) || "true".equals(caption)));
            }
        }
        return out;
    }

    /**
     * 把 blocksJson 解析成有序内容块；解析失败或为空时返回空列表。
     *
     * <p>空列表的语义是「没有内容块」，调用方据此回退读 gallery ——
     * 这条回退链路是老数据唯一的展示路径，不能省。
     */
    public static List<Map<String, String>> parse(String blocksJson) {
        if (!StringUtils.hasText(blocksJson)) {
            return List.of();
        }
        try {
            return normalize(MAPPER.readValue(blocksJson, new TypeReference<List<Map<String, String>>>() { }));
        } catch (Exception e) {
            return List.of();
        }
    }

    /** 序列化为 JSON；空列表返回 {@code "[]"}，不返回 null。 */
    public static String toJson(List<Map<String, String>> blocks) {
        try {
            return MAPPER.writeValueAsString(normalize(blocks));
        } catch (Exception e) {
            throw new IllegalStateException("详情内容块序列化失败: " + e.getMessage(), e);
        }
    }

    /**
     * 顾客端下发的纵向详情流。
     *
     * <p><b>刻意不做 gallery 回落</b>：D-808 把「顶部轮播」与「纵向详情流」
     * 拆成两个字段后，gallery 归顶部轮播（D-782 契约）、
     * blocks 归纵向详情流。若这里再回落 gallery，同一批图会
     * 既在顶部轮播出现、又在下面整条流里重复出现 —— 顾客看到的是
     * 「同一张图连着出现两次」。
     *
     * <p>没有内容块就是没有详情流：不生成、不兜底、不编造。
     */
    public static List<Map<String, String>> forCustomer(String blocksJson) {
        return parse(blocksJson);
    }

    /**
     * D-809：富文本白名单清洗。
     *
     * <p><b>与 C 端 {@code richHtml} 保持同一份白名单</b>
     * （p/div/span/strong/em/b/i/u/ul/ol/li/h1–h6/br/img）：两边规则不一致时，
     * 会出现「后台看着有样式、顾客端整段被转义成文本」的错位。
     *
     * <p><b>为什么不用正则一把梭</b>：正则可以绕过（大小写、畸形闭合、
     * 属性里藏协议）。这里是纵深防御的第一道 —— 渲染层的正则过滤仍然保留，
     * 两道一起用，而不是二选一。
     */
    public static String sanitizeRichText(String html) {
        if (!StringUtils.hasText(html)) {
            return "";
        }
        String out = html;
        // ① 整段移除危险标签及其内容
        out = SCRIPT_LIKE.matcher(out).replaceAll("");
        // ② 残留的危险开标签（如未闭合的 script）
        out = DANGEROUS_OPEN.matcher(out).replaceAll("");
        // ③ 事件属性（onclick / onerror / onload…）
        out = EVENT_ATTR.matcher(out).replaceAll("");
        // ④ javascript: 伪协议
        out = JS_PROTOCOL.matcher(out).replaceAll("");
        // ⑤ 白名单外的标签：只把开头的 '<' 转义，**保留标签名**。
        //    整段 replaceAll("&lt;") 会把 <marquee> 连标签名一起吃掉，
        //    顾客看到的是「&lt;滚动字&lt;」这种乱码 —— 那不是转义，是损坏。
        Matcher m = NON_WHITELIST_TAG.matcher(out);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            m.appendReplacement(sb, Matcher.quoteReplacement(m.group().replaceFirst("<", "&lt;")));
        }
        m.appendTail(sb);
        return sb.toString().trim();
    }

    /** 危险标签及其内容（含未闭合写法）。 */
    private static final Pattern SCRIPT_LIKE = Pattern.compile(
            "<\\s*(script|iframe|object|embed|link|meta|form|style|svg|math)\\b[\\s\\S]*?(</\\s*\\1\\s*>|$)",
            Pattern.CASE_INSENSITIVE);
    /** 残留的危险开标签。 */
    private static final Pattern DANGEROUS_OPEN = Pattern.compile(
            "<\\s*/?\\s*(script|iframe|object|embed|link|meta|form|style|svg|math)\\b[^>]*>?",
            Pattern.CASE_INSENSITIVE);
    /** on* 事件属性。 */
    private static final Pattern EVENT_ATTR = Pattern.compile(
            "\\s+on[a-z]+\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]+)", Pattern.CASE_INSENSITIVE);
    /** javascript: 伪协议。 */
    private static final Pattern JS_PROTOCOL = Pattern.compile(
            "\\b(javascript|vbscript)\\s*:", Pattern.CASE_INSENSITIVE);
    /** 白名单外的标签：转义其开标签，避免内容被吞。 */
    private static final Pattern NON_WHITELIST_TAG = Pattern.compile(
            "<\\s*/?\\s*(?!img|p|br|div|span|strong|em|b|i|u|ul|ol|li|h[1-6])[a-z][a-z0-9]*\\b[^>]*>?",
            Pattern.CASE_INSENSITIVE);

    private static Map<String, String> block(String type, String content, String url) {
        return block(type, content, url, false);
    }

    private static Map<String, String> block(String type, String content, String url, boolean caption) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("type", type);
        if (content != null) {
            m.put("content", content);
        }
        if (url != null) {
            m.put("url", url);
        }
        // 只在图注时才带这个键，避免每段普通文字都多一个字段
        if (caption) {
            m.put("caption", "1");
        }
        return m;
    }

    private static String trim(String s) {
        if (!StringUtils.hasText(s)) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    /** 供 {@link #normalize(Object)} 的 String 入参走 JSON 解析。 */
    @SuppressWarnings("unchecked")
    private static List<Map<String, String>> read(Object raw) {
        if (raw == null) {
            return List.of();
        }
        if (raw instanceof String s) {
            try {
                return MAPPER.readValue(s, new TypeReference<List<Map<String, String>>>() { });
            } catch (Exception e) {
                return List.of();
            }
        }
        if (raw instanceof List<?> list) {
            List<Map<String, String>> out = new ArrayList<>();
            for (Object o : list) {
                if (o instanceof Map<?, ?> m) {
                    Map<String, String> one = new LinkedHashMap<>();
                    Object t = m.get("type");
                    Object u = m.get("url");
                    Object c = m.get("content");
                    if (t != null) {
                        one.put("type", String.valueOf(t));
                    }
                    if (u != null) {
                        one.put("url", String.valueOf(u));
                    }
                    if (c != null) {
                        one.put("content", String.valueOf(c));
                    }
                    Object cap = m.get("caption");
                    if (cap != null) {
                        one.put("caption", String.valueOf(cap));
                    }
                    out.add(one);
                }
            }
            return out;
        }
        return List.of();
    }
}