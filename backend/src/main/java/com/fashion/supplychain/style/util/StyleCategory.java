package com.fashion.supplychain.style.util;

import java.util.HashMap;
import java.util.Map;

/**
 * 品类规范化工具。
 *
 * <p>{@code t_style_info.category} 历史上混杂了中文标签、规范代码（WOMAN/SHIRT/JUPE 等）以及
 * 大小写英文（skirt/shirt/upper）等形态。前端表单/筛选统一用规范代码，因此这里把各种输入的
 * 品类值归一化为【规范代码】再落库或用于筛选；对没有规范代码的历史值（如"上衣""未分类"）保留原样。</p>
 */
public final class StyleCategory {

    private StyleCategory() {
    }

    /** raw（统一去空格并大写）→ 规范代码（或无语义代码时保留中文原样） */
    private static final Map<String, String> CODE = buildMap();

    private static Map<String, String> buildMap() {
        Map<String, String> m = new HashMap<>();
        // 主分类
        put(m, "WOMAN", "女装", "WOMEN", "LADY");
        put(m, "MAN", "男装", "MEN");
        put(m, "KIDS", "童装", "KID", "CHILD", "CHILDREN");
        put(m, "WCMAN", "女童装");
        put(m, "MCMAN", "男童装");
        put(m, "UNISEX", "男女同款");
        put(m, "SPORT", "运动装");
        put(m, "UNDERWEAR", "内衣");
        // 上装
        put(m, "T_SHIRT", "T恤", "TSHIRT", "T恤衫");
        put(m, "SHIRT", "衬衫", "BLOUSE");
        put(m, "HOODIE", "卫衣");
        put(m, "SWEATER", "毛衣", "KNITWEAR", "针织衫");
        put(m, "JACKET", "夹克");
        put(m, "COAT", "大衣");
        put(m, "TRENCH_COAT", "风衣");
        put(m, "DOWN_JACKET", "羽绒服");
        put(m, "PADDED_JACKET", "棉服");
        put(m, "SUIT", "西装");
        put(m, "VEST", "马甲");
        put(m, "BASE_SHIRT", "打底衫");
        // 下装
        put(m, "JUPE", "半身裙", "SKIRT", "裙子");
        put(m, "SHORTS", "短裤", "SHORT");
        put(m, "TROUSERS", "长裤", "PANTS", "裤子");
        put(m, "JEANS", "牛仔裤");
        put(m, "CASUAL_PANTS", "休闲裤");
        put(m, "SWEATPANTS", "运动裤");
        put(m, "BASE_PANTS", "打底裤", "LEGGINGS");
        // 连衣裙 / 连体
        put(m, "DRESS", "连衣裙", "ONEPIECE", "连体连衣裙");
        // 功能场景
        put(m, "YOGA_WEAR", "瑜伽服");
        put(m, "SUN_PROTECTION", "防晒服");
        put(m, "LOUNGEWEAR", "家居服");
        put(m, "SWIMWEAR", "泳装", "SWIMSUIT");
        put(m, "WORKWEAR", "工作服", "UNIFORM");
        // 无规范代码的历史值：统一保留中文标签
        put(m, "上衣", "上衣", "TOP", "TOPS", "UPPER", "上装");
        put(m, "未分类", "未分类", "UNDECLARED", "OTHER", "其它", "其他");
        return m;
    }

    private static void put(Map<String, String> m, String code, String chineseLabel, String... aliases) {
        m.put(code.toUpperCase(), code);
        m.put(chineseLabel.toUpperCase(), code);
        for (String a : aliases) {
            if (a != null) {
                m.put(a.toUpperCase().trim(), code);
            }
        }
    }

    /**
     * 把任意形态的品类值转成规范代码；空值原样返回（由上层决定是否填默认"未分类"）。
     */
    public static String normalize(String raw) {
        if (raw == null || raw.isEmpty()) {
            return raw;
        }
        String t = raw.trim();
        if (t.isEmpty()) {
            return raw;
        }
        String mapped = CODE.get(t.toUpperCase());
        return mapped != null ? mapped : t;
    }
}