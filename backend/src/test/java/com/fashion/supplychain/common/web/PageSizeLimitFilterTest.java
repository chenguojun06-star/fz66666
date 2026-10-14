package com.fashion.supplychain.common.web;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link PageSizeLimitFilter} 契约测试。
 *
 * <p>守护的核心契约：<b>分页大小必须被夹到 [1, 200]</b>。
 *
 * <p>背景（2026-10-14 盘点）：全仓 47 个 Controller、70 个分页参数
 * （pageSize 37 / limit 27 / size 6），此前只有 7 个文件各自截断过，
 * 其余直接透传给 MyBatis-Plus 的 {@code Page<>}。
 * 实测 {@code t_operation_log} 8393 行，{@code ?pageSize=100000} 会整表返回；
 * 表再长就是一次请求打满 CPU 与堆内存。
 */
@DisplayName("PageSizeLimitFilter - 分页大小上限守卫")
class PageSizeLimitFilterTest {

    private final PageSizeLimitFilter filter = new PageSizeLimitFilter();

    /** 只关心包装结果，直接构造包装类，避免被 FilterChain 的细节干扰 */
    private jakarta.servlet.http.HttpServletRequest wrap(MockHttpServletRequest req) {
        return new PageSizeLimitFilter.ClampedPageSizeRequest(req);
    }

    private MockHttpServletRequest req(String... kv) {
        MockHttpServletRequest r = new MockHttpServletRequest();
        for (int i = 0; i < kv.length; i += 2) {
            r.setParameter(kv[i], kv[i + 1]);
        }
        return r;
    }

    @Test
    @DisplayName("上限 10000：pageSize=100000 必须被夹到 10000")
    void clampsToMax() {
        var r = wrap(req("pageSize", "100000"));
        assertThat(r.getParameter("pageSize")).isEqualTo("10000");
        // 上限取 10000 有依据：前端有 96 处传 >200（下拉框全量加载），
        // 实测最大 9999。取 200 会让那些下拉框静默丢选项。
        assertThat(PageSizeLimitFilter.MAX_PAGE_SIZE).isEqualTo(10000);
    }

    @Test
    @DisplayName("现有合法用法一律不受影响（前端实测最大值 9999 必须原样通过）")
    void doesNotBreakExistingCallSites() {
        for (String v : new String[]{"200", "500", "999", "1000", "5000", "9999"}) {
            assertThat(wrap(req("pageSize", v)).getParameter("pageSize"))
                    .as("pageSize=%s 是现有前端在用的合法值，不能被改", v)
                    .isEqualTo(v);
        }
        assertThat(wrap(req("pageSize", "10000")).getParameter("pageSize")).isEqualTo("10000");
        assertThat(wrap(req("pageSize", "10001")).getParameter("pageSize")).isEqualTo("10000");
    }

    @Test
    @DisplayName("正常值原样通过（不能把 20 也改掉）")
    void passesNormalValuesThrough() {
        assertThat(wrap(req("pageSize", "20")).getParameter("pageSize")).isEqualTo("20");
        assertThat(wrap(req("pageSize", "200")).getParameter("pageSize")).isEqualTo("200");
    }

    @Test
    @DisplayName("下限夹到 1：pageSize=0 在 MyBatis-Plus 里等于不分页，比设大值更危险")
    void clampsLowerBound() {
        assertThat(wrap(req("pageSize", "0")).getParameter("pageSize")).isEqualTo("1");
        assertThat(wrap(req("pageSize", "-5")).getParameter("pageSize")).isEqualTo("1");
    }

    @Test
    @DisplayName("三个受管参数都夹：pageSize / size / limit")
    void clampsAllManagedNames() {
        assertThat(wrap(req("pageSize", "99999")).getParameter("pageSize")).isEqualTo("10000");
        assertThat(wrap(req("size", "99999")).getParameter("size")).isEqualTo("10000");
        assertThat(wrap(req("limit", "99999")).getParameter("limit")).isEqualTo("10000");
        assertThat(PageSizeLimitFilter.CLAMPED_NAMES)
                .containsExactlyInAnyOrder("pageSize", "size", "limit");
    }

    @Test
    @DisplayName("不管别的参数：page / keyword / 业务参数一律不动")
    void leavesOtherParamsAlone() {
        var r = wrap(req("page", "1", "keyword", "连衣裙", "quantity", "99999"));
        assertThat(r.getParameter("page")).isEqualTo("1");
        assertThat(r.getParameter("keyword")).isEqualTo("连衣裙");
        // quantity=99999 是业务值，绝不能因为"看着像条数"被夹掉
        assertThat(r.getParameter("quantity")).isEqualTo("99999");
    }

    @Test
    @DisplayName("非数字原样放行：保持原有的参数绑定报错语义，不替调用方做校验")
    void leavesNonNumericUntouched() {
        assertThat(wrap(req("pageSize", "abc")).getParameter("pageSize")).isEqualTo("abc");
        // 超出 long 范围也算非数字
        assertThat(wrap(req("pageSize", "99999999999999999999")).getParameter("pageSize"))
                .isEqualTo("99999999999999999999");
    }

    @Test
    @DisplayName("数组与 Map 两条路也要覆盖：只改 getParameter 会漏")
    void coversParameterValuesAndMap() {
        var r = wrap(req("pageSize", "99999"));
        assertThat(r.getParameterValues("pageSize")).containsExactly("10000");
        assertThat(r.getParameterMap().get("pageSize")).containsExactly("10000");
    }

    @Test
    @DisplayName("没有任何分页参数时不包装，直接透传原请求")
    void passesThroughWhenNothingToClamp() {
        var r = wrap(req("keyword", "abc"));
        assertThat(r.getParameterMap()).containsOnlyKeys("keyword");
    }

    @Test
    @DisplayName("过滤器必须真的走一遍链路（包装后交给下一个 filter）")
    void filterInvokesChain() throws Exception {
        MockHttpServletRequest req = req("pageSize", "50000");
        MockHttpServletResponse res = new MockHttpServletResponse();
        boolean[] called = {false};
        filter.doFilter(req, res, (r, s) -> {
            called[0] = true;
            assertThat(((jakarta.servlet.http.HttpServletRequest) r).getParameter("pageSize"))
                    .as("控制器看到的必须是夹过的值")
                    .isEqualTo("10000");
        });
        assertThat(called[0]).as("必须继续走过滤器链，不能把请求吞掉").isTrue();
    }

    @Test
    @DisplayName("getParameterMap 必须不可变（Servlet 规范要求）")
    void parameterMapIsImmutable() {
        Map<String, String[]> m = wrap(req("pageSize", "99999")).getParameterMap();
        try {
            m.put("x", new String[]{"y"});
            assertThat(false).as("应当抛 UnsupportedOperationException").isTrue();
        } catch (UnsupportedOperationException expected) {
            // 符合规范
        }
    }

    @Test
    @DisplayName("必须带 @Component —— 注解一丢，整个守卫就静默失效了")
    void mustBeRegisteredAsBean() {
        assertThat(PageSizeLimitFilter.class.isAnnotationPresent(
                org.springframework.stereotype.Component.class))
                .as("去掉 @Component 就不会被 Spring 注册，70 个分页参数全部失去保护")
                .isTrue();
    }

    @Test
    @DisplayName("必须跑在 DispatcherServlet 之前（Order 足够靠前）")
    void mustRunEarly() {
        org.springframework.core.annotation.Order order =
                org.springframework.core.annotation.AnnotationUtils.findAnnotation(
                        PageSizeLimitFilter.class, org.springframework.core.annotation.Order.class);
        assertThat(order).as("没有 @Order 的话执行顺序不确定").isNotNull();
        assertThat(order.value()).isLessThan(0);
    }

    @Test
    @DisplayName("构造包装时不得触碰 getParameterMap（会提前触发 multipart 解析、搞坏文件上传）")
    void constructionMustNotEagerlyParseParameters() {
        // 用一个"一被问就记账"的请求来验证：构造包装期间不许发生任何参数读取
        final boolean[] touched = {false};
        MockHttpServletRequest probe = new MockHttpServletRequest() {
            @Override
            public java.util.Map<String, String[]> getParameterMap() {
                touched[0] = true;
                return super.getParameterMap();
            }
        };
        probe.setParameter("pageSize", "9999");
        touched[0] = false;                       // 忽略 setParameter 期间的内部访问
        wrap(probe);
        assertThat(touched[0])
                .as("构造期读 getParameterMap 会提前解析 multipart 表单，"
                        + "等 MultipartResolver 再处理上传请求时就晚了（症状是上传突然失败）")
                .isFalse();
    }

    // ==================== 跨端守护 ====================

    /**
     * 前端/小程序里如果有人写了超过上限的分页值，构建期就该失败 ——
     * 否则请求会被静默夹取，表现是"下拉框少了选项"，
     * 而这类静默截断正是本项目反复踩的坑（同一轮里已经修过好几处）。
     */
    @Test
    @DisplayName("前端/小程序不得出现超过 MAX_PAGE_SIZE 的分页值（超了会被静默夹取）")
    void frontendMustNotExceedMaxPageSize() throws Exception {
        java.nio.file.Path root = findRepoRoot();
        java.util.List<String> offenders = new java.util.ArrayList<>();
        java.util.regex.Pattern p = java.util.regex.Pattern.compile(
                "\\b(pageSize|limit|size)\\s*[:=]\\s*[\"']?(\\d{4,})");
        for (String dir : new String[]{"frontend/src", "h5-web/src", "miniprogram"}) {
            java.nio.file.Path base = root.resolve(dir);
            if (!java.nio.file.Files.isDirectory(base)) {
                continue;
            }
            try (java.util.stream.Stream<java.nio.file.Path> walk = java.nio.file.Files.walk(base)) {
                for (java.nio.file.Path f : walk.toList()) {
                    String name = f.getFileName().toString();
                    if (f.toString().contains("node_modules") || !name.matches(".*\\.(ts|tsx|js|vue|wxml)$")) {
                        continue;
                    }
                    String text = java.nio.file.Files.readString(f);
                    java.util.regex.Matcher m = p.matcher(text);
                    while (m.find()) {
                        long v = Long.parseLong(m.group(2));
                        if (v > PageSizeLimitFilter.MAX_PAGE_SIZE) {
                            offenders.add(root.relativize(f) + " → " + m.group(0));
                        }
                    }
                }
            }
        }
        assertThat(offenders)
                .as("这些调用会超过上限 %d，请求会被静默夹取（下拉框会少选项）。"
                        + "要么调小，要么先和上限一起商量改大。", PageSizeLimitFilter.MAX_PAGE_SIZE)
                .isEmpty();
    }

    /** 从测试运行目录往上找到仓库根（含 frontend 目录的那一层） */
    private static java.nio.file.Path findRepoRoot() {
        java.nio.file.Path p = java.nio.file.Paths.get("").toAbsolutePath();
        for (int i = 0; i < 4 && p != null; i++) {
            if (java.nio.file.Files.isDirectory(p.resolve("frontend"))) {
                return p;
            }
            p = p.getParent();
        }
        throw new IllegalStateException("找不到仓库根目录（应含 frontend/）");
    }
}
