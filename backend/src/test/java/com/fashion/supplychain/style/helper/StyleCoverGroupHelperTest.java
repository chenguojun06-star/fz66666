package com.fashion.supplychain.style.helper;

import com.fashion.supplychain.style.entity.StyleInfo;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * D-801：主图组解析出口的回归测试。
 *
 * <p>这些用例守护的是两类「静默失效」：
 * ① 解析失败若不回退，历史款式（cover_group 为 NULL）在顾客端会白图；
 * ② 若不过滤 5 张上限，会出现平台只认 5 张、第 6 张以后静默丢失的错位。
 */
class StyleCoverGroupHelperTest {

    @Test
    @DisplayName("正常解析：最多 5 张，第 1 张即主图")
    void parseKeepsOrderAndCapsAtFive() {
        String json = "[\"https://cdn/1.jpg\",\"https://cdn/2.jpg\",\"https://cdn/3.jpg\","
                + "\"https://cdn/4.jpg\",\"https://cdn/5.jpg\"]";
        List<String> parsed = StyleCoverGroupHelper.parse(json, null);

        assertEquals(5, parsed.size());
        assertEquals("https://cdn/1.jpg", parsed.get(0), "顺序不能变 —— 第 1 张是搜索结果展示图");
        assertEquals("https://cdn/5.jpg", parsed.get(4));
    }

    @Test
    @DisplayName("超过 5 张：截断而不是报错（平台只认 5 张）")
    void parseTruncatesBeyondFive() {
        List<String> seven = new ArrayList<>();
        for (int i = 1; i <= 7; i++) {
            seven.add("https://cdn/" + i + ".jpg");
        }
        String json = StyleCoverGroupHelper.toJson(seven);

        assertEquals(5, StyleCoverGroupHelper.parse(json, null).size());
    }

    @Test
    @DisplayName("历史数据 cover_group 为空：回退读 cover，行为与新增字段前一致")
    void parseFallsBackToCoverWhenGroupEmpty() {
        assertEquals(List.of("https://cdn/legacy.jpg"),
                StyleCoverGroupHelper.parse(null, "https://cdn/legacy.jpg"));
        assertEquals(List.of("https://cdn/legacy.jpg"),
                StyleCoverGroupHelper.parse("   ", "https://cdn/legacy.jpg"));
        assertEquals(List.of("https://cdn/legacy.jpg"),
                StyleCoverGroupHelper.parse("[]", "https://cdn/legacy.jpg"));
    }

    @Test
    @DisplayName("脏 JSON 解析失败：回退读 cover，绝不抛异常把详情页打挂")
    void parseFallsBackWhenJsonBroken() {
        assertEquals(List.of("https://cdn/fallback.jpg"),
                StyleCoverGroupHelper.parse("{not-json", "https://cdn/fallback.jpg"));
        assertEquals(List.of("https://cdn/fallback.jpg"),
                StyleCoverGroupHelper.parse("[\"a\",]", "https://cdn/fallback.jpg"));
    }

    @Test
    @DisplayName("组与回退都没有：返回空列表，交调用方显示「暂无图片」")
    void parseReturnsEmptyWhenNothingAvailable() {
        assertTrue(StyleCoverGroupHelper.parse(null, null).isEmpty());
        assertTrue(StyleCoverGroupHelper.parse("[null,\"\",\"  \"]", null).isEmpty(),
                "空串/空白项不能变成空 URL 塞进轮播");
    }

    @Test
    @DisplayName("脏数据清洗：去首尾空格、剔除空白项，但不去重")
    void sanitizeTrimsButKeepsDuplicates() {
        List<String> cleaned = StyleCoverGroupHelper.sanitize(
                Arrays.asList("  https://cdn/a.jpg  ", "", "   ", "https://cdn/a.jpg"));

        assertEquals(List.of("https://cdn/a.jpg", "https://cdn/a.jpg"), cleaned,
                "重复图不去重 —— 静默去重会让运营以为传了 5 张却只显示 4 张");
    }

    @Test
    @DisplayName("同步不变量：coverGroup[0] 必须回填 cover（列表卡片只读 cover）")
    void syncFirstCoverIntoCoverField() {
        StyleInfo style = new StyleInfo();
        style.setCover("https://cdn/old.jpg");
        style.setCoverGroup("[\"https://cdn/n1.jpg\",\"https://cdn/n2.jpg\"]");

        StyleCoverGroupHelper.syncWithCover(style);

        assertEquals("https://cdn/n1.jpg", style.getCover(), "cover 必须等于主图组第 1 张");
        assertEquals("[\"https://cdn/n1.jpg\",\"https://cdn/n2.jpg\"]", style.getCoverGroup());
    }

    @Test
    @DisplayName("只传 cover：组跟着单图走（兼容只改主图的老调用方）")
    void syncBuildsSingleGroupFromCover() {
        StyleInfo style = new StyleInfo();
        style.setCover("https://cdn/only.jpg");

        StyleCoverGroupHelper.syncWithCover(style);

        assertEquals("[\"https://cdn/only.jpg\"]", style.getCoverGroup());
    }

    @Test
    @DisplayName("两者都没传：不擅自造数据")
    void syncLeavesEmptyStyleUntouched() {
        StyleInfo style = new StyleInfo();

        StyleCoverGroupHelper.syncWithCover(style);

        org.junit.jupiter.api.Assertions.assertNull(style.getCover());
        org.junit.jupiter.api.Assertions.assertNull(style.getCoverGroup());
    }
}
