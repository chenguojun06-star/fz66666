package com.fashion.supplychain.shop.orchestration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-770：店铺详情页「模块化布局」。
 *
 * <p>用户诉求：详情页要能像主流电商那样，让商家自己配置**上到下**的模块顺序与开关。
 * 本类守护的是这个功能的<b>设计边界</b>，而不是「能不能保存」：
 * <ol>
 *   <li>必须是「模块 + 排序」，而不是自由画布（见下方取舍说明）；</li>
 *   <li>必留模块不可隐藏 —— 没有图片和价格的详情页对顾客毫无意义；</li>
 *   <li>缺失资料的模块整块跳过，不得渲染空块（不伪装成有）；</li>
 *   <li>不预置数据行，未配置的款式用默认顺序，不能给上百款逐个插数据。</li>
 * </ol>
 */
@DisplayName("详情页模块化布局（D-770：上到下可配置）")
class ShopStyleLayoutTest {

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

    private static String service() throws Exception {
        return read("shop/orchestration/ShopStyleLayoutService.java");
    }

    private static String page() throws Exception {
        return read("static/shop/index.html");
    }

    @Test
    @DisplayName("① 必须覆盖主流电商详情页的核心模块")
    void mustCoverStandardModules() throws Exception {
        String s = service();
        for (String m : List.of("gallery", "price", "title", "promise", "color", "size",
                "quantity", "params", "detail", "wash", "purchase")) {
            assertThat(s).as("应定义模块 " + m).contains("\"" + m + "\"");
        }
    }

    @Test
    @DisplayName("② 默认顺序必须符合信息优先级：图→价→名→承诺→颜色→尺码→数量→参数→详情→洗涤")
    void defaultOrderFollowsInfoPriority() throws Exception {
        List<String> def = ShopStyleLayoutService.DEFAULT_MODULES;
        assertThat(def.indexOf("gallery")).as("图片最靠上").isLessThan(def.indexOf("price"));
        assertThat(def.indexOf("price")).as("价格紧随图片").isLessThan(def.indexOf("title"));
        assertThat(def.indexOf("promise")).isLessThan(def.indexOf("color"));
        assertThat(def.indexOf("color")).as("颜色先于尺码").isLessThan(def.indexOf("size"));
        assertThat(def.indexOf("size")).as("尺码先于数量").isLessThan(def.indexOf("quantity"));
        assertThat(def.indexOf("quantity")).as("数量先于参数/详情").isLessThan(def.indexOf("params"));
        assertThat(def.indexOf("params")).isLessThan(def.indexOf("detail"));
        assertThat(def.indexOf("detail")).isLessThan(def.indexOf("wash"));
    }

    @Test
    @DisplayName("③ 图片与价格不可隐藏（没有图和价格的详情页对顾客毫无意义）")
    void galleryAndPriceCannotBeHidden() throws Exception {
        String s = service();
        assertThat(s)
                .as("必须保护必留模块")
                .contains("for (String must : List.of(\"gallery\", \"price\"))");
        assertThat(s)
                .as("隐藏时必须给出可读原因")
                .contains("是顾客了解商品的必需信息，不能隐藏");
        assertThat(ShopStyleLayoutService.canHide("gallery")).as("画廊不可隐藏").isFalse();
        assertThat(ShopStyleLayoutService.canHide("price")).as("价格不可隐藏").isFalse();
        assertThat(ShopStyleLayoutService.canHide("promise")).as("承诺可隐藏").isTrue();
    }

    @Test
    @DisplayName("④ 未知模块必须忽略（前端版本更旧时会带已下线模块）")
    void unknownModulesMustBeIgnored() throws Exception {
        String s = service();
        assertThat(s)
                .as("按白名单过滤")
                .contains("MODULE_DEFS.containsKey(String.valueOf(m.get(\"moduleKey\")))");
    }

    @Test
    @DisplayName("⑤ 未配置布局的款式走默认顺序，不预置数据行")
    void noPreSeededRows() throws Exception {
        String s = service();
        assertThat(s)
                .as("无记录时返回默认")
                .contains("if (rows == null || rows.isEmpty())")
                .contains("return defaultLayout()");
        String sql = read("db/migration/V202612090001__create_shop_style_layout.sql");
        assertThat(sql)
                .as("迁移只建表，不预置任何布局行（否则要替上百个款式插 11 行）")
                .doesNotContain("INSERT INTO `t_shop_style_layout`");
    }

    @Test
    @DisplayName("⑥ 顾客端必须按布局顺序渲染，且只拼接非空模块")
    void customerPageRendersInConfiguredOrder() throws Exception {
        String s = page();
        assertThat(s).as("必须按 layout 排序取模块顺序").contains("function detailModuleOrder");
        assertThat(s)
                .as("按 sortOrder 升序")
                .contains("Number(known[a].sortOrder) || 0) - (Number(known[b].sortOrder) || 0)");
        assertThat(s)
                .as("enabled=0 必须跳过")
                .contains("if (it.enabled === 0 || it.enabled === false) continue");
        assertThat(s)
                .as("只拼接非空模块，避免空白块")
                .contains("if (parts[order[j]]) html += parts[order[j]]");
    }

    @Test
    @DisplayName("⑦ 无 layout 数据时必须回落默认顺序（老款式不能白屏）")
    void mustFallbackToDefaultOrder() throws Exception {
        String s = page();
        assertThat(s)
                .as("layout 为空时用默认顺序全开")
                .contains("out = DETAIL_MODULES.slice()");
        assertThat(s)
                .as("默认顺序与后端保持一致")
                .contains("'gallery', 'price', 'title', 'promise', 'color', 'size'");
    }

    @Test
    @DisplayName("⑧ 多图轮播要用起库里已有的颜色图（此前 135 张从未被用起）")
    void galleryMustUseColorImages() throws Exception {
        String s = page();
        assertThat(s).as("轮播应包含各颜色图").contains("d.colorImages");
        assertThat(s)
                .as("主图 + 各颜色图合并，且去重避免重复")
                .contains("if (ci[k] && ci[k] !== d.cover) imgs.push(ci[k])");
        // D-777 行为变更：原来「无图就整个模块跳过」，但那会让 #bk 返回按钮不存在，
        // 进而打断后面所有事件绑定（线上 64% 的上架款式加购/购买全失效）。
        // 现在无论有无图片都必须渲染返回入口，只是没有 cell。
        assertThat(s)
                .as("无图时仍要给出返回入口，不能让后续事件绑定被打断")
                .contains("carouselHtml([], true)");
        assertThat(s)
                .as("有图时同样带返回入口")
                .contains("carouselHtml(imgs, true)");
    }

    @Test
    @DisplayName("⑨ 迁移必须幂等且唯一键防重复")
    void migrationMustBeIdempotent() throws Exception {
        String sql = read("db/migration/V202612090001__create_shop_style_layout.sql");
        assertThat(sql).contains("CREATE TABLE IF NOT EXISTS `t_shop_style_layout`");
        assertThat(sql)
                .as("唯一键防止同款同模块重复行")
                .contains("UNIQUE KEY `uk_shop_style_module`");
        assertThat(sql)
                .as("排序列")
                .contains("KEY `idx_tenant_style`");
    }
}