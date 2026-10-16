package com.fashion.supplychain.shop.helper;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * D-806：详情内容块（图 + 文交错）的回归测试。
 *
 * <p>守护的是两类静默失效：
 * ① 丢弃规则漏了 → 顾客端出现空图框或空白文字块，看起来像页面坏了；
 * ② 超过 20 块没截断 → 平台拒收，而系统这边毫无提示。
 */
class ShopDetailBlockHelperTest {

    private static Map<String, String> img(String url) {
        return Map.of("type", "image", "url", url);
    }

    private static Map<String, String> txt(String content) {
        return Map.of("type", "text", "content", content);
    }

    @Test
    @DisplayName("图与文按原顺序交错保留（这正是详情页的形态）")
    void keepsInterleavedOrder() {
        String json = ShopDetailBlockHelper.toJson(Arrays.asList(
                img("a.jpg"), txt("卖点：透气"), img("b.jpg"), txt("细节：走线"), img("c.jpg")));

        List<Map<String, String>> parsed = ShopDetailBlockHelper.parse(json);

        assertEquals(5, parsed.size());
        assertEquals("image", parsed.get(0).get("type"));
        assertEquals("text", parsed.get(1).get("type"));
        assertEquals("卖点：透气", parsed.get(1).get("content"));
        assertEquals("b.jpg", parsed.get(2).get("url"), "顺序不能乱 —— 顺序就是详情页本身");
    }

    @Test
    @DisplayName("脏块被丢弃：空 URL / 空文字 / 未知类型")
    void dropsIncompleteBlocks() {
        List<Map<String, String>> out = ShopDetailBlockHelper.normalize(Arrays.asList(
                img("  "), txt(""), Map.of("type", "video", "url", "v.mp4"), img("ok.jpg")));

        assertEquals(1, out.size(), "空图框/空白文字块会让顾客以为页面坏了，宁可少一块");
        assertEquals("ok.jpg", out.get(0).get("url"));
    }

    @Test
    @DisplayName("超过 20 块截断（平台限制的是描述模块数，不是图片数）")
    void capsAtTwentyBlocks() {
        List<Map<String, String>> many = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            many.add(i % 2 == 0 ? img("i" + i + ".jpg") : txt("第" + i + "段"));
        }

        assertEquals(20, ShopDetailBlockHelper.normalize(many).size());
    }

    @Test
    @DisplayName("单段文字超长截断到 2000 字")
    void capsTextLength() {
        String longText = "x".repeat(5000);

        List<Map<String, String>> out = ShopDetailBlockHelper.normalize(List.of(txt(longText)));

        assertEquals(2000, out.get(0).get("content").length());
    }

    @Test
    @DisplayName("解析失败返回空列表（调用方据此回退 gallery，不给顾客空白页）")
    void brokenJsonFallsBackToEmpty() {
        assertTrue(ShopDetailBlockHelper.parse("{not-json").isEmpty());
        assertTrue(ShopDetailBlockHelper.parse(null).isEmpty());
    }

    @Test
    @DisplayName("forCustomer：没有内容块就返回空（绝不回落 gallery）")
    void forCustomerDoesNotFallBackToGallery() {
        // D-808：gallery 归顶部轮播。纵向流若再回落 gallery，
        // 同一批图会在轮播和详情流里各出现一次，顾客看到重复。
        assertTrue(ShopDetailBlockHelper.forCustomer(null).isEmpty());
        assertTrue(ShopDetailBlockHelper.forCustomer("[]").isEmpty());
    }

    @Test
    @DisplayName("forCustomer：有内容块时原样下发，图与文顺序不变")
    void forCustomerKeepsBlocksOrder() {
        List<Map<String, String>> blocks = ShopDetailBlockHelper.forCustomer(
                ShopDetailBlockHelper.toJson(Arrays.asList(img("a.jpg"), txt("卖点"), img("b.jpg"))));

        assertEquals(3, blocks.size());
        assertEquals("image", blocks.get(0).get("type"));
        assertEquals("text", blocks.get(1).get("type"));
        assertEquals("image", blocks.get(2).get("type"));
    }

    @Test
    @DisplayName("空数组保存成 null 之外的可读形态，不产生垃圾值")
    void emptyNormalizesToEmptyList() {
        assertTrue(ShopDetailBlockHelper.normalize(null).isEmpty());
        assertTrue(ShopDetailBlockHelper.normalize(List.of()).isEmpty());
    }
}