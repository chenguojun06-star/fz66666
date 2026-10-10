package com.fashion.supplychain.shop.orchestration;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 类目词表（电商侧统一口径）。
 *
 * <p><b>为什么需要它</b>：线上平台首页的类目一度是<b>中英混杂</b>的 ——
 * {@code WOMAN / 上衣 / SKIRT / 旗袍 / JACKET / DRESS}。
 * 根因是「类目」取的是款式资料里的**自由文本**字段：老数据存的是英文代码，
 * 后来有人手填了中文，于是同一份数据里出现两套写法。
 *
 * <p><b>做法（与成熟平台对齐，但更轻）</b>：
 * <ul>
 *   <li>不引入三级类目树（那套对服装批发太重，商家要维护几十个节点）；</li>
 *   <li>只保留**一份中文词表**：每个类目一个规范代码 + 一个中文名 + 一组别名；</li>
 *   <li>展示时一律转中文（{@link #displayName}），筛选时把中文/英文/别名
 *       归到同一个规范代码上（{@link #aliasesOf}），所以老数据不需要批量改库
 *       —— 改库会动到生产/裁床等其它模块共用的字段，风险远大于收益。</li>
 * </ul>
 *
 * <p><b>为什么不直接读 t_dict</b>：t_dict 是租户级可维护字典，但 C 端公开链路没有
 * 租户上下文、平台首页又是跨租户展示，两边拿不到同一份数据。词表放在代码里
 * 才是「全站唯一口径」；商家上架时选的是同一套代码，落库仍是原来的字段。
 */
@Component
public class ShopCategorySupport {

    /** 一个类目项：规范代码 + 中文名 + 全部可识别别名（含代码本身与中文名） */
    public record Option(String code, String name, List<String> aliases) {
    }

    private static final List<Option> OPTIONS = List.of(
            // 主分类
            opt("WOMAN", "女装", "WOMEN", "LADY", "女士"),
            opt("MAN", "男装", "MEN", "男士"),
            opt("KIDS", "童装", "KID", "CHILD", "CHILDREN"),
            opt("WCMAN", "女童装"),
            opt("MCMAN", "男童装"),
            opt("UNISEX", "男女同款", "中性"),
            opt("SPORT", "运动装", "运动"),
            opt("UNDERWEAR", "内衣"),
            // 上装
            opt("TOP", "上衣", "TOPS", "UPPER"),
            opt("T_SHIRT", "T恤", "TSHIRT", "TEE"),
            opt("SHIRT", "衬衫", "BLOUSE"),
            opt("HOODIE", "卫衣"),
            opt("SWEATER", "毛衣", "KNITWEAR", "针织衫"),
            opt("JACKET", "夹克"),
            opt("COAT", "大衣"),
            opt("TRENCH_COAT", "风衣"),
            opt("DOWN_JACKET", "羽绒服"),
            opt("PADDED_JACKET", "棉服"),
            opt("SUIT", "西装"),
            opt("VEST", "马甲"),
            opt("BASE_SHIRT", "打底衫"),
            // 下装
            opt("SKIRT", "半身裙", "JUPE"),
            opt("SHORTS", "短裤", "SHORT"),
            opt("TROUSERS", "长裤"),
            opt("PANTS", "裤子"),
            opt("JEANS", "牛仔裤"),
            opt("CASUAL_PANTS", "休闲裤"),
            opt("SWEATPANTS", "运动裤"),
            opt("BASE_PANTS", "打底裤", "LEGGINGS"),
            // 连衣裙 / 连体
            opt("DRESS", "连衣裙", "ONEPIECE"),
            opt("JUMP_SUIT", "连体裤", "OVERALLS"),
            // 中式
            opt("QIPAO", "旗袍", "CHEONGSAM"),
            // 功能 / 场景
            opt("YOGA_WEAR", "瑜伽服"),
            opt("SUN_PROTECTION", "防晒服"),
            opt("LOUNGEWEAR", "家居服"),
            opt("SWIMWEAR", "泳装", "SWIMSUIT"),
            opt("WORKWEAR", "工作服", "UNIFORM"),
            opt("ACCESSORIES", "配饰"),
            opt("UNDECLARED", "未分类")
    );

    /** 规范代码（大写）→ 中文名 */
    private static final Map<String, String> NAME_BY_CODE = new HashMap<>();
    /** 任意别名（大写）→ 规范代码（大写） */
    private static final Map<String, String> CODE_BY_ALIAS = new HashMap<>();
    /** 任意别名（大写）→ 中文名 */
    private static final Map<String, String> NAME_BY_ALIAS = new HashMap<>();
    /** 规范代码（大写）→ 全部别名（用于 SQL IN，保留原样大小写） */
    private static final Map<String, List<String>> ALIASES_BY_CODE = new HashMap<>();

    static {
        for (Option o : OPTIONS) {
            String code = upper(o.code());
            NAME_BY_CODE.put(code, o.name());
            List<String> aliases = new ArrayList<>(o.aliases());
            aliases.add(o.code());
            aliases.add(o.name());
            List<String> distinct = new ArrayList<>(new LinkedHashSet<>(aliases));
            ALIASES_BY_CODE.put(code, distinct);
            for (String a : distinct) {
                String key = upper(a);
                CODE_BY_ALIAS.putIfAbsent(key, code);
                NAME_BY_ALIAS.putIfAbsent(key, o.name());
            }
        }
    }

    private static Option opt(String code, String name, String... extraAliases) {
        List<String> aliases = new ArrayList<>();
        for (String a : extraAliases) {
            aliases.add(a);
        }
        return new Option(code, name, aliases);
    }

    /** 全部类目项（供商家上架时下拉选择） */
    public List<Option> options() {
        return OPTIONS;
    }

    /**
     * 展示名：任何写法都转成中文。
     *
     * <p>词表里没有的值**原样返回**而不是丢掉或塞进「其它」——
     * 商家自定义的类目（如「工装裤」）应该照常显示，不能因为不在词表里就消失。
     */
    public String displayName(Object raw) {
        String s = str(raw);
        if (!StringUtils.hasText(s)) {
            return null;
        }
        String hit = NAME_BY_ALIAS.get(upper(s));
        return hit != null ? hit : s;
    }

    /** 规范代码：把中文/别名归到同一个代码上，便于筛选与统计合并 */
    public String canonicalCode(Object raw) {
        String s = str(raw);
        if (!StringUtils.hasText(s)) {
            return null;
        }
        String hit = CODE_BY_ALIAS.get(upper(s));
        return hit != null ? hit : s;
    }

    /**
     * 某个规范代码对应的全部别名（用于 SQL {@code IN}）。
     *
     * <p>这是「不批量改库也能正确筛选」的关键：筛「半身裙」时同时匹配
     * {@code SKIRT} / {@code JUPE} / {@code 半身裙}，老数据一个都不漏。
     */
    public List<String> aliasesOf(Object codeOrAlias) {
        String code = canonicalCode(codeOrAlias);
        if (code == null) {
            return List.of();
        }
        List<String> aliases = ALIASES_BY_CODE.get(upper(code));
        return aliases != null ? aliases : List.of(code);
    }

    /**
     * 把「原始类目 → 数量」聚合成「规范类目 → 数量」。
     *
     * <p>中文名不同的写法会合并到一行（如 {@code SKIRT} 与 {@code 半身裙} 都算半身裙），
     * 这样平台首页不会出现两个看起来一样的类目。
     *
     * @return 每项 {@code {category: 规范代码, name: 中文名, cnt: 数量}}，按数量倒序
     */
    public List<Map<String, Object>> groupCategories(List<Map<String, Object>> rawRows) {
        Map<String, Long> cntByCode = new LinkedHashMap<>();
        Map<String, String> nameByCode = new LinkedHashMap<>();
        if (rawRows != null) {
            for (Map<String, Object> row : rawRows) {
                Object raw = row.get("category");
                String code = canonicalCode(raw);
                if (code == null) {
                    continue;
                }
                long cnt = toLong(row.get("cnt"));
                cntByCode.merge(code, cnt, Long::sum);
                nameByCode.putIfAbsent(code, displayName(raw));
            }
        }

        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, Long> e : cntByCode.entrySet()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("category", e.getKey());
            row.put("name", nameByCode.get(e.getKey()));
            row.put("cnt", e.getValue());
            out.add(row);
        }
        out.sort((a, b) -> Long.compare(toLong(b.get("cnt")), toLong(a.get("cnt"))));
        return out;
    }

    /** 词表全量 + 在架数量（平台首页/上架页共用；数量为 0 的也返回，供下拉选择） */
    public List<Map<String, Object>> optionsWithCount(List<Map<String, Object>> rawRows) {
        Map<String, Long> cntByCode = new HashMap<>();
        if (rawRows != null) {
            for (Map<String, Object> row : rawRows) {
                String code = canonicalCode(row.get("category"));
                if (code != null) {
                    cntByCode.merge(code, toLong(row.get("cnt")), Long::sum);
                }
            }
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Option o : OPTIONS) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("category", o.code());
            row.put("name", o.name());
            row.put("cnt", cntByCode.getOrDefault(upper(o.code()), 0L));
            out.add(row);
        }
        return out;
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v).trim();
    }

    private static String upper(String s) {
        return s == null ? "" : s.trim().toUpperCase(Locale.ROOT);
    }

    private static long toLong(Object v) {
        if (v == null) {
            return 0L;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }
}
