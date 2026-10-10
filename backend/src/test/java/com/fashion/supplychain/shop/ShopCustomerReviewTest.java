package com.fashion.supplychain.shop;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-783：顾客评价。
 *
 * <p><b>背景</b>：后端 {@code t_shop_review} 表、实体、编排器、提交与读取接口
 * <b>全都早就存在且设计规范</b>（限已发货订单、限本单商品、一单一款一条不可修改），
 * 但顾客端页面里<b>一个字评价代码都没有</b> —— 功能等于没有。
 *
 * <p>同时发现：页面会读 {@code shop_consumer_token}，却<b>从来没有写入过** ——
 * 没有登录界面，令牌是死代码，所以「需要身份」的功能在顾客端全部用不了。
 */
@DisplayName("顾客端评价与登录（D-783）")
class ShopCustomerReviewTest {

    private static String page() throws Exception {
        for (String p : new String[]{
                "src/main/resources/static/shop/index.html",
                "backend/src/main/resources/static/shop/index.html"}) {
            java.nio.file.Path path = java.nio.file.Path.of(p);
            if (java.nio.file.Files.exists(path)) {
                return java.nio.file.Files.readString(path, java.nio.charset.StandardCharsets.UTF_8);
            }
        }
        throw new AssertionError("找不到 shop/index.html");
    }

    @Test
    @DisplayName("① 详情页必须有评价区块（此前顾客端完全没有评价代码）")
    void detailPageMustHaveReviewSection() throws Exception {
        String s = page();
        assertThat(s).as("必须加载评价").contains("function loadReviews");
        assertThat(s).as("必须有评价容器").contains("reviewBox");
        assertThat(s).as("必须有评价区块").contains("商品评价");
        assertThat(s).as("reviews 模块要进模块表").contains("'reviews'");
    }

    @Test
    @DisplayName("② 必须调通后端已存在的评价接口，别自己另造一套")
    void mustUseExistingReviewApis() throws Exception {
        String s = page();
        assertThat(s)
                .as("公开读取：ShopPlatformController#styleReviews")
                .contains("/api/shop/public/platform/styles/");
        assertThat(s)
                .as("提交：ShopConsumerController#submitReview")
                .contains("/me/orders/")
                .contains("/reviews");
        assertThat(s)
                .as("我的订单：用于判断能不能评价")
                .contains("/me/orders");
    }

    @Test
    @DisplayName("③ 能评价与否必须由「已登录 + 已发货 + 该商品在本单内」共同决定")
    void eligibilityMustBeCheckedProperly() throws Exception {
        String s = page();
        assertThat(s).as("未登录要引导登录").contains("登录后可评价");
        assertThat(s).as("没发货要如实说明").contains("订单发货后即可评价");
        assertThat(s).as("不在本单内要说明").contains("该商品不在你的已发货订单中");
        assertThat(s).as("评过要说评过，不给重复入口").contains("你已评价过这款商品");
        assertThat(s).as("真能评价才给按钮").contains("id=\"reviewWrite\"");
    }

    /**
     * 前端校验只是体验，真正的边界必须在服务端 ——
     * 绕过前端直接打接口也必须被拒。
     */
    @Test
    @DisplayName("④ 资格判定不能只靠前端，服务端必须二次校验")
    void serverMustRecheckEligibility() throws Exception {
        String s = page();
        assertThat(s)
                .as("取订单明细确认款式与是否已评价，不能只看订单列表")
                .contains("items[j].styleNo === styleNo")
                .contains("target.reviewed");
    }

    @Test
    @DisplayName("⑤ 匿名评价不得泄露身份")
    void anonymousMustNotLeakIdentity() throws Exception {
        String s = page();
        assertThat(s)
                .as("匿名要显示为匿名顾客")
                .contains("匿名顾客");
        assertThat(s)
                .as("匿名判断用 anonymous 字段")
                .contains("r.anonymous");
    }

    @Test
    @DisplayName("⑥ 令牌必须真的能被写入（此前只读不写，是死代码）")
    void consumerTokenMustBeWritable() throws Exception {
        String s = page();
        assertThat(s).as("必须有会话写入函数").contains("function setConsumerSession");
        assertThat(s).as("必须有登出").contains("function clearConsumerSession");
        // 登录/注册共用一个端点前缀，按 mode 切换
        assertThat(s).as("必须调登录/注册接口").contains("/api/shop/public/auth/");
        assertThat(s).as("mode 区分登录与注册").contains("mode === 'register'");
        assertThat(s).as("必须有登录界面").contains("function openLoginModal");
    }

    @Test
    @DisplayName("⑦ 提交失败要给出可读原因，不能静默")
    void submitFailureMustSurfaceReason() throws Exception {
        String s = page();
        // post 支持可选失败回调，用于把服务端拒绝原因（如「只有已发货的订单可以评价」）透出
        assertThat(s).as("post 必须支持失败回调").contains("function post(url, body, ok, fail)");
        assertThat(s).as("get 也需要失败回调").contains("function get(url, ok, fail)");
        assertThat(s).as("提交失败要提示").contains("评价提交失败");
    }

    @Test
    @DisplayName("⑧ 评价加载失败不应弹 toast 打扰顾客，只显示占位")
    void reviewLoadFailureShouldNotToast() throws Exception {
        String s = page();
        assertThat(s).as("取评价失败要降级为占位").contains("评价加载失败");
    }

    /**
     * D-784：详情页底部推荐。
     *
     * <p>用户诉求：「详情页 到底部的时候 是不是有一些推荐 根据用户的这些 喜欢的」。
     * 实测顾客端推荐代码 0 处 —— 底部是死胡同。
     */
    @Test
    @DisplayName("⑨ 详情页必须有底部推荐，且如实说明推荐依据")
    void detailPageMustHaveRecommendations() throws Exception {
        String s = page();
        assertThat(s).as("必须拉取推荐").contains("function loadRecommends");
        assertThat(s).as("必须有推荐区块").contains("recSec");
        assertThat(s).as("recommend 模块要进模块表").contains("'recommend'");
        assertThat(s).as("标题要说明依据").contains("猜你喜欢");
        // 登录与匿名要区分说明，不能给匿名用户谎称「根据你的偏好」
        assertThat(s).as("登录态说明个性化").contains("根据你的浏览偏好");
        assertThat(s).as("匿名态如实说明是同类").contains("同类商品");
    }

    @Test
    @DisplayName("⑩ 推荐为空时整块隐藏，不给顾客一个空区块")
    void emptyRecommendMustHideSection() throws Exception {
        String s = page();
        assertThat(s).as("没得推要隐藏整块，不给空区块")
                .contains("getElementById('recSec')")
                .contains("style.display = 'none'");
    }

    @Test
    @DisplayName("⑪ 推荐要带价格，缺价不得显示成 0")
    void recommendMustNotFakePrice() throws Exception {
        String s = page();
        assertThat(s)
                .as("缺价要如实说「价格未维护」，不能显示 ¥0")
                .contains("价格未维护");
        assertThat(s).as("缺价时用 null 判定而不是 >0").contains("r.minPrice != null");
    }

    @Test
    @DisplayName("⑫ 浏览行为只在登录时上报，且失败静默")
    void browseReportOnlyWhenLoggedIn() throws Exception {
        String s = page();
        assertThat(s).as("必须有上报函数").contains("function reportView");
        assertThat(s)
                .as("匿名不上报——无稳定身份，会变成无法清理的垃圾数据")
                .contains("if (!isLoggedIn()) return;");
        assertThat(s).as("上报失败不得打扰顾客").contains("function () {}, function () {}");
    }

    /**
     * D-784 回归：并行开发时同一功能被实现了两遍
     * （一套「本店好物」recSec/recGrid，一套「猜你喜欢」recSec/recBox），
     * 两套都进了同一个页面 —— **DOM 里出现两个 id="recSec"**，
     * getElementById 只会命中第一个，第二个区块永远填不上数据，
     * 页面出现两个推荐区且其中一个空白。
     */
    @Test
    @DisplayName("⑬ 推荐区块的 id 必须唯一（曾因两套实现并存出现重复 id）")
    void recommendSectionIdMustBeUnique() throws Exception {
        String s = page();
        int count = s.split("id=\"recSec\"", -1).length - 1;
        assertThat(count).as("id=\"recSec\" 只能出现一次").isEqualTo(1);
        assertThat(s).as("不得残留另一套实现的 recGrid")
                .doesNotContain("recGrid");
        assertThat(s).as("推荐渲染函数只能有一个")
                .contains("function loadRecommends(");
        assertThat(s).as("不得残留旧的单数版本函数")
                .doesNotContain("function loadRecommend(styleId)");
    }
}
