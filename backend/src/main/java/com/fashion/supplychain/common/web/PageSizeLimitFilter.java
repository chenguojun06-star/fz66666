package com.fashion.supplychain.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 分页大小上限守卫（2026-10-14 新增）。
 *
 * <h3>解决什么问题</h3>
 * 全仓 47 个 Controller、70 个分页参数（{@code pageSize} 37 个 / {@code limit} 27 个 /
 * {@code size} 6 个），此前只有 7 个文件各自做过 {@code Math.min(...)} 截断，
 * 其余直接透传给 MyBatis-Plus 的 {@code Page<>}。已确认 {@code OperationLogController}
 * 就是直通：{@code GET /api/system/operation-log/page?page=1&pageSize=100000}
 * 会把整表一次性捞回（实测该表 8393 行，全量返回时响应体数 MB、堆内存同步膨胀）。
 * 表再长、或换到更大的表，就是一次请求打满 CPU 与内存。
 *
 * <h3>为什么用 Filter 而不是自定义 HandlerMethodArgumentResolver</h3>
 * 自定义参数解析器在 Spring 的解析器链里**排在 {@code @RequestParam} 内置解析器之后**
 * （{@code RequestMappingHandlerAdapter#getDefaultArgumentResolvers} 先加注解类解析器、
 * 再加 custom），所以对 {@code @RequestParam int pageSize} 这种写法，
 * 自定义解析器根本不会被调用 —— 看着很对，实际一个都拦不住。
 * Filter 跑在 DispatcherServlet 之前，把请求包一层即可覆盖**所有**控制器，
 * 无论参数怎么声明、是否带注解。
 *
 * <h3>行为</h3>
 * <ul>
 *   <li>只处理 {@code pageSize} / {@code size} / {@code limit} 三个名字；</li>
 *   <li>值不是数字时**原样放行** —— 保持原有的参数绑定报错语义，不替调用方做校验；</li>
 *   <li>是数字就夹到 {@code [1, MAX_PAGE_SIZE]}：上限防打挂；
 *       下限是因为 {@code pageSize=0} 在 MyBatis-Plus 语义里等于"不分页"，
 *       反而会把整表返回，比设大值更危险；</li>
 *   <li>被夹时打 warn，便于事后定位是谁在拉大页。</li>
 * </ul>
 */
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class PageSizeLimitFilter extends OncePerRequestFilter {

    /**
     * 单页最大条数。
     *
     * <p><b>为什么是 10000 而不是常见的 50~200</b>：定这个数之前先把现有调用方数了一遍 ——
     * 前端有 96 处传的分页值超过 200，全部是"下拉框/配置项一次性加载全部选项"的场景
     * （供应商 1000、客户 1000、字典 999、角色用户全量 9999、环节配置 9999…）。
     * 夹到 200 会让这些下拉框**静默只显示前 200 项** —— 租户有 300 个供应商时
     * 后 100 个从下拉里凭空消失，正是本项目反复踩的"静默截断"类故障。
     * 取 10000 可覆盖现有全部合法用法（实测最大 9999），
     * 同时把"调用方随便填"的上限从无界收到 1 万：{@code pageSize=100000}、
     * {@code 999999999} 这类一次请求打满内存的玩法不再成立。
     *
     * <p>遗留优化项（不属本次安全修复，需产品决策）：那些"全量加载"的下拉
     * 更该改成服务端搜索，而不是靠拉一万行在浏览器里过滤。
     */
    public static final int MAX_PAGE_SIZE = 10000;

    /** 受管的分页参数名 */
    public static final Set<String> CLAMPED_NAMES = Set.of("pageSize", "size", "limit");

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {
        filterChain.doFilter(new ClampedPageSizeRequest(request), response);
    }

    /**
     * 把分页参数夹到上限内的请求包装。
     *
     * <p><b>⚠️ 必须惰性</b>：不能在构造函数里读 {@code getParameterMap()} ——
     * 那会提前触发 multipart 表单解析，等 Spring 的 MultipartResolver 再处理上传请求时
     * 就晚了，典型症状是"文件上传突然失败"。所以只在真的被问到时才夹，
     * 而且 {@code getParameter(name)} / {@code getParameterValues(name)} 走单值快路径，
     * 连 Map 都不需要构造。
     *
     * <p>三条取值路径都要覆盖（Spring 绑定单值走 getParameter，
     * 数组与 Map 形参走另外两个），只改 getParameter 会漏。
     */
    static class ClampedPageSizeRequest extends HttpServletRequestWrapper {

        ClampedPageSizeRequest(HttpServletRequest request) {
            super(request);
        }

        /** 非数字原样返回（让 Spring 照常报绑定错误）；数字则夹到 [1, MAX_PAGE_SIZE] */
        static String clampValue(String name, String raw) {
            if (raw == null || raw.isBlank()) {
                return raw;
            }
            long v;
            try {
                v = Long.parseLong(raw.trim());
            } catch (NumberFormatException e) {
                return raw;   // 非法值不接手，交给参数绑定去报错
            }
            long clamped = Math.min(Math.max(v, 1), MAX_PAGE_SIZE);
            if (clamped == v) {
                return raw;
            }
            log.warn("[PageSize] {}={} 超出允许范围[1,{}]，已夹到 {}", name, v, MAX_PAGE_SIZE, clamped);
            return String.valueOf(clamped);
        }

        private static String clampIfManaged(String name, String raw) {
            return CLAMPED_NAMES.contains(name) ? clampValue(name, raw) : raw;
        }

        @Override
        public String getParameter(String name) {
            String raw = super.getParameter(name);
            return raw == null ? null : clampIfManaged(name, raw);
        }

        @Override
        public String[] getParameterValues(String name) {
            String[] raw = super.getParameterValues(name);
            if (raw == null || !CLAMPED_NAMES.contains(name)) {
                return raw;
            }
            String[] out = new String[raw.length];
            for (int i = 0; i < raw.length; i++) {
                out[i] = clampValue(name, raw[i]);
            }
            return out;
        }

        @Override
        public Map<String, String[]> getParameterMap() {
            Map<String, String[]> original = super.getParameterMap();
            boolean any = false;
            for (String n : CLAMPED_NAMES) {
                if (original.containsKey(n)) {
                    any = true;
                    break;
                }
            }
            if (!any) {
                return original;
            }
            Map<String, String[]> merged = new LinkedHashMap<>(original);
            for (String n : CLAMPED_NAMES) {
                String[] v = original.get(n);
                if (v == null) {
                    continue;
                }
                String[] out = new String[v.length];
                for (int i = 0; i < v.length; i++) {
                    out[i] = clampValue(n, v[i]);
                }
                merged.put(n, out);
            }
            // Servlet 规范要求 getParameterMap 返回不可变视图
            return Collections.unmodifiableMap(merged);
        }
    }
}
