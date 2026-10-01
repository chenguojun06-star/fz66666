package com.fashion.supplychain.config;

import com.fashion.supplychain.common.AuthTokenService;
import com.fashion.supplychain.system.orchestration.PermissionCalculationEngine;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SSE 异步分发的鉴权回归守护（D-699）
 *
 * <p><b>线上事故现象</b>：AI 顾问流式接口
 * {@code GET /api/intelligence/ai-advisor/chat/stream} 在浏览器报
 * {@code net::ERR_INCOMPLETE_CHUNKED_ENCODING}，HTTP 状态码却是 200 ——
 * SSE 事件已写出，但连接被硬关闭，浏览器拿不到 chunked 结束块。
 *
 * <p><b>根因</b>：Spring Security 7.1.1 的 {@code AuthorizationFilter}
 * 对<b>每一个 dispatch</b> 都做授权（官方文档 "All Dispatches Are Authorized"，
 * {@code setFilterAsyncDispatch} 默认 {@code true}）；Boot 3.4 用的 Spring Security 6.4 不会。
 * {@code SseEmitter} 会启动异步处理：{@code REQUEST} 分发鉴权通过后，
 * 容器在响应结束前再做一次 {@code ASYNC} 分发。本项目
 * {@code sessionManagement = STATELESS}（无 HttpSession），{@code ASYNC} 分发时
 * SecurityContext 无处恢复 → 视为匿名 → 命中 {@code /api/**}.authenticated()} →
 * 抛 {@code AuthorizationDeniedException}；此时响应已提交，
 * 错误页也渲染不出来 → 连接被截断。
 *
 * <p><b>修复</b>：{@code SecurityConfigHelper} 首行
 * {@code dispatcherTypeMatchers(ASYNC, ERROR).permitAll()}。
 *
 * <p><b>为什么只测 AuthorizationFilter</b>：本测试不跑整条过滤器链。
 * {@code TokenAuthFilter} 会查 Redis/DB，测试库无对应表，跑全链只会得到一堆
 * 与本缺陷无关的 SQL 异常，反而掩盖真正的断言点。授权决策由
 * {@code AuthorizationFilter} 独家作出，单独验证它既精准又稳定。
 *
 * <p><b>同时钉住反面</b>：{@code REQUEST} 分发对匿名请求<b>必须仍然被拒绝</b>。
 * 只测「ASYNC 放行」是不够的 —— 万一有人把规则改成 {@code anyRequest().permitAll()}
 * 来图省事，测试同样会绿，但全站鉴权就没了。反向断言把这个风险变成红灯。
 */
@SpringBootTest(classes = com.fashion.supplychain.architecture.TestApplicationConfig.class)
@ActiveProfiles("test")
@DisplayName("SSE 异步分发鉴权（D-699：ERR_INCOMPLETE_CHUNKED_ENCODING 回归）")
class SseAsyncDispatchAuthorizationTest {

    private static final String SSE_URL = "/api/intelligence/ai-advisor/chat/stream";

    @Autowired
    private SecurityFilterChain securityFilterChain;

    /**
     * 这两个 bean 在构造期就查库（PermissionCalculationEngine 有 {@code @PostConstruct} 预热权限），
     * 测试库无对应表 → 上下文启动即 SQL 异常。
     * 本测试只关心<b>授权规则</b>，与「token 怎么解析、权限怎么算」无关，故直接 mock 掉。
     */
    @MockitoBean
    private AuthTokenService authTokenService;

    @MockitoBean
    private PermissionCalculationEngine permissionCalculationEngine;

    /** 记录过滤器链是否被放行到底（走到业务层） */
    private static final class RecordingChain implements FilterChain {
        boolean reachedApplication;

        @Override
        public void doFilter(ServletRequest request, ServletResponse response) {
            reachedApplication = true;
        }
    }

    @BeforeEach
    void becomeAnonymous() {
        // 复现线上 ASYNC 分发的真实状态：无 HttpSession 可恢复，SecurityContext 只剩匿名
        SecurityContextHolder.clearContext();
        SecurityContextHolder.getContext().setAuthentication(
                new AnonymousAuthenticationToken(
                        "key", "anonymousUser",
                        AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS")));
    }

    @Test
    @DisplayName("ASYNC 分发必须放行（SseEmitter 收尾分发，否则 SSE 流被截断）")
    void asyncDispatch_isPermitted_soSseStreamCanComplete() throws Exception {
        RecordingChain chain = new RecordingChain();

        boolean denied = runAuthorizationFilter(DispatcherType.ASYNC, chain);

        assertThat(denied)
                .as("ASYNC 分发被拒 → AuthorizationDeniedException → 响应已提交、错误页渲染不出来"
                        + " → 连接被截断 → 前端 ERR_INCOMPLETE_CHUNKED_ENCODING")
                .isFalse();
        assertThat(chain.reachedApplication)
                .as("ASYNC 分发必须放行到后续链路，才能把已授权的 SSE 响应正常收尾")
                .isTrue();
    }

    @Test
    @DisplayName("ERROR 分发必须放行（Boot 错误转发同样会二次鉴权）")
    void errorDispatch_isPermitted() throws Exception {
        RecordingChain chain = new RecordingChain();

        boolean denied = runAuthorizationFilter(DispatcherType.ERROR, chain);

        assertThat(denied)
                .as("ERROR 分发被拒会让容器错误页无法渲染")
                .isFalse();
    }

    @Test
    @DisplayName("【反向断言】匿名 REQUEST 分发仍必须被拒（防止把鉴权整体放开）")
    void anonymousRequestDispatch_isStillDenied() throws Exception {
        RecordingChain chain = new RecordingChain();

        boolean denied = runAuthorizationFilter(DispatcherType.REQUEST, chain);

        assertThat(denied)
                .as("匿名访问 SSE 接口绝不能被放行 —— 这是本次修复的红线："
                        + "只放行 ASYNC/ERROR 二次分发，真实鉴权必须原样保留")
                .isTrue();
        assertThat(chain.reachedApplication)
                .as("被拒的 REQUEST 不得触达业务层")
                .isFalse();
    }

    /**
     * 只跑 {@code AuthorizationFilter}，返回「是否拒绝了请求」。
     *
     * <p>拒绝时它会走 AccessDeniedHandler 并中断链路，因此用
     * 「后续链路是否被触达」+ 异常捕获双重判定。
     */
    private boolean runAuthorizationFilter(DispatcherType dispatcherType, RecordingChain chain)
            throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", SSE_URL);
        request.setDispatcherType(dispatcherType);
        request.setRequestURI(SSE_URL);
        request.setContextPath("");
        request.setServletPath(SSE_URL);
        MockHttpServletResponse response = new MockHttpServletResponse();

        try {
            authorizationFilter().doFilter(request, response, chain);
        } catch (Exception denied) {
            return true;
        }
        return !chain.reachedApplication;
    }

    /**
     * 从真实过滤器链里定位 {@code AuthorizationFilter}。
     * Spring Security 7 可能用装饰器包装它，故沿类继承链往上比对简单类名。
     */
    private Filter authorizationFilter() {
        for (Filter filter : securityFilterChain.getFilters()) {
            for (Class<?> c = filter.getClass(); c != null; c = c.getSuperclass()) {
                if ("AuthorizationFilter".equals(c.getSimpleName())) {
                    return filter;
                }
            }
        }
        throw new AssertionError(
                "过滤器链中找不到 AuthorizationFilter，实际过滤器："
                        + securityFilterChain.getFilters().stream()
                        .map(f -> f.getClass().getSimpleName()).toList());
    }
}
