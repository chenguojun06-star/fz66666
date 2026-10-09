package com.fashion.supplychain.shop;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-769：顾客端店铺的三个真实缺陷。
 *
 * <ol>
 *   <li><b>预览破图</b>：全局 {@code X-Frame-Options: DENY} 让后台「顾客端实时预览」
 *       的 iframe 被浏览器直接拒绝渲染，只剩一块破图，运营无法确认顾客看到什么。</li>
 *   <li><b>详情页信息缺失</b>：面料成分 / 尺寸表 / 详情介绍在 {@code t_style_info}
 *       里早已存在，却从未透出给顾客端，详情页只有图 + 颜色尺码 + 价格 ——
 *       与淘宝/1688 差距明显。</li>
 *   <li><b>图片不完整</b>：占位与降级口径必须一致，不能渲染出空白让人误以为加载失败。</li>
 * </ol>
 */
@DisplayName("顾客端店铺（D-769：预览 / 详情 / 图片）")
class ShopPublicExperienceTest {

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

    private static String shopPage() throws Exception {
        return read("static/shop/index.html");
    }

    /* ─────────────── ① 预览破图 ─────────────── */

    /**
     * 线上事故回归（D-770 引入）：详情页整页卡在「加载中…」，控制台无任何报错。
     *
     * <p><b>为何难以发现</b>：把详情页从写死的线性 HTML 改成模块化渲染时，
     * {@code renderDetailModules} 里直接引用了定义在 {@code renderDetail} 内部的
     * {@code DETAIL_RENDERERS} 局部变量 → ReferenceError。
     * 该异常发生在 {@code route()} 调用链里被上层 try/catch 吞掉，
     * 于是页面停在「加载中…」、<b>控制台一个字都不报</b>，
     * 首页却完全正常（首页不走这段），只有进详情页才复现。
     */
    @Test
    @DisplayName("⑪ 模块渲染器必须显式传入，不得在另一个函数里直接引用局部变量")
    void renderersMustBePassedExplicitly() throws Exception {
        String s = shopPage();
        int def = s.indexOf("function renderDetailModules");
        assertThat(def).as("应存在分发函数").isGreaterThan(0);
        String body = s.substring(def, Math.min(def + 900, s.length()));
        assertThat(body)
                .as("分发函数必须接收 renderers 参数")
                .contains("renderDetailModules(d, order, renderers)");
        assertThat(body)
                .as("只能从入参取渲染器，不能引用外部 DETAIL_RENDERERS")
                .contains("renderers[key]");
        assertThat(body)
                .as("入参缺失时降级为空表，而不是抛 ReferenceError")
                .contains("renderers = renderers || {}");
        assertThat(s)
                .as("调用处必须把局部渲染器传进去")
                .contains("renderDetailModules(d, order, DETAIL_RENDERERS)");
    }

    /**
     * 详情页此前**从不请求 /info**（只有首页会拉），导致从链接直接进入或刷新时
     * {@code shopInfo} 为 null —— 页面不报错，但会**按错误数据渲染**
     * （如一律显示「包邮」）。这类「不崩但数据错」最难发现。
     */
    @Test
    @DisplayName("⑫ 详情页渲染前必须确保店铺配置已加载（避免按错误配送数据渲染）")
    void detailMustEnsureShopInfo() throws Exception {
        String s = shopPage();
        assertThat(s).as("必须提供 ensureShopInfo").contains("function ensureShopInfo");
        assertThat(s)
                .as("取不到配置也不能挡住浏览，要降级继续渲染")
                .contains("取不到配置也不能挡住浏览");
        assertThat(s).as("并发去重：多个模块调用只发一次请求").contains("shopInfoLoading");
        int m = s.indexOf("function renderDetail(");
        assertThat(m).as("应存在 renderDetail").isGreaterThan(0);
        String body = s.substring(m, Math.min(m + 900, s.length()));
        assertThat(body)
                .as("详情页必须先确保 info 再取商品数据")
                .contains("ensureShopInfo(function ()");
    }

    @Test
    @DisplayName("① 不得全局 DENY 嵌套——否则后台顾客端预览必然破图")
    void mustNotDenyFramingGlobally() throws Exception {
        String s = read("config/SecurityConfig.java");
        assertThat(s)
                .as("frameOptions 必须放行 SAMEORIGIN：仍防第三方点击劫持，但允许本系统后台预览")
                .contains("frameOptions(frame -> frame.sameOrigin())");
        assertThat(s)
                .as("不得再全局 DENY")
                .doesNotContain("frameOptions(frame -> frame.deny())");
    }

    @Test
    @DisplayName("② 放行嵌套的理由必须留档（否则后人会以为 DENY 更安全而改回去）")
    void framingExceptionMustBeDocumented() throws Exception {
        String s = read("config/SecurityConfig.java");
        assertThat(s)
                .as("必须说明为何放行")
                .contains("实时预览")
                .contains("点击劫持");
    }

    /* ─────────────── ③ 详情页信息模块 ─────────────── */

    @Test
    @DisplayName("③ 详情页必须有面料信息、尺寸表、款式详情三个模块")
    void detailPageMustHaveStandardSections() throws Exception {
        String s = shopPage();
        // D-770 起改为模块化布局，模块标题随之调整：
        // 「面料信息」→「商品参数」（与主流电商的参数表叫法一致）
        assertThat(s).as("商品参数模块").contains("商品参数");
        assertThat(s).as("面料成分展示").contains("fabricComposition");
        assertThat(s).as("上市季节展示").contains("上市季节");
        assertThat(s).as("尺寸表模块").contains("尺寸表");
        assertThat(s).as("尺寸表数据源").contains("sizeChart");
        assertThat(s).as("款式详情模块").contains("款式详情");
        assertThat(s).as("详情介绍数据源").contains("description");
        assertThat(s).as("洗涤说明模块").contains("洗涤说明");
    }

    @Test
    @DisplayName("④ 缺失资料必须显示「暂无」，不得留空或编造内容")
    void missingDetailMustSayNoneInsteadOfBlank() throws Exception {
        String s = shopPage();
        /**
         * D-770 行为变更（有意为之）：缺失资料现在**整块不显示**，而不是显示
         * 「暂无尺码表」。理由：淘宝/1688 等主流电商都不会给顾客看
         * 「暂无尺码表」这种占位说明 —— 顾客只关心有内容的部分。
         *
         * 这与 CLAUDE.md 铁律 9 并不冲突：铁律禁的是「把缺失写成 0 /
         * 假装有」，而这里是「不渲染空块」，同样没有编造任何内容。
         * 缺失信息由管理端的「刊登体检」列提示，而不是甩给顾客。
         *
         * 真正的守护点是：**不得渲染出空白块** —— 商家开了模块却没资料时，
         * 必须整块跳过，而不是留一个只有标题的空section。
         */
        assertThat(s)
                .as("无数据的模块必须返回空串（整块跳过），不得渲染空块")
                .contains("return '';");
        assertThat(s)
                .as("参数模块无任何资料时跳过")
                .contains("if (!rows.length) return ''");
        assertThat(s)
                .as("洗涤说明无数据时跳过")
                .contains("if (!d.washInstructions) return ''");
        assertThat(s)
                .as("分发器只拼接非空模块")
                .contains("if (parts[order[j]]) html += parts[order[j]]");
        // 面料成分仅在有值时才进表
        assertThat(s).as("面料成分仅在有值时才渲染").contains("if (d.fabricComposition)");
    }

    @Test
    @DisplayName("⑤ 后端必须透出已在库中的详情资料")
    void backendMustExposeStyleDetails() throws Exception {
        String s = read("shop/orchestration/ShopOrderOrchestrator.java");
        for (String f : List.of("description", "fabricComposition", "sizeChart", "season")) {
            assertThat(s).as("应透出 " + f).contains("\"" + f + "\"");
        }
        assertThat(s)
                .as("空值必须 putIfPresent 跳过，让前端判定「暂无」")
                .contains("putIfPresent");
        assertThat(s)
                .as("putIfPresent 必须过滤空白字符串，否则会渲染出空白块")
                .contains("isBlank()");
    }

    /* ─────────────── ⑥ 图片降级 ─────────────── */

    /**
     * 详情介绍在后台是<b>富文本</b>存的，主体就是图片（实测
     * {@code <img src="/api/file/tenant-download/..." style="max-width:100%">}）。
     * 直接 esc() 转义会让顾客看到一串 {@code <img src=...>} 字面量。
     * 但放行 HTML 又必须防 XSS —— 顾客端是免登录公开页面。
     */
    @Test
    @DisplayName("⑧ 详情介绍必须按富文本渲染图片，但必须剥离脚本与事件属性")
    void richTextMustRenderImagesAndStripScripts() throws Exception {
        String s = shopPage();
        assertThat(s).as("必须提供富文本渲染函数").contains("function richHtml");
        assertThat(s)
                .as("详情介绍要用 richHtml 而非 esc")
                .contains("richHtml(d.description)");
        // 安全：必须剥离脚本类标签
        assertThat(s)
                .as("必须剥离 script/iframe 等危险标签")
                .contains("script|iframe|object|embed|link|meta|form|style");
        assertThat(s)
                .as("必须剥离 on* 事件属性")
                .contains("on[a-z]+\\s*=");
        assertThat(s)
                .as("必须拦截 javascript: 协议")
                .contains("javascript:");
    }

    @Test
    @DisplayName("⑨ 富文本图片必须自适应，不能横向撑破详情页")
    void richImagesMustFitContainer() throws Exception {
        String s = shopPage();
        assertThat(s)
                .as("图片需限宽自适应")
                .contains(".d-desc.rich img{max-width:100%");
    }

    @Test
    @DisplayName("⑥ 图片必须有兜底占位，且同时覆盖加载失败与加载到空图")
    void imageMustHaveFallback() throws Exception {
        String s = shopPage();
        assertThat(s).as("必须有 onerror 兜底").contains("onerror=");
        assertThat(s)
                .as("要覆盖「加载到 1x1 空图」——某些生图失败会返回占位文件而非 404")
                .contains("naturalWidth<=1");
    }

    @Test
    @DisplayName("⑦ 详情页不得出现无图占位而没有说明（顾客无法判断是没图还是坏了）")
    void placeholderMustBeDistinguishable() throws Exception {
        String s = shopPage();
        // 占位使用统一文案，不是一个空 div
        assertThat(s).as("无图占位应有可读文案").contains("暂无图片");
    }
}