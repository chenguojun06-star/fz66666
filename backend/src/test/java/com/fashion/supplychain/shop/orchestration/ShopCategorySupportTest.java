package com.fashion.supplychain.shop.orchestration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 类目词表单测。
 *
 * <p>守住的是一条线上真实存在的质量问题：平台首页类目一度是
 * {@code WOMAN / 上衣 / SKIRT / 旗袍 / JACKET / DRESS} 中英混排，
 * 因为类目取的是款式资料里的自由文本。这里验证「任意写法都能归到同一个中文类目」。
 */
class ShopCategorySupportTest {

    private final ShopCategorySupport support = new ShopCategorySupport();

    @Test
    @DisplayName("① 英文代码、别名、中文都能转成同一个中文名")
    void displayNameNormalizes() {
        assertEquals("女装", support.displayName("WOMAN"));
        assertEquals("女装", support.displayName("woman"));
        assertEquals("女装", support.displayName("女装"));
        assertEquals("半身裙", support.displayName("SKIRT"));
        assertEquals("半身裙", support.displayName("JUPE"));
        assertEquals("连衣裙", support.displayName("DRESS"));
        assertEquals("夹克", support.displayName("JACKET"));
        assertEquals("旗袍", support.displayName("旗袍"));
        assertEquals("上衣", support.displayName("上衣"));
    }

    @Test
    @DisplayName("② 空值返回 null，词表外的自定义类目原样保留（不吞、不硬塞进「其它」）")
    void unknownValueIsKept() {
        assertNull(support.displayName(null));
        assertNull(support.displayName("   "));
        assertEquals("工装裤", support.displayName("工装裤"));
        assertEquals("MY_CUSTOM", support.displayName("MY_CUSTOM"));
    }

    @Test
    @DisplayName("③ 规范代码：别名与中文都归到同一个代码")
    void canonicalCode() {
        assertEquals("SKIRT", support.canonicalCode("半身裙"));
        assertEquals("SKIRT", support.canonicalCode("JUPE"));
        assertEquals("SKIRT", support.canonicalCode("skirt"));
        assertEquals("WOMAN", support.canonicalCode("女装"));
        assertEquals("WOMAN", support.canonicalCode("WOMEN"));
        // 词表外原样返回，当作它自己的代码
        assertEquals("工装裤", support.canonicalCode("工装裤"));
        assertNull(support.canonicalCode(null));
    }

    @Test
    @DisplayName("④ 别名集合用于 SQL IN：筛「半身裙」必须同时命中 SKIRT / JUPE / 半身裙")
    void aliasesForFiltering() {
        List<String> aliases = support.aliasesOf("半身裙");
        assertTrue(aliases.contains("SKIRT"), "别名里必须有英文代码，否则老数据查不到");
        assertTrue(aliases.contains("JUPE"));
        assertTrue(aliases.contains("半身裙"));
    }

    @Test
    @DisplayName("⑤ 类目聚合：中英两种写法的同一个类目必须合并成一行")
    void groupCategoriesMergesAliases() {
        List<Map<String, Object>> raw = new ArrayList<>();
        raw.add(row("WOMAN", 4));
        raw.add(row("女装", 1));   // 老数据里手填的中文，应并入女装
        raw.add(row("SKIRT", 2));
        raw.add(row("半身裙", 3)); // 同上，应并入半身裙
        raw.add(row("旗袍", 1));

        List<Map<String, Object>> grouped = support.groupCategories(raw);

        Map<String, Object> woman = find(grouped, "WOMAN");
        Map<String, Object> skirt = find(grouped, "SKIRT");
        assertEquals(5L, woman.get("cnt"));
        assertEquals("女装", woman.get("name"));
        assertEquals(5L, skirt.get("cnt"));
        assertEquals("半身裙", skirt.get("name"));
        // 按数量倒序
        assertEquals("WOMAN", grouped.get(0).get("category"));
        assertEquals(3, grouped.size());
    }

    @Test
    @DisplayName("⑥ 词表全量返回（含数量为 0 的），否则新类目永远选不到")
    void optionsWithCountCoversWholeDictionary() {
        List<Map<String, Object>> rows = support.optionsWithCount(List.of(row("WOMAN", 2)));

        assertEquals(support.options().size(), rows.size());
        Map<String, Object> woman = find(rows, "WOMAN");
        assertEquals(2L, woman.get("cnt"));
        Map<String, Object> qipao = find(rows, "QIPAO");
        assertEquals(0L, qipao.get("cnt"));
        assertEquals("旗袍", qipao.get("name"));
    }

    private static Map<String, Object> row(String category, long cnt) {
        Map<String, Object> m = new HashMap<>();
        m.put("category", category);
        m.put("cnt", cnt);
        return m;
    }

    private static Map<String, Object> find(List<Map<String, Object>> rows, String code) {
        return rows.stream()
                .filter(r -> code.equals(r.get("category")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("缺少类目 " + code));
    }
}
