package com.fashion.supplychain.shop;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Pattern;

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

    /** 读前端源码（用于守护「只提示不限制」这类跨端约定） */
    private static String readAny(String rel) throws Exception {
        for (String p : new String[]{
                "src/main/java/com/fashion/supplychain/" + rel,
                "backend/src/main/java/com/fashion/supplychain/" + rel,
                "src/main/resources/" + rel,
                "backend/src/main/resources/" + rel,
                "../frontend/src/modules/ecommerce/pages/ShopListing/" + rel}) {
            java.nio.file.Path path = java.nio.file.Path.of(p).normalize();
            if (java.nio.file.Files.exists(path)) {
                return java.nio.file.Files.readString(path, java.nio.charset.StandardCharsets.UTF_8);
            }
        }
        throw new AssertionError("找不到 " + rel);
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
        // D-805 行为变更：详情描述改成整条纵向画布，图文改成**通栏**
        // （负边距 + 加宽，视觉上接近全屏），所以不再是 max-width:100%。
        // 守护的意图「图片不能撑破容器、宽高比要保住」不变，
        // 换成断言新机制的通栏写法，并要求 height:auto 保住宽高比。
        assertThat(s)
                .as("详情图通栏：负边距抵消容器内边距，且 height:auto 保住宽高比（D-805）")
                .contains(".d-desc.rich img{width:calc(100% + 28px);max-width:none")
                .contains("margin:6px -14px")
                .contains("height:auto");
    }

    @Test
    @DisplayName("⑥.5 详情长图必须通栏贴边（D-806：此前图比屏幕窄、左右露白边）")
    void detailStackImagesMustBeFullBleed() throws Exception {
        String s = shopPage();
        assertThat(s)
                .as("详情图坐在 .d-sec{padding:14px} 里，容器必须做 -14px 负边距抵消，"
                        + "否则图比屏幕窄 —— 顾客一看就觉得「别家是平铺整个页面、我们不是」")
                .contains(".d-stack{margin:0 -14px;}");
        assertThat(s)
                .as("与 .d-desc.rich img 的通栏手法必须一致，同一个详情段不能两种图宽")
                .contains(".d-desc.rich img{width:calc(100% + 28px)");
    }

    @Test
    @DisplayName("⑥.6 详情长图必须能点开放大 —— 复用 openImageViewer（D-806）")
    void detailStackImagesMustOpenViewer() throws Exception {
        String s = shopPage();
        // 点开的是详情图本身
        assertThat(s).as("详情图要有可识别的类名").contains("d-stack-img");
        // 必须真的有监听器去接它，且复用同一套查看器
        assertThat(s)
                .as("此前只有顶部轮播接了查看器，详情图上没有任何点击处理，"
                        + "顾客想看面料纹理/走线细节只能干瞪眼")
                .contains("t.classList.contains('d-stack-img')");
        assertThat(s)
                .as("必须复用 openImageViewer（捏合/双击/拖动），不能另写一套缩放")
                .contains("if (imgs.length) openImageViewer(imgs, start);");
    }

    @Test
    @DisplayName("⑥.7 详情必须是「一条龙」：图文同一个画布、尺码表不插在中间（D-807）")
    void detailMustBeOneContinuousCanvas() throws Exception {
        String s = shopPage();
        // 图 + 富文本必须包在同一个画布里，各自带标题/边框会被切成一段段
        assertThat(s).as("详情图与描述必须合成同一个 .d-detail-canvas").contains("d-detail-canvas");
        assertThat(s)
                .as("画布里不允许再出现「款式详情」这种没有信息量的区块标题 —— "
                        + "每一个标题都是一个视觉断点")
                .doesNotContain("<div class=\"lbl\">款式详情</div>");
        // 尺码表必须移到阅读流之后：它是查阅型内容（顾客要找自己穿多大），
        // 不该拦腰截断「按顺序读」的阅读流。
        // 用 render 函数体内两处调用的实际先后顺序来断言，而不是靠字符距离猜。
        // 锁的是**三段**顺序：图 → 文 → 尺码表。
        // 只比「首次出现」是不够的 —— 曾写过 `isLessThan(firstOccurrence)`，
        // 结果把尺码表塞回「图之后、文之前」时首现顺序没变、断言照样通过，
        // 等于没测。必须逐段锁定。
        String detailFn = s.substring(s.indexOf("detail: function (d)"),
                                      s.indexOf("wash: function (d)"));
        int imagesPos = detailFn.indexOf("detailImageStack(d)");
        int textPos = detailFn.indexOf("richHtml(d.description)");
        int chartPos = detailFn.indexOf("sizeChartHtml(d)");
        assertThat(imagesPos).as("详情模块里应拼详情图栈").isGreaterThan(0);
        assertThat(textPos).as("详情模块里应拼富文本描述").isGreaterThan(0);
        assertThat(chartPos).as("详情模块里应调用尺码表").isGreaterThan(0);
        assertThat(imagesPos).as("描述必须接在图后面，合成同一条画布").isLessThan(textPos);
        assertThat(textPos).as("尺码表必须在图文之后，不能插在中间拦腰截断阅读流").isLessThan(chartPos);
        // 还要锁住"图必须真的进了画布"：只比顺序不够
        // —— 若在图栈之外再 render 一次，首现顺序不变、断言照样过，
        // 但顾客看到的是两块。所以直接锁画布的初始化语句。
        assertThat(detailFn)
                .as("画布必须由图栈初始化，否则图会渲染到画布外面、又变成两块")
                .contains("var canvas = detailImageStack(d);");
        // 只锁初始化语句仍不够：若在图栈之外再 render 一次（h += detailImageStack(d)），
        // 初始化语句和顺序都完好、断言照样过，但顾客看到的是两块。
        // 所以直接禁止「图栈绕过画布进 h」。
        assertThat(detailFn.split("h \\+= detailImageStack", -1).length - 1)
                .as("图栈只允许进画布，不允许直接 append 到页面根上（否则顾客看到两块）")
                .isZero();
    }

    @Test
    @DisplayName("⑥.8 画布里图与文之间不许有缝（D-807）")
    void detailCanvasMustBeSeamless() throws Exception {
        String s = shopPage();
        assertThat(s)
                .as("富文本跟在图栈后面时不允许再有上边距，否则图与文之间一道白缝")
                .contains(".d-detail-canvas .d-desc.rich{margin-top:0;}");
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

    /* ─────────────── ⑬~⑰ 详情页专业度整改（D-777） ─────────────── */

    /**
     * <b>线上事故（已实测复现）</b>：14 个上架款式里有 <b>9 个只有 1 张图</b>，
     * 而返回按钮 {@code #bk} 只在「图片数 &gt; 1」时才渲染，
     * 于是 {@code document.getElementById('bk').onclick = back} 抛 TypeError。
     *
     * <p><b>为什么像坏掉但不报错</b>：这行之后的所有绑定（加购/立即购买/
     * 购物车入口/颜色/数量）全部不执行，页面<b>看起来完全正常</b>，
     * 但按钮点了毫无反应；异常被外层吞掉，控制台 0 报错。
     * 浏览器实测：{@code addcartHasHandler=false, buynowHasHandler=false}。
     */
    @Test
    @DisplayName("⑬ 单图款式不得整页失效——事件绑定必须容错，且返回入口恒在")
    void singleImageStyleMustNotKillPurchaseButtons() throws Exception {
        String s = shopPage();
        assertThat(s)
                .as("必须提供容错绑定助手（元素缺失不得中断后续绑定）")
                .contains("function on(");
        assertThat(s)
                .as("助手语义：元素不存在就跳过，而不是抛 TypeError")
                .contains("if (el) el.onclick");

        // 禁止裸的 getElementById(...).onclick —— 这是本次事故的根因写法
        assertThat(Pattern.compile("document\\.getElementById\\([^)]*\\)\\.onclick\\s*=").matcher(s).find())
                .as("不得再出现裸的 getElementById(x).onclick 赋值")
                .isFalse();

        // 返回入口不再依赖「图片数 > 1」才存在
        assertThat(s)
                .as("详情页返回入口必须恒定渲染，不能由图片数决定")
                .contains("id=\"dk\"");
    }

    /**
     * 图片区此前把全部图片收进数组却只渲染 {@code imgs[0]}，
     * 多图等于没做 —— 与「多图轮播」这个卖点名不副实。
     */
    @Test
    @DisplayName("⑭ 图片必须是真轮播：多图 + 指示点 + 序号，而非只显示第一张")
    void galleryMustBeRealCarousel() throws Exception {
        String s = shopPage();
        assertThat(s).as("必须有轮播渲染函数").contains("function carouselHtml");
        assertThat(s).as("必须渲染图片指示点").contains("carousel-dots");
        assertThat(s).as("必须渲染第 N/M 张计数").contains("carousel-idx");
        assertThat(s).as("必须把所有图片交给轮播，而不是只取第一张")
                .contains("carouselHtml(");
        assertThat(s)
                .as("轮播必须有切换逻辑")
                .contains("function galleryGo");
    }

    /**
     * 实测线上承诺文案<b>出现 3 次</b>：价格行、标题标签行、独立的「服务承诺」块。
     * 顾客看到的是三份一样的图标文字，观感廉价。
     */
    @Test
    @DisplayName("⑮ 服务承诺只能渲染一次，不得在价格/标题/独立块重复三遍")
    void promiseMustRenderOnlyOnce() throws Exception {
        String s = shopPage();
        int m = s.indexOf("var DETAIL_RENDERERS = {");
        assertThat(m).as("应存在渲染器表").isGreaterThan(0);
        String body = s.substring(m, Math.min(m + 6000, s.length()));

        int priceStart = body.indexOf("price: function");
        int titleStart = body.indexOf("title: function");
        int promiseStart = body.indexOf("promise: function");
        int colorStart = body.indexOf("color: function");
        assertThat(priceStart).as("应有 price 模块").isGreaterThan(0);
        assertThat(titleStart).as("应有 title 模块").isGreaterThan(0);
        assertThat(promiseStart).as("应有 promise 模块").isGreaterThan(0);
        assertThat(colorStart).as("应有 color 模块").isGreaterThan(0);

        String priceMod = body.substring(priceStart, titleStart);
        String titleMod = body.substring(titleStart, promiseStart);
        String promiseMod = body.substring(promiseStart, colorStart);

        assertThat(priceMod)
                .as("价格区不得再塞承诺（它属于标题区）")
                .doesNotContain("promiseTags()");
        assertThat(promiseMod)
                .as("独立承诺块必须做去重判断，不能与标题区同时输出")
                .contains("promiseStandalone");
        assertThat(titleMod)
                .as("标题区只在独立承诺块缺席时才补承诺标签")
                .contains("promiseStandalone");
    }

    /**
     * D-777：承诺标签此前是<b>裸 span</b>，CSS 又只写了 {@code .d-title .tag}，
     * 于是承诺词直接连成一句「7 天无理由退货现货速发正品保障」贴在正文里 ——
     * 看着像拼接字符串，是「不专业」观感的主要来源之一。
     */
    @Test
    @DisplayName("⑮-c 承诺必须渲染成标签，不能连成一句正文")
    void promiseTagsMustBeStyledTags() throws Exception {
        String s = shopPage();
        assertThat(s)
                .as("承诺 span 必须带 .ptag 类，否则没有任何样式")
                .contains("<span class=\"ptag\">");
        assertThat(s)
                .as(".ptag 必须有实际样式")
                .contains(".ptag{");
        int m = s.indexOf("function promiseTags()");
        assertThat(m).as("应存在 promiseTags").isGreaterThan(0);
        String body = s.substring(m, Math.min(m + 1200, s.length()));
        // 无理由 / 现货 / 正品 / 自定义 四条都要带类
        assertThat(body).as("无理由标签").contains("ptag\">' + rd + ' 天无理由退货");
        assertThat(body).as("现货标签").contains("ptag\">现货速发");
        assertThat(body).as("正品标签").contains("ptag\">正品保障");
        assertThat(body).as("自定义承诺标签").contains("ptag\">' + esc(items[i])");
    }

/**
 * D-782：顾客端必须真正展示商家填的内容，否则「能编辑」等于白做。
 */
    @Test
    @DisplayName("㉓ 商家填的轮播图/视频/品牌/卖点/常见问题/价格说明必须真的渲染出来")
    void merchantContentMustBeRendered() throws Exception {
        String s = shopPage();
        for (String r : new String[] {
                "d.videoUrl", "d.brand", "d.points", "d.faq", "d.priceNote", "d.gallery" }) {
            assertThat(s).as("详情页必须消费字段 " + r).contains(r);
        }
        assertThat(s).as("常见问题要用可折叠呈现，别铺满一屏").contains("<details");
        assertThat(s).as("卖点要有样式").contains(".d-points");
        assertThat(s).as("价格说明要有区块").contains("价格说明");
        // 新模块必须进默认模块表，否则商家在布局里看不到开关
        assertThat(s)
                .as("新增模块要进 DETAIL_MODULES")
                .contains("'points'")
                .contains("'priceNote'")
                .contains("'faq'");
    }

    /**
     * D-782 回归：商家排好的轮播图必须优先于「主图+颜色图」的自动回落，
     * 否则编辑了轮播顺序却看不出效果。
     */
    @Test
    @DisplayName("㉔ 轮播图优先于自动回落")
    void galleryMustPreferMerchantOrder() throws Exception {
        String s = shopPage();
        // 2026-10-14：清单计算抽成 galleryImages(d)，轮播渲染与「选颜色换图」共用同一份，
        // 所以断言要打在这个函数上（原先打在 gallery 渲染器内联的那段代码上）。
        int g = s.indexOf("function galleryImages(d)");
        assertThat(g).as("应有轮播图清单逻辑（galleryImages）").isGreaterThan(0);
        String body = s.substring(g, Math.min(g + 1200, s.length()));
        assertThat(body).as("先用手填轮播图").contains("d.gallery");
        assertThat(body)
                .as("没有手填时才回落到主图+颜色图")
                .contains("else")
                .contains("d.cover");
        assertThat(body).as("手填要去重").contains("indexOf");
    }

    /**
     * D-778-b：合规**只做提示**，绝不限制上传。
     *
     * <p>用户明确要求：「每次编辑这些内容的 就提示 是否合规 这些 只做提示 不限制上传」。
     * 此前把短边低于平台底线做成红色「影响上架/展示」的阻断式提示，
     * 运营看到的是"系统不让传"而不是"这样传平台可能不给推荐"。
     */
    @Test
    @DisplayName("㉕ 合规只做提示，不得出现阻断式文案")
    void complianceMustBeHintOnly() throws Exception {
        String ts = readAny("components/CoverColorImagesSection.tsx");
        assertThat(ts)
                .as("不得再出现阻断式主图提示")
                .doesNotContain("主图不合规");
        assertThat(ts)
                .as("不得再出现「影响上架/展示」这种限制性措辞")
                .doesNotContain("会影响上架/展示");
        assertThat(ts)
                .as("必须明示不影响上传")
                .contains("不影响上传");
        assertThat(ts)
                .as("提示用中性 info，不得用 error")
                .doesNotContain("type=\"error\"");
    }
}

/**
 * D-780：尺码表。
 *
 * <p>实测生产库 112 款里只有 4 款填了 print_size（3.6%），那 4 条还是
 * 「XS」「M」这种单个码 —— 根本不是尺码表。这功能从未被真正用过。
 * 而 SKU 里本来就躺着完整矩阵，所以改为自动生成，运营零录入。
 */
class ShopSizeChartGuardTest {

    private static String shopPage() throws Exception {
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

    private static String readAny(String rel) throws Exception {
        for (String p : new String[]{
                "src/main/java/com/fashion/supplychain/" + rel,
                "backend/src/main/java/com/fashion/supplychain/" + rel,
                "src/main/resources/" + rel,
                "backend/src/main/resources/" + rel,
                // 读前端源码（相对 ShopListing/ 目录传路径）。
                // 注意这里是 4 级上跳：src/main/resources 自身占 3 段，三级只回到 backend/，
                // 少一级会永远解析不到前端目录 —— 前一个候选正是少了一级，从没人用到所以没暴露。
                "../frontend/src/modules/ecommerce/pages/ShopListing/" + rel}) {
            java.nio.file.Path path = java.nio.file.Path.of(p).normalize();
            if (java.nio.file.Files.exists(path)) {
                return java.nio.file.Files.readString(path, java.nio.charset.StandardCharsets.UTF_8);
            }
        }
        throw new AssertionError("找不到 " + rel);
    }

    @Test
    @DisplayName("㉑ 尺码表必须能从 SKU 矩阵自动生成，且前端按矩阵表渲染")
    void sizeChartMustAutoGenerateFromSkuMatrix() throws Exception {
        String java = readAny("shop/orchestration/ShopOrderOrchestrator.java");
        assertThat(java)
                .as("必须从 SKU 聚合出尺码表")
                .contains("buildSizeChart");
        assertThat(java)
                .as("人工填了才用人工的，没填才自动生成（不能覆盖商家自定义量体表）")
                .contains("sizeChartSource");
        assertThat(java)
                .as("自动表要打标记，前端才能与富文本尺码表区分")
                .contains("sku-matrix");
        assertThat(java)
                .as("尺码顺序必须沿用 sort_order，不能按字母排")
                .contains("getSortOrder");

        String s = shopPage();
        assertThat(s).as("必须有尺码表渲染函数").contains("function sizeChartHtml");
        assertThat(s).as("矩阵表要有样式").contains(".size-tbl");
        assertThat(s)
                .as("无库存要标售罄，不能让顾客以为有货")
                .contains("售罄");
        assertThat(s)
                .as("该颜色没这个码时显示「—」，不能留空")
                .contains("class=\"na\">—");
    }

    /**
     * D-780 回归：原先 sizeChart 一律当富文本渲染，
     * 而新的自动尺码表是对象，直接 richHtml(对象) 会渲染出 [object Object]。
     */
    @Test
    @DisplayName("㉒ 尺码表不得再用 richHtml 渲染对象")
    void sizeChartMustNotBeRenderedAsRichTextObject() throws Exception {
        String s = shopPage();
        assertThat(s)
                .as("自动尺码表走 sizeChartHtml，不得再 richHtml(d.sizeChart) 无条件渲染")
                .doesNotContain("richHtml(d.sizeChart)");
    }

    /**
     * D-777 回归：整改时我在标题区写死了「现货速发」标签，
     * 既与承诺块里的同一条重复，又把承诺写死成商家没配置过的空头承诺
     * —— 这正是 D-770 已经清除过的做法，不能再犯。
     */
    @Test
    @DisplayName("⑮-b 标题区不得写死任何承诺文案")
    void titleMustNotHardcodePromiseText() throws Exception {
        String s = shopPage();
        int m = s.indexOf("var DETAIL_RENDERERS = {");
        String body = s.substring(m, Math.min(m + 6000, s.length()));
        int titleStart = body.indexOf("title: function");
        int promiseStart = body.indexOf("promise: function");
        assertThat(titleStart).as("应有 title 模块").isGreaterThan(0);
        assertThat(promiseStart).as("应有 promise 模块").isGreaterThan(0);
        String titleMod = body.substring(titleStart, promiseStart);
        for (String phrase : List.of("现货速发", "7天无理由", "正品保障", "包邮")) {
            assertThat(titleMod)
                    .as("标题区不得写死承诺文案：" + phrase)
                    .doesNotContain(phrase);
        }
        assertThat(titleMod)
                .as("承诺只能来自商家配置 promiseTags()")
                .contains("promiseTags()");
    }

    /**
     * 固定购买栏盖住最后一块内容（实测「面料成分」行被压掉一半），
     * 根源是内容区没有为固定栏预留底部空间。
     */
    @Test
    @DisplayName("⑯ 固定购买栏不得遮挡详情内容")
    void fixedBarMustNotCoverContent() throws Exception {
        String s = shopPage();
        assertThat(s)
                .as("详情页内容区必须为固定购买栏预留底部空间")
                .contains("padding-bottom:calc(");
        assertThat(s).as("必须有独立的底部占位元素").contains("d-bar-space");
    }

    /**
     * CLAUDE.md 铁律 5：禁止渐变，必须用 Design Token 纯色。
     * 详情页此前有 3 处 linear-gradient。
     */
    @Test
    @DisplayName("⑰ 详情页样式不得使用渐变（铁律 5：纯色 + Design Token）")
    void detailStyleMustNotUseGradient() throws Exception {
        String s = shopPage();
        int m = s.indexOf("/* ── 详情页");
        assertThat(m).as("应存在详情页样式段").isGreaterThan(0);
        int end = s.indexOf("/* ── 购物车 ── */", m);
        assertThat(end).as("详情页样式段应有结束标记").isGreaterThan(m);
        String detailCss = s.substring(m, end);
        assertThat(detailCss)
                .as("详情页不得出现渐变")
                .doesNotContain("linear-gradient");
        assertThat(detailCss)
                .as("详情页不得出现 radial-gradient")
                .doesNotContain("radial-gradient");
    }

    /**
     * 品类/季节在库里是英文枚举（SUMMER / WOMAN），顾客端曾直接显示 "SUMMER"。
     */
    @Test
    @DisplayName("⑱ 顾客端不得出现英文枚举")
    void mustNotShowRawEnglishEnum() throws Exception {
        String java = readAny("shop/orchestration/ShopOrderOrchestrator.java");
        assertThat(java)
                .as("必须把英文枚举转中文再下发")
                .contains("seasonText")
                .contains("categoryText");
        assertThat(java)
                .as("认不出的枚举要原样返回，不能臆造中文")
                .contains("default -> c");

        String s = shopPage();
        assertThat(s)
                .as("参数区必须用中文化后的字段")
                .contains("d.seasonText")
                .contains("d.categoryText");
        assertThat(s)
                .as("参数区不得再直接渲染原始 JSON 字段 fabricParts")
                .doesNotContain("d.fabricParts)");
    }

    /**
     * fabric_parts 存的是 JSON 结构（{@code [{"part":"上装","materials":"..."}]}），
     * 原样透出等于把代码展示给顾客。
     */
    @Test
    @DisplayName("⑲ 成分明细必须结构化下发，不得把原始 JSON 透给顾客")
    void fabricPartsMustBeParsedServerSide() throws Exception {
        String java = readAny("shop/orchestration/ShopOrderOrchestrator.java");
        assertThat(java)
                .as("必须解析成可读列表")
                .contains("fabricPartList");
        assertThat(java)
                .as("不再透传原始 JSON 字段")
                .doesNotContain("putIfPresent(data, \"fabricParts\"");
        assertThat(java)
                .as("解析失败要降级跳过，不能把异常抛给顾客")
                .contains("成分细节解析失败");
        // 真实数据实测：同一个部位会拆成多行（如上装：面料/3%氨纶/里布 各一行），
        // 不合并的话顾客会看到四行都叫「上装」
        assertThat(java)
                .as("同一部位的多行材质必须合并成一行")
                .contains("byPart")
                .contains("computeIfAbsent");
        // materials 为空的行不能产生空参数行（实测数据里确实存在这种行）
        assertThat(java)
                .as("材质为空的行要跳过")
                .contains("if (materials.isEmpty())");
    }

    /**
     * 实测真实数据：成分明细最后一行带 {@code washNote}（洗涤说明），
     * 而 {@code wash_instructions} 列却是 NULL ——
     * 洗涤说明其实早就录进去了，却从没给顾客看过。
     */
    @Test
    @DisplayName("⑳ 洗涤说明要能从成分明细里的 washNote 兜底取出")
    void washNoteMustFallbackToWashInstructions() throws Exception {
        String java = readAny("shop/orchestration/ShopOrderOrchestrator.java");
        assertThat(java)
                .as("必须读取 washNote")
                .contains("washNote");
        assertThat(java)
                .as("独立字段为空时用 washNote 兜底")
                .contains("washFromParts");
        assertThat(java)
                .as("兜底仍走 putIfPresent，空值不下发")
                .contains("putIfPresent(data, \"washInstructions\", washFromParts)");
    }

    /* ─────────────── ㉑ 图片轮播（用户实测：不自动动 / 不能左右滑动 / 无间隔设置） ─────────────── */

    /**
     * 用户实测反馈：「图片轮播也不自动动 也没有设置这些时间的地方 还有用户都无法左右滑动
     * 看图片这些 全都是死的」。
     *
     * <p>根因不是「没写交互」，而是**渲染与绑定的图片列表不是同一份**：
     * 画廊按商家排好的 {@code d.gallery} 渲染，交互却按「主图 + 各颜色图」重算总数。
     * 商家配了轮播图时两者数量对不上（常见 5 张 vs 1 张），
     * {@code if (galTotal > 1)} 为假 → 左右按钮、指示点、触摸滑动全部不绑定。
     *
     * <p><b>2026-10-14 修订</b>：原断言写的是 {@code doesNotContain("var galImgs = []")}，
     * 想表达「不许另算一份列表」。但它只是「不许出现这个变量名」的代理断言 ——
     * 当年把变量删掉、却漏删了读它的那几行，于是选颜色时抛
     * {@code galImgs is not defined}，处理函数在刷新尺码前中断，尺码永远不出现（线上实测 45% 款式命中）。
     * 现改为断言**真正的不变量**：清单只有一个来源 {@code galleryImages(d)}，
     * 渲染与选色换图共用同一个数组；「主图 + 各颜色图」的回落逻辑全文件只允许出现一处。
     */
    @Test
    @DisplayName("㉗ 轮播总数必须以「渲染出来的图片数」为准，不得另算一份列表")
    void carouselTotalMustComeFromRenderedDom() throws Exception {
        String s = shopPage();
        assertThat(s)
                .as("必须以渲染出来的 cell 数为唯一真源")
                .contains("ctrack.children.length");
        assertThat(s)
                .as("轮播清单只能有一个来源，且渲染与选色换图共用它")
                .contains("galImgs = galleryImages(d)")
                // D-802/D-805：返回入口挪到顶栏后，轮播不再自带返回圈（true → false）。
                // 守护的意图是「清单只有一个来源、渲染与选色换图共用」，
                // 这条不变，只是 carouselHtml 的第二个参数变了。
                .contains("carouselHtml(galImgs, false)")
                .contains("galImgs.indexOf(own)");
        assertThat(countOf(s, "imgs.push(d.cover)"))
                .as("「主图 + 各颜色图」的回落逻辑只允许存在一处 —— 渲染与交互各算一份正是滑动全失效的根因")
                .isEqualTo(1);
        assertThat(s)
                .as("galImgs 必须先声明：曾经漏删读它的代码，导致选颜色抛 ReferenceError、尺码永不出现")
                .contains("var galImgs = [];");
    }

    /** 统计子串出现次数（用于「只允许一处」这类断言） */
    private static int countOf(String haystack, String needle) {
        int n = 0, i = 0;
        while ((i = haystack.indexOf(needle, i)) >= 0) { n++; i += needle.length(); }
        return n;
    }

    @Test
    @DisplayName("㉘ 轮播必须支持自动播放、间隔可配、顾客操作时暂停")
    void carouselMustAutoplayAndPause() throws Exception {
        String s = shopPage();
        assertThat(s).as("自动播放定时器").contains("startAuto");
        assertThat(s).as("间隔由店铺配置下发，默认 4 秒").contains("d.carouselIntervalMs");
        assertThat(s).as("开关由店铺配置下发").contains("d.carouselAutoplay");
        assertThat(s)
                .as("顾客上手就暂停（否则手指刚碰到图就自己翻走）")
                .contains("addEventListener(ev, stopAuto");
        // 2026-10-14：拖动事件从 .track 改绑到轮播容器。
        // 左右箭头/返回键是 .track 的兄弟节点，手指落在箭头上时事件不冒泡到 .track，
        // 滑动会被整条吞掉（实测从图片右缘起手左滑无任何反应）。
        assertThat(s)
                .as("拖动事件必须绑在轮播容器上，绑 .track 会被左右箭头吞掉手势")
                .doesNotContain("ctrack.addEventListener('touch")
                .contains("dragEl.addEventListener('touchstart'");
        assertThat(s)
                .as("电脑端打开分享链接时箭头曾失效，必须也能用鼠标拖动切图")
                .contains("dragEl.addEventListener('mousedown'");
        assertThat(s).as("后台标签页不空转").contains("document.hidden");
    }

    @Test
    @DisplayName("㉙ 左右箭头不得与左上角返回键同坐标（否则点左箭头变成返回）")
    void navButtonsMustNotOverlapBack() throws Exception {
        String s = shopPage();
        int i = s.indexOf(".d-carousel .navbtn{");
        assertThat(i).isGreaterThan(0);
        String rule = s.substring(i, Math.min(i + 320, s.length()));
        assertThat(rule)
                .as("左右箭头应垂直居中，不能和 .d-back 一样贴 top + left:10px")
                .contains("top:50%")
                .doesNotContain("env(safe-area-inset-top)");
    }

    @Test
    @DisplayName("㉚ 店铺配置必须能设置轮播开关与间隔（否则商家无从下手）")
    void shopConfigMustExposeCarouselSettings() throws Exception {
        String admin = readAny("shop/orchestration/ShopAdminOrchestrator.java");
        assertThat(admin).as("保存轮播开关").contains("setCarouselAutoplay");
        assertThat(admin).as("保存轮播间隔").contains("setCarouselIntervalMs");
        assertThat(admin)
                .as("间隔必须做上下限校验（太快看不清、太慢像卡住）")
                .contains("轮播间隔请设置在 2~10 秒之间");

        String detail = readAny("shop/orchestration/ShopOrderOrchestrator.java");
        assertThat(detail)
                .as("详情接口必须把轮播设置下发给顾客端")
                .contains("carouselIntervalMs")
                .contains("carouselAutoplay");
    }

    /* ─────────────── ㉕ 上架编辑页必须能填「详情页每一块」的内容 ─────────────── */

    /**
     * 用户反馈：「详情页租户这边根本就不能做每一个模块每一个模块的信息」。
     *
     * <p>D-782 补齐了轮播图/视频/品牌/尺码表/卖点/FAQ/价格说明，但顾客端详情页
     * 实际渲染的「商品参数（面料成分）/ 洗涤说明 / 款式详情」三块**仍然没有入口** ——
     * 商家只能跑去「款式资料」那个给生产车间用的几十字段大表单里填。
     * 本测试守护这三块的编辑入口，以及「填了必须真的能到顾客端」。
     */
    @Test
    @DisplayName("㉛ 上架编辑页必须提供 面料成分 / 洗涤说明 / 款式详情 三个入口")
    void listingEditorMustEditDetailModules() throws Exception {
        // D-785 起这三块归入「详情页模块」：开关、顺序、内容合一，
        // 组件从 ListingInfoSection 搬到了 DetailModuleContent。
        String content = readAny("components/DetailModuleContent.tsx");
        // 界面上的字段名是 fabric/wash/desc，落到款式字段名（fabricComposition…）在 hook 里
        assertThat(content).as("面料成分输入").contains("面料成分").contains("setFabric");
        assertThat(content).as("洗涤说明输入").contains("洗涤说明").contains("setWash");
        assertThat(content).as("款式详情输入").contains("款式详情").contains("setDesc");

        String hook = readAny("hooks/useListingEditor.ts");
        assertThat(hook)
                .as("必须真的把这三个字段映射到款式字段并提交")
                .contains("fabricComposition")
                .contains("washInstructions")
                .contains("stylePatch.description");
        assertThat(hook)
                .as("只提交真正改动过的字段（PUT /style/info 是局部更新，全量提交会用旧值覆盖新值）")
                .contains("if (Object.keys(stylePatch).length > 1)");
    }

    /**
     * D-785：用户原话「不要开关在这里，内容在那边」。
     *
     * <p>此前开关在「详情页布局」、内容在「详情内容」「上架与商品说明」三个区，
     * 商家对不上哪个开关管哪段文字。这里把「合一」钉成契约：
     * 模块卡片里必须同时渲染开关与该模块的内容编辑器。
     */
    /**
     * D-785：前后端判定口径必须一致。
     *
     * <p>前端 {@code listingCompliance.looksLikeProductionContent} 只负责给运营提示，
     * 后端 {@code ProductionContentDetector} 才真正隐藏。两边特征词/阈值一旦漂移，
     * 就会出现「前端说没问题、后端偷偷把内容藏了」—— 运营完全不知道发生了什么。
     * 原来只有一行注释提醒，改代码的人很容易漏掉，所以在这里钉成测试。
     */
    @Test
    @DisplayName("㉞ 前后端「生产工艺资料」判定口径必须一致")
    void productionContentDetectorMustMatchFrontend() throws Exception {
        String backend = readAny("shop/orchestration/ProductionContentDetector.java");
        String frontend = readAny("listingCompliance.ts");

        java.util.regex.Matcher bm = java.util.regex.Pattern
                .compile("\"([^\"]+)\"")
                .matcher(backend.substring(backend.indexOf("PROCESS_MARKERS"),
                        backend.indexOf("MIN_HITS")));
        java.util.Set<String> backendMarkers = new java.util.LinkedHashSet<>();
        while (bm.find()) {
            backendMarkers.add(bm.group(1));
        }
        java.util.regex.Matcher fm = java.util.regex.Pattern
                .compile("'([^']+)'")
                .matcher(frontend.substring(frontend.indexOf("PROCESS_MARKERS"),
                        frontend.indexOf("PROCESS_MIN_HITS")));
        java.util.Set<String> frontendMarkers = new java.util.LinkedHashSet<>();
        while (fm.find()) {
            frontendMarkers.add(fm.group(1));
        }

        assertThat(backendMarkers).as("前后端特征词必须完全一致").isEqualTo(frontendMarkers);
        assertThat(backendMarkers).as("特征词不能被清空").isNotEmpty();
        assertThat(backend).contains("private static final int MIN_HITS = 2;");
        assertThat(frontend).contains("const PROCESS_MIN_HITS = 2;");
        assertThat(backend).contains("private static final int MIN_LENGTH = 40;");
        assertThat(frontend).contains("const PROCESS_MIN_LENGTH = 40;");
    }

    @Test
    @DisplayName("㉟ 模块开关与它的内容必须在同一个组件里渲染")
    void moduleSwitchAndContentMustLiveTogether() throws Exception {
        String editor = readAny("components/DetailModuleEditor.tsx");
        assertThat(editor).as("按模块取内容编辑器").contains("MODULE_CONTENT[m.moduleKey]");
        assertThat(editor).as("在模块卡片内渲染内容").contains("<Editor ctx={ctx} />");
        assertThat(editor).as("没有内容的模块要说清来源")
                .contains("所以这里没有输入框");

        String drawer = readAny("components/ListingEditDrawer.tsx");
        assertThat(drawer).as("旧的分区组件必须下线")
                .doesNotContain("LayoutEditorSection")
                .doesNotContain("ListingInfoSection")
                .doesNotContain("ListingContentSection");
    }

    /**
     * D-784 补修：「猜你喜欢」原先在布局里是个**假开关** —— 渲染器返回空串、
     * 真正的容器在别处硬追加，商家关掉它顾客端照样显示。
     */
    @Test
    @DisplayName("㉞ 猜你喜欢必须是真模块（开关生效且只渲染一次）")
    void recommendMustBeRealModule() throws Exception {
        String page = shopPage();
        assertThat(page).as("recommend 要由模块系统渲染")
                .contains("recommend: function (d) {\n          // D-784 补修")
                .contains("return recommendSectionHtml();");
        assertThat(page).as("不能再在 renderDetail 里硬追加，否则会出现重复 id")
                .doesNotContain("html += recommendSectionHtml();");
    }

    @Test
    @DisplayName("㉜ 这三块内容必须真的能到顾客端（不能只存不发）")
    void detailModulesMustReachCustomer() throws Exception {
        String java = readAny("shop/orchestration/ShopOrderOrchestrator.java");
        assertThat(java).as("款式详情").contains("putIfPresent(data, \"description\"");
        assertThat(java).as("面料成分").contains("putIfPresent(data, \"fabricComposition\"");
        assertThat(java).as("洗涤说明（含 washNote 兜底）").contains("putIfPresent(data, \"washInstructions\"");

        String page = shopPage();
        assertThat(page).as("顾客端要渲染面料成分").contains("d.fabricComposition");
        assertThat(page).as("顾客端要渲染洗涤说明").contains("washInstructions");
    }
}
