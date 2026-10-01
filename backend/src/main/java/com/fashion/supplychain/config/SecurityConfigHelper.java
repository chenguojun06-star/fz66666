package com.fashion.supplychain.config;

import jakarta.servlet.DispatcherType;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer;

public final class SecurityConfigHelper {

    private SecurityConfigHelper() {}

    public static void configure(
            AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry authz) {

        // 【D-699 / Boot 4.1 回归修复】必须放在所有 requestMatchers 之前（dispatcherTypeMatchers 优先匹配）。
        //
        // 现象：AI 顾问 SSE 流式接口 /api/intelligence/ai-advisor/chat/stream 报
        //      net::ERR_INCOMPLETE_CHUNKED_ENCODING（HTTP 200 但 chunked 流被截断，浏览器拿不到结束块）。
        //
        // 根因：Spring Security 7.1.1 的 AuthorizationFilter 对「每个 dispatch」都做授权
        //      （官方文档 "All Dispatches Are Authorized"，AuthorizationFilter.setFilterAsyncDispatch
        //      默认 true），而 Boot 3.4（Spring Security 6.4）不会在 ASYNC 分发上重复授权。
        //      SseEmitter 会启动异步处理：REQUEST 分发鉴权通过后，容器在响应结束前做一次 ASYNC 分发。
        //      本项目 sessionManagement 为 STATELESS（无 HttpSession），ASYNC 分发时 SecurityContext
        //      无处恢复 → 视为匿名 → 命中下面 `/api/**`.authenticated() → 抛 AuthorizationDeniedException。
    //      此时响应已提交（SSE 事件已写出），ErrorMvcAutoConfiguration 再渲染错误页只会打
        //      "response has already been committed"，连接被硬关闭 → 前端 ERR_INCOMPLETE_CHUNKED_ENCODING。
        //
        // 安全性：放行 ASYNC/ERROR 分发**不放宽真实鉴权**。真正调用 controller、真正校验 token 的是
        //      REQUEST 分发，仍走 TokenAuthFilter + 下面全部规则；ASYNC 分发只负责把已授权的响应收尾。
        //      官方文档对 ERROR 分发同样建议 permitAll。
        authz.dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR).permitAll();

        authz.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll();

        authz.requestMatchers(SecurityConstants.PUBLIC_STATIC_ENDPOINTS).permitAll();

        authz.requestMatchers(SecurityConstants.ACTUATOR_PUBLIC_ENDPOINTS).permitAll();

        authz.requestMatchers(SecurityConstants.SWAGGER_ENDPOINTS).authenticated();

        // 文件下载改为 permitAll：
        // 原因——<img src> / <a download> 不走 axios，前端 401 拦截器（refresh-token）无法触发，
        //       token 一过期所有图片立刻 401，用户刷新页面也救不回来。
        // 安全等价性——① 文件名是 UUID（128-bit 不可猜测）② tenantId 在 URL 路径里
        //              ③ 文件物理隔离在 tenants/{tenantId}/ 子目录
        //              ④ TenantFileController 内仍按 URL tenantId 检索文件，跨租户文件不可达
        //              所以放行后安全等价于已认证。
        authz.requestMatchers(SecurityConstants.FILE_DOWNLOAD_ENDPOINTS).permitAll();

        authz.requestMatchers(SecurityConstants.USER_SELF_ENDPOINTS).authenticated();

        authz.requestMatchers(SecurityConstants.PRODUCTION_ENDPOINTS).authenticated();
        authz.requestMatchers(HttpMethod.GET, SecurityConstants.PRODUCTION_GET_ENDPOINTS).authenticated();

        authz.requestMatchers(SecurityConstants.WAREHOUSE_ENDPOINTS).authenticated();

        authz.requestMatchers(SecurityConstants.SYSTEM_TENANT_AUTH_ENDPOINTS).authenticated();

        authz.requestMatchers(HttpMethod.GET, SecurityConstants.SYSTEM_USER_AUTH_GET_ENDPOINTS).authenticated();
        authz.requestMatchers(HttpMethod.PUT, SecurityConstants.SYSTEM_USER_AUTH_PUT_ENDPOINTS).authenticated();

        authz.requestMatchers(HttpMethod.GET, SecurityConstants.ORGANIZATION_AUTH_GET_ENDPOINTS).authenticated();

        authz.requestMatchers(HttpMethod.GET, SecurityConstants.FACTORY_AUTH_GET_ENDPOINTS).authenticated();

        authz.requestMatchers(SecurityConstants.APP_STORE_AUTH_ENDPOINTS).authenticated();
        authz.requestMatchers(HttpMethod.GET, SecurityConstants.APP_STORE_AUTH_GET_ENDPOINTS).authenticated();

        authz.requestMatchers(HttpMethod.GET, SecurityConstants.TENANT_PROFILE_AUTH_GET_ENDPOINTS).authenticated();

        authz.requestMatchers(SecurityConstants.MINIPROGRAM_MENU_AUTH_ENDPOINTS).authenticated();

        authz.requestMatchers(HttpMethod.GET, SecurityConstants.DICT_AUTH_GET_ENDPOINTS).authenticated();

        authz.requestMatchers(SecurityConstants.ORDER_REMARK_AUTH_ENDPOINTS).authenticated();

        // D-362i：操作日志只读端点（服务层已租户隔离，仅放行 GET）
        authz.requestMatchers(HttpMethod.GET, SecurityConstants.OPERATION_LOG_AUTH_ENDPOINTS).authenticated();

        // D-527：用户反馈提交/我的反馈（控制器注释即"所有登录用户可用"，否则工人提交 403）
        authz.requestMatchers(SecurityConstants.USER_FEEDBACK_AUTH_ENDPOINTS).authenticated();

        // 用户偏好（列显隐/页签图钉固定等个人显示偏好）：
        // 必须放在 TENANT_OWNER_ENDPOINTS（/api/system/** 要求租户主账号）之前，
        // 否则普通主管/工人保存任何个人偏好都 403。数据由 UserPreferenceOrchestrator 严格按
        // tenantId + 当前 userId 隔离，放开到所有登录用户不产生越权面。
        authz.requestMatchers("/api/system/user-preference", "/api/system/user-preference/**").authenticated();

        authz.requestMatchers(SecurityConstants.ADMIN_USER_MANAGEMENT_ENDPOINTS)
                .hasAnyAuthority(SecurityConstants.ADMIN_ROLES.toArray(new String[0]));

        authz.requestMatchers(SecurityConstants.ADMIN_SYSTEM_ENDPOINTS)
                .hasAnyAuthority(SecurityConstants.ADMIN_SYSTEM_ROLES.toArray(new String[0]));

        authz.requestMatchers(SecurityConstants.SUPPLIER_USER_ENDPOINTS)
                .hasAnyAuthority(SecurityConstants.TENANT_OWNER_ROLES.toArray(new String[0]));

        authz.requestMatchers(SecurityConstants.TENANT_OWNER_ENDPOINTS)
                .hasAnyAuthority(SecurityConstants.TENANT_OWNER_ROLES.toArray(new String[0]));

        authz.requestMatchers("/api/**").authenticated();

        authz.anyRequest().denyAll();
    }
}