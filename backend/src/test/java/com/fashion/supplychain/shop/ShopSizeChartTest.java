package com.fashion.supplychain.shop;

import com.fashion.supplychain.shop.orchestration.ShopOrderOrchestrator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;

import java.util.List;
import java.util.Map;


import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-780：尺码表从 SKU 矩阵自动生成。
 *
 * <p><b>为什么要自动生成</b>：实测生产库 112 款里只有 4 款填了 print_size（3.6%），
 * 而那 4 条填的还是「XS」「M」这种单个码 —— 根本不是尺码表，说明这功能从未被真正用过。
 * 服装类目「有没有尺码表」几乎直接决定能不能下单，但让运营手录一张表不现实。
 *
 * <p>SKU 表里本来就躺着完整的「颜色 × 尺码 × 价格 × 库存」矩阵，
 * 直接聚合即可，运营零录入。
 */
@DisplayName("尺码表自动生成（D-780）")
class ShopSizeChartTest {

    @SuppressWarnings("unchecked")
    private static Map<String, Object> callBuild(List<Map<String, Object>> skuSpecs) throws Exception {
        List<com.fashion.supplychain.style.entity.ProductSku> skus = new ArrayList<>();
        int idx = 0;
        for (Map<String, Object> spec : skuSpecs) {
            com.fashion.supplychain.style.entity.ProductSku k =
                    new com.fashion.supplychain.style.entity.ProductSku();
            k.setId((long) (idx++));
            k.setColor((String) spec.get("color"));
            k.setSize((String) spec.get("size"));
            k.setSalesPrice(spec.get("price") == null ? null : new BigDecimal(String.valueOf(spec.get("price"))));
            k.setStockQuantity(spec.get("stock") == null ? null : Integer.valueOf(String.valueOf(spec.get("stock"))));
            k.setSortOrder(spec.get("sort") == null ? null : Integer.valueOf(String.valueOf(spec.get("sort"))));
            skus.add(k);
        }
        Method m = ShopOrderOrchestrator.class
                .getDeclaredMethod("buildSizeChart", List.class);
        m.setAccessible(true);
        return (Map<String, Object>) m.invoke(null, skus);
    }

    private static Map<String, Object> spec(String color, String size, Object price, Object stock, Object sort) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("color", color);
        m.put("size", size);
        m.put("price", price);
        m.put("stock", stock);
        m.put("sort", sort);
        return m;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rows(Map<String, Object> chart) {
        return (List<Map<String, Object>>) chart.get("rows");
    }

    @SuppressWarnings("unchecked")
    private static List<String> colorColumns(Map<String, Object> chart) {
        return (List<String>) chart.get("colors");
    }

    @Test
    @DisplayName("① 无 SKU 时返回 null，不生成半截尺码表")
    void noSkuNoChart() throws Exception {
        assertThat(callBuild(List.of())).isNull();
    }

    @Test
    @DisplayName("② 只有尺码没颜色时也要出表，用「默认」兜底")
    void sizeOnlyStillCharts() throws Exception {
        Map<String, Object> chart = callBuild(List.of(
                spec(null, "M", 100, 5, 1),
                spec(null, "L", 100, 5, 2)));
        assertThat(chart).isNotNull();
        assertThat(colorColumns(chart)).containsExactly("默认");
        assertThat(rows(chart)).hasSize(2);
    }

    @Test
    @DisplayName("③ 尺码顺序必须沿用库里顺序，不能按字母排（字母排会把 XL 排到 XS 前）")
    void sizeOrderFollowsDbNotAlphabet() throws Exception {
        Map<String, Object> chart = callBuild(List.of(
                spec("绿", "XS", 3880, 60, 1),
                spec("绿", "S", 3880, 60, 2),
                spec("绿", "M", 3880, 60, 3),
                spec("绿", "L", 3880, 60, 4),
                spec("绿", "XL", 3880, 60, 5)));
        List<String> order = new ArrayList<>();
        for (Map<String, Object> r : rows(chart)) {
            order.add((String) r.get("size"));
        }
        assertThat(order).containsExactly("XS", "S", "M", "L", "XL");
    }

    @Test
    @DisplayName("④ 库存为 0 必须标售罄，不能让顾客以为有货")
    void zeroStockMarkedSoldOut() throws Exception {
        Map<String, Object> chart = callBuild(List.of(
                spec("绿", "M", 3880, 60, 1),
                spec("绿", "L", 3880, 0, 2),
                spec("绿", "D(定制码)", 3880, 0, 3)));
        List<Map<String, Object>> rs = rows(chart);
        Map<?, ?> mCell = (Map<?, ?>) rs.get(0).get("绿");
        assertThat(mCell.get("soldOut")).isEqualTo(Boolean.FALSE);
        Map<?, ?> lCell = (Map<?, ?>) rs.get(1).get("绿");
        assertThat(lCell.get("soldOut")).isEqualTo(Boolean.TRUE);
        // 售罄也不能把价格报成 0 —— 应保留原价并标售罄
        assertThat(((BigDecimal) lCell.get("price")).intValue()).isEqualTo(3880);
    }

    @Test
    @DisplayName("⑤ 多颜色时按颜色分列，缺该码的组合返回 null 让前端显示「—」")
    void multiColorMatrix() throws Exception {
        Map<String, Object> chart = callBuild(List.of(
                spec("草绿色", "M", 3880, 10, 1),
                spec("黑色", "M", 3880, 10, 2),
                spec("黑色", "L", 3880, 3, 3)));
        assertThat(colorColumns(chart)).containsExactly("草绿色", "黑色");
        List<Map<String, Object>> rs = rows(chart);
        assertThat(rs).hasSize(2);
        // M 有草绿色，L 只有黑色
        assertThat(rs.get(0).get("草绿色")).isNotNull();
        assertThat(rs.get(1).get("草绿色")).isNull();
        assertThat(rs.get(1).get("黑色")).isNotNull();
    }

    @Test
    @DisplayName("⑥ 必须标记 type=sku-matrix，前端据此与富文本尺码表区分")
    void marksTypeForFrontend() throws Exception {
        Map<String, Object> chart = callBuild(List.of(spec("绿", "M", 100, 5, 1)));
        assertThat(chart.get("type")).isEqualTo("sku-matrix");
    }

    @Test
    @DisplayName("⑦ sort_order 缺失时排在最后，不得打乱既有顺序")
    void missingSortGoesLast() throws Exception {
        Map<String, Object> chart = callBuild(List.of(
                spec("绿", "L", 100, 5, null),
                spec("绿", "M", 100, 5, 1)));
        List<String> order = new ArrayList<>();
        for (Map<String, Object> r : rows(chart)) {
            order.add((String) r.get("size"));
        }
        assertThat(order).containsExactly("M", "L");
    }

    /* ── 以下三项来自线上实测的教训 ── */

    @Test
    @DisplayName("⑧ sort_order 全是 0（线上 BV26Q2W1208B 实况）时，必须从尺码本身推导顺序")
    void zeroSortOrderMustFallBackToSizeDerivation() throws Exception {
        // 实测线上：该款 5 个 SKU 的 sort_order 全是 0，
        // 只按 sort_order 排会得到 L,M,S,XL,XS 这种顺序 —— 尺码表首屏就乱。
        Map<String, Object> chart = callBuild(List.of(
                spec("白色", "L(165/92A)", 1777, 44, 0),
                spec("白色", "M(165/88A)", 1777, 44, 0),
                spec("白色", "S(160/84A)", 1777, 44, 0),
                spec("白色", "XL(170/96A)", 1777, 44, 0),
                spec("白色", "XS(155/80A)", 1777, 44, 0)));
        List<String> order = sizesOf(chart);
        assertThat(order).containsExactly(
                "XS(155/80A)", "S(160/84A)", "M(165/88A)", "L(165/92A)", "XL(170/96A)");
    }

    @Test
    @DisplayName("⑨ 括号数字相同时（如 M/L 都标 165）要再用字母码段兜底")
    void sameBodyNumberFallsBackToLabelRank() throws Exception {
        Map<String, Object> chart = callBuild(List.of(
                spec("白", "L(165/92A)", 100, 5, 0),
                spec("白", "M(165/88A)", 100, 5, 0),
                spec("白", "XS(165/80A)", 100, 5, 0)));
        // 三个码括号里第一个数字都是 165 → 必须靠码段字母再排一次
        assertThat(sizesOf(chart)).containsExactly(
                "XS(165/80A)", "M(165/88A)", "L(165/92A)");
    }

    @Test
    @DisplayName("⑩ sort_order 真的有排过时，必须尊重运营的排序，不覆盖")
    void explicitSortOrderMustWin() throws Exception {
        Map<String, Object> chart = callBuild(List.of(
                spec("绿", "XL", 100, 5, 1),
                spec("绿", "XS", 100, 5, 2),
                spec("绿", "M", 100, 5, 3)));
        assertThat(sizesOf(chart)).containsExactly("XL", "XS", "M");
    }

    @Test
    @DisplayName("⑪ 定制码等认不出的码必须排最后，绝不猜")
    void unknownSizeGoesLast() throws Exception {
        Map<String, Object> chart = callBuild(List.of(
                spec("绿", "D(定制码)", 100, 5, 0),
                spec("绿", "XL", 100, 5, 0),
                spec("绿", "S", 100, 5, 0)));
        assertThat(sizesOf(chart)).containsExactly("S", "XL", "D(定制码)");
    }

    private static List<String> sizesOf(Map<String, Object> chart) {
        List<String> order = new ArrayList<>();
        for (Map<String, Object> r : rows(chart)) {
            order.add((String) r.get("size"));
        }
        return order;
    }
}