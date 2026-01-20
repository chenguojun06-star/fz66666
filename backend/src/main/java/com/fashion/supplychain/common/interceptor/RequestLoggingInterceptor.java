package com.fashion.supplychain.common.interceptor;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.lang.NonNull;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.ModelAndView;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 请求日志拦截器，记录请求详细信息
 */
@Component
public class RequestLoggingInterceptor implements HandlerInterceptor {

    private static final Logger logger = LoggerFactory.getLogger(RequestLoggingInterceptor.class);
    private static final String START_TIME_KEY = "requestStartTime";
    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS");

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
            @NonNull Object handler) throws Exception {
        // 记录请求开始时间
        long startTime = System.currentTimeMillis();
        request.setAttribute(START_TIME_KEY, startTime);

        // 记录请求信息
        logger.info("Request received: {} {}, IP: {}, User-Agent: {}", 
                request.getMethod(), 
                request.getRequestURI(), 
                request.getRemoteAddr(),
                request.getHeader("User-Agent"));

        return true;
    }

    @Override
    public void postHandle(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
            @NonNull Object handler, @Nullable ModelAndView modelAndView) throws Exception {
        // 可以在这里添加处理后的日志，如需要
    }

    @Override
    public void afterCompletion(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
            @NonNull Object handler, @Nullable Exception ex) throws Exception {
        // 计算响应时间
        long startTime = (long) request.getAttribute(START_TIME_KEY);
        long endTime = System.currentTimeMillis();
        long duration = endTime - startTime;

        // 记录响应信息
        logger.info("Request completed: {} {}, Status: {}, Duration: {}ms, ResponseTime: {}", 
                request.getMethod(), 
                request.getRequestURI(), 
                response.getStatus(), 
                duration,
                LocalDateTime.now().format(DATE_TIME_FORMATTER));

        // 清理MDC中的requestId（如果有的话）
        MDC.remove("requestId");
    }
}
