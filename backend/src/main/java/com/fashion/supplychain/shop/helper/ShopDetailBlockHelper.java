package com.fashion.supplychain.shop.helper;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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

    /** 单个文字块的长度上限，防止运营把整篇文章塞进一个块把详情页撑爆。 */
    public static final int MAX_TEXT_LEN = 2000;

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
                if (content.length() > MAX_TEXT_LEN) {
                    content = content.substring(0, MAX_TEXT_LEN);
                }
                out.add(block("text", content, null));
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

    private static Map<String, String> block(String type, String content, String url) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("type", type);
        if (content != null) {
            m.put("content", content);
        }
        if (url != null) {
            m.put("url", url);
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
                    out.add(one);
                }
            }
            return out;
        }
        return List.of();
    }
}