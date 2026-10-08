package com.fashion.supplychain.shop;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-769：服务承诺从「空头承诺」改为「商家显式开关」。
 *
 * <p><b>为什么这是必须改的</b>：顾客端详情页把「7 天无理由」「现货速发」
 * <b>写死在 HTML 里</b>，商家既无法配置，系统里也没有任何退货/换货政策数据
 * 支撑这两句话。承诺是有法律后果的 —— 写了就要能兑现，兑现不了就是纠纷与投诉。
 *
 * <p>所以守护的目标是：<b>顾客不得看到商家没做过的承诺</b>。
 */
@DisplayName("服务承诺不得凭空承诺（D-769）")
class ShopServicePromiseTest {

    private static String read(String rel) throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/" + rel,
                "backend/src/main/java/com/fashion/supplychain/" + rel,
                "src/main/resources/" + rel,
                "backend/src/main/resources/" + rel)) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到 " + rel);
    }

    private static String page() throws Exception {
        return read("static/shop/index.html");
    }

    @Test
    @DisplayName("① 顾客端不得再出现写死的「7 天无理由」")
    void noHardcodedReturnPromise() throws Exception {
        String s = page();
        // 唯一允许出现的位置是注释/函数名，实际渲染必须走 promiseTags()
        assertThat(s)
                .as("不得硬编码渲染 7 天无理由")
                .doesNotContain("'</span><span>7 天无理由</span>");
        assertThat(s)
                .as("现货速发也不得硬编码在标签里")
                .doesNotContain("'</span><span class=\"tag\">现货速发</span>'");
    }

    @Test
    @DisplayName("② 承诺必须按商家配置渲染，且无理由必须有天数")
    void promisesRenderedFromConfig() throws Exception {
        String s = page();
        assertThat(s).as("必须有承诺渲染函数").contains("function promiseTags");
        assertThat(s)
                .as("无理由只在 returnDays>0 时输出，且文案必须带真实天数")
                .contains("if (rd > 0) out += '<span>' + rd + ' 天无理由退货</span>'");
        assertThat(s)
                .as("现货速发只在开关为 1 时输出")
                .contains("promiseInStock");
        assertThat(s)
                .as("正品保障只在开关为 1 时输出")
                .contains("promiseAuthentic");
    }

    @Test
    @DisplayName("③ 自定义承诺必须转义，且限量展示（防止商家塞长文本撑破页面）")
    void customPromiseMustBeEscapedAndLimited() throws Exception {
        String s = page();
        assertThat(s)
                .as("自定义承诺必须走 esc 转义")
                .contains("esc(items[i])");
        assertThat(s)
                .as("最多展示 3 条，避免撑破详情页")
                .contains("slice(0, 3)");
    }

    @Test
    @DisplayName("④ 迁移必须默认全关（不凭空承诺），且 returnDays 为 0")
    void migrationDefaultsToNoPromise() throws Exception {
        String sql = read("db/migration/V202612080001__add_shop_service_promise_flags.sql");
        assertThat(sql)
                .as("无理由天数默认 0 = 不承诺")
                .contains("`return_days` INT NOT NULL DEFAULT 0");
        assertThat(sql)
                .as("现货速发默认关闭")
                .contains("`promise_in_stock` TINYINT NOT NULL DEFAULT 0");
        assertThat(sql)
                .as("正品保障默认关闭")
                .contains("`promise_authentic` TINYINT NOT NULL DEFAULT 0");
        assertThat(sql).as("自定义承诺默认空").contains("`promise_extra` VARCHAR(255) NULL");
    }

    @Test
    @DisplayName("⑤ 公开接口必须透出承诺字段（否则前端读 undefined，页面退化为什么都不显示）")
    void publicApiMustExposePromises() throws Exception {
        String s = read("shop/orchestration/ShopOrderOrchestrator.java");
        for (String f : List.of("returnDays", "promiseInStock", "promiseAuthentic", "promiseExtra")) {
            assertThat(s).as("公开接口应透出 " + f).contains("\"" + f + "\"");
        }
    }

    @Test
    @DisplayName("⑥ 实体字段与迁移列必须一一对应（否则启动即 Unknown column）")
    void entityFieldsMatchMigration() throws Exception {
        String entity = read("shop/entity/ShopConfig.java");
        String sql = read("db/migration/V202612080001__add_shop_service_promise_flags.sql");
        assertThat(entity).contains("returnDays");
        assertThat(entity).contains("promiseInStock");
        assertThat(entity).contains("promiseAuthentic");
        assertThat(entity).contains("promiseExtra");
        assertThat(sql).contains("`return_days`").contains("`promise_in_stock`")
            .contains("`promise_authentic`").contains("`promise_extra`");
    }

    @Test
    @DisplayName("⑦ 天数必须校验范围（负数/超大天数是误输入）")
    void returnDaysMustBeValidated() throws Exception {
        String s = read("shop/orchestration/ShopAdminOrchestrator.java");
        assertThat(s).as("必须校验天数范围").contains("days < 0 || days > 90");
        assertThat(s)
                .as("非法数字必须报错而非静默写 0")
                .contains("无理由退货天数必须是数字");
    }
}