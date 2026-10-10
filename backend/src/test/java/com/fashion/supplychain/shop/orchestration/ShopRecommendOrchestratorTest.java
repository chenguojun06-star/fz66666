package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.style.entity.StyleInfo;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 详情页底部推荐（D-784）
 *
 * <p>用户诉求：「详情页 到底部的时候 是不是有一些推荐 根据用户的这些 喜欢的」。
 * 实测顾客端推荐代码 0 处、后端也没有任何推荐逻辑 —— 底部是死胡同。
 *
 * <p><b>最容易悄悄坏掉的是排序</b>：推荐不报错、页面照常显示，
 * 只是顺序悄悄不对了。所以本测试重点锁住<b>排序口径</b>而不是「有没有返回」。
 */
@DisplayName("详情页底部推荐（D-784）")
class ShopRecommendOrchestratorTest {

    private static StyleInfo style(Long id, String styleNo, String category, String season) {
        StyleInfo s = new StyleInfo();
        s.setId(id);
        s.setStyleNo(styleNo);
        s.setCategory(category);
        s.setSeason(season);
        return s;
    }

    @Test
    @DisplayName("① 时间衰减：越久远的浏览权重越低")
    void timeDecayMustReduceWeight() {
        LocalDateTime now = LocalDateTime.now();
        double today = ShopRecommendOrchestrator.decayOf(now, now);
        double week = ShopRecommendOrchestrator.decayOf(now.minusDays(7), now);
        double month = ShopRecommendOrchestrator.decayOf(now.minusDays(30), now);
        double quarter = ShopRecommendOrchestrator.decayOf(now.minusDays(90), now);
        double ancient = ShopRecommendOrchestrator.decayOf(now.minusDays(200), now);

        assertThat(today).isEqualTo(1.0);
        assertThat(week).isLessThan(today);
        assertThat(month).isLessThan(week);
        assertThat(quarter).isLessThan(month);
        // 超出新鲜期直接归零 —— 否则推荐会长期锁死在早已放弃的偏好上
        assertThat(ancient).isEqualTo(0.0);
    }

    @Test
    @DisplayName("② 30 天半衰：正好 30 天应约为一半")
    void halfLifeAt30Days() {
        LocalDateTime now = LocalDateTime.now();
        assertThat(ShopRecommendOrchestrator.decayOf(now.minusDays(30), now))
                .isCloseTo(0.5, org.assertj.core.data.Offset.offset(0.02));
    }

    @Test
    @DisplayName("③ 未来时间不得让权重爆炸（时钟漂移/时区）")
    void futureTimeMustNotExplode() {
        LocalDateTime now = LocalDateTime.now();
        double future = ShopRecommendOrchestrator.decayOf(now.plusDays(3), now);
        assertThat(future).isBetween(0.0, 1.0);
    }

    @Test
    @DisplayName("④ 时间无法解析时按 0 处理，不得当成最新")
    void unparsableTimeMustBeZero() {
        assertThat(ShopRecommendOrchestrator.decayOf(null, LocalDateTime.now())).isEqualTo(0.0);
        assertThat(ShopRecommendOrchestrator.decayOf("不是时间", LocalDateTime.now())).isEqualTo(0.0);
    }

    @Test
    @DisplayName("⑤ 偏好画像：看过的品类权重更高")
    void preferenceMustFavorSeenCategory() {
        ShopRecommendOrchestrator.Preference p = new ShopRecommendOrchestrator.Preference();
        p.add("WOMAN", 2.0);
        assertThat(p.scoreOf(style(1L, "BR26X1W1150A", "WOMAN", "SUMMER"))).isGreaterThan(0);
        assertThat(p.scoreOf(style(2L, "BR26X1W1150A", "MAN", "SUMMER"))).isEqualTo(0.0);
    }

    @Test
    @DisplayName("⑥ 偏好画像：同产品线（款号前缀）也算一种偏好")
    void preferenceMustFavorSameLinePrefix() {
        ShopRecommendOrchestrator.Preference p = new ShopRecommendOrchestrator.Preference();
        p.addPrefix("BR26X1", 1.5);
        // 同前缀应得分，不同前缀不得分
        assertThat(p.scoreOf(style(1L, "BR26X1W1150A", null, null))).isGreaterThan(0);
        assertThat(p.scoreOf(style(2L, "BR26CB0201E", null, null))).isEqualTo(0.0);
    }

    @Test
    @DisplayName("⑦ 空画像不得给任何加权（匿名访客不得被假装有个性化）")
    void emptyPreferenceMustScoreZero() {
        ShopRecommendOrchestrator.Preference p = new ShopRecommendOrchestrator.Preference();
        assertThat(p.isEmpty()).isTrue();
        assertThat(p.scoreOf(style(1L, "BR26X1W1150A", "WOMAN", "SUMMER"))).isEqualTo(0.0);
    }

    @Test
    @DisplayName("⑧ 空值品类/季节不得被算作「同类」")
    void blankCategoryMustNotMatch() {
        ShopRecommendOrchestrator.Preference p = new ShopRecommendOrchestrator.Preference();
        p.add("WOMAN", 1.0);
        // 候选款没有品类 → 不该拿到该品类的偏好分
        assertThat(p.scoreOf(style(1L, "BR26X1W1150A", null, "SUMMER"))).isEqualTo(0.0);
    }

    @Test
    @DisplayName("⑨ 推荐条数上限受控，防一次拉爆接口")
    void limitMustBeCapped() {
        assertThat(ShopRecommendOrchestrator.DEFAULT_LIMIT).isGreaterThan(0);
        assertThat(ShopRecommendOrchestrator.DEFAULT_LIMIT).isLessThanOrEqualTo(20);
    }

    @Test
    @DisplayName("⑩ 浏览记录按顾客+款式合并，不逐条插入")
    void browseLogMustUpsertNotInsert() throws Exception {
        String mapper = java.nio.file.Files.readString(java.nio.file.Path.of(
                "src/main/java/com/fashion/supplychain/shop/mapper/ShopBrowseLogMapper.java"),
                java.nio.charset.StandardCharsets.UTF_8);
        // 并发下「先查再插」会双双查不到然后都去插，唯一键冲突后丢数据
        assertThat(mapper).as("必须用 ON DUPLICATE KEY UPDATE 合并计数")
                .contains("ON DUPLICATE KEY UPDATE");
        assertThat(mapper).as("必须累加浏览次数")
                .contains("view_count = view_count + 1");
        assertThat(mapper).as("浏览历史必须限量查询").contains("LIMIT #{limit}");
    }
}