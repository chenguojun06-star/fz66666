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
    @DisplayName("单段文字超长截断到 5000 字（富文本标签也占字符，比纯文本宽松）")
    void capsTextLength() {
        String longText = "x".repeat(9000);

        List<Map<String, String>> out = ShopDetailBlockHelper.normalize(List.of(txt(longText)));

        assertEquals(5000, out.get(0).get("content").length());
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

    @Test
    @DisplayName("D-809 富文本：script/iframe 连内容一起剥掉")
    void stripsDangerousTagsWithContent() {
        String html = "<p>正常</p><script>alert(1)</script><iframe src=\"//evil\"></iframe><p>也正常</p>";

        String out = ShopDetailBlockHelper.sanitizeRichText(html);

        org.junit.jupiter.api.Assertions.assertFalse(out.contains("script"), out);
        org.junit.jupiter.api.Assertions.assertFalse(out.contains("iframe"), out);
        org.junit.jupiter.api.Assertions.assertFalse(out.contains("alert"), out);
        org.junit.jupiter.api.Assertions.assertTrue(out.contains("正常") && out.contains("也正常"), out);
    }

    @Test
    @DisplayName("D-809 富文本：on* 事件属性与 javascript: 伪协议被清掉")
    void stripsEventAttrsAndJsProtocol() {
        String html = "<p onclick=\"steal()\">点我</p><a href=\"javascript:alert(1)\">链接</a>"
                + "<img src=\"x\" onerror=\"alert(2)\">";

        String out = ShopDetailBlockHelper.sanitizeRichText(html);

        org.junit.jupiter.api.Assertions.assertFalse(out.contains("onclick"), out);
        org.junit.jupiter.api.Assertions.assertFalse(out.contains("onerror"), out);
        org.junit.jupiter.api.Assertions.assertFalse(out.toLowerCase().contains("javascript:"), out);
        org.junit.jupiter.api.Assertions.assertTrue(out.contains("点我"), "标签内容要保留，不能整段吞掉");
    }

    @Test
    @DisplayName("D-809 富文本：白名单内的排版标签必须原样保留（清洗不能把样式洗没了）")
    void keepsWhitelistedFormatting() {
        String html = "<p><strong>加粗</strong><em>斜体</em><u>下划线</u></p><ul><li>一</li></ul><h3>小标题</h3>";

        String out = ShopDetailBlockHelper.sanitizeRichText(html);

        for (String tag : new String[]{"<strong>", "<em>", "<u>", "<ul>", "<li>", "<h3>"}) {
            org.junit.jupiter.api.Assertions.assertTrue(out.contains(tag), tag + " 被误删：" + out);
        }
    }

    @Test
    @DisplayName("D-809 富文本：白名单外的标签转义而非删除，内容不丢")
    void escapesNonWhitelistTag() {
        String out = ShopDetailBlockHelper.sanitizeRichText("<marquee>滚动字</marquee>");

        org.junit.jupiter.api.Assertions.assertTrue(out.contains("&lt;marquee"), "标签名要保留：" + out);
        org.junit.jupiter.api.Assertions.assertTrue(out.contains("滚动字"), "内容不能被吞：" + out);
    }

    @Test
    @DisplayName("D-809：整段都是危险标签时丢弃该块，不给顾客留空白段")
    void dropsBlockThatIsAllDangerous() {
        List<Map<String, String>> out = ShopDetailBlockHelper.normalize(
                List.of(txt("<script>alert(1)</script>"), img("a.jpg")));

        assertEquals(1, out.size(), "只剩图片块");
        assertEquals("image", out.get(0).get("type"));
    }

    @Test
    @DisplayName("D-809：保存链路自动清洗，不必依赖调用方自觉")
    void normalizeSanitizesAutomatically() {
        List<Map<String, String>> out = ShopDetailBlockHelper.normalize(
                List.of(txt("<p onclick=\"x()\">文案</p>")));

        assertEquals(1, out.size());
        org.junit.jupiter.api.Assertions.assertFalse(out.get(0).get("content").contains("onclick"),
                out.get(0).get("content"));
    }
}
