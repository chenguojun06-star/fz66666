package com.fashion.supplychain.common.audit;

import com.fashion.supplychain.common.UserContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.ModelAndView;

/**
 * 操作审计拦截器
 * 
 * <p>自动在请求开始时创建审计上下文，在请求结束时记录审计日志。
 * 
 * <p>记录的审计信息：
 * <ul>
 *   <li>请求追踪ID</li>
 *   <li>租户ID、用户ID</li>
 *   <li>IP地址</li>
 *   <li>请求路径、方法</li>
 *   <li>响应状态码</li>
 *   <li>处理耗时</li>
 * </ul>
 */
@Slf4j
@Component
public class AuditInterceptor implements HandlerInterceptor {

    private static final String AUDIT_CONTEXT_KEY = "auditContext";
    private static final String START_TIME_KEY = "auditStartTime";
    /** ERROR dispatch 路径：跳过审计日志，避免 SecurityContext 已被清理时的"幽灵"日志 */
    private static final String ERROR_PATH = "/error";

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // 跳过 ERROR dispatch：此时 SecurityContext/UserContext 已被 Filter 清理，
        // 记录的 tenant=null/user=null 是"幽灵"日志，无业务价值
        if (ERROR_PATH.equals(request.getRequestURI())) {
            return true;
        }

        // 记录开始时间
        request.setAttribute(START_TIME_KEY, System.currentTimeMillis());
        
        // 获取用户上下文
        Long tenantId = null;
        String userId = null;
        String userName = null;
        
        try {
            tenantId = UserContext.tenantId();
            userId = UserContext.userId();
            userName = UserContext.username();
        } catch (Exception e) {
            // 无用户上下文（如公开接口）
        }
        
        // 获取客户端IP
        String ipAddress = getClientIp(request);
        
        // 记录访问日志
        String method = request.getMethod();
        String path = request.getRequestURI();
        String queryString = request.getQueryString();
        
        log.info("[Audit] {} {} {} - tenant={}, user={}, ip={}", 
                method, path, 
                queryString != null ? "?" + queryString : "",
                tenantId, userId, ipAddress);
        
        return true;
    }

    @Override
    public void postHandle(HttpServletRequest request, HttpServletResponse response, 
                          Object handler, ModelAndView modelAndView) {
        // 无需处理
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                               Object handler, Exception ex) {
        // 跳过 ERROR dispatch 的后续处理（preHandle 已跳过，afterCompletion 也保持一致）
        if (ERROR_PATH.equals(request.getRequestURI())) {
            return;
        }

        // 计算耗时
        Long startTime = (Long) request.getAttribute(START_TIME_KEY);
        long duration = startTime != null ? System.currentTimeMillis() - startTime : 0;

        // 获取响应状态
        int status = response.getStatus();
        
        // 记录慢请求警告
        if (duration > 5000) {
            log.warn("[Audit] 慢请求警告: {} {} - 耗时: {}ms, 状态: {}", 
                    request.getMethod(), request.getRequestURI(), duration, status);
        }
        
        // 记录错误
        if (ex != null) {
            log.error("[Audit] 请求异常: {} {} - 耗时: {}ms, 异常: {}", 
                    request.getMethod(), request.getRequestURI(), duration, ex.getMessage());
        }
        
        // 清理请求属性
        request.removeAttribute(START_TIME_KEY);
    }

    /**
     * 获取客户端真实IP
     */
    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("WL-Proxy-Client-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("HTTP_CLIENT_IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("HTTP_X_FORWARDED_FOR");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        
        // 如果是多个IP，取第一个
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        
        return ip;
    }
}
