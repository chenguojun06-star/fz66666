package com.fashion.supplychain.common.audit;

import com.fashion.supplychain.common.UserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;
import java.time.LocalDateTime;

/**
 * 审计日志切面
 * 拦截 @AuditLog 注解方法，异步记录操作日志到数据库
 * TODO: 待完成 OperationLog 实体统一后重新启用
 */
@Slf4j
@Aspect
// @Component  -- 暂时禁用，common.audit.OperationLog 与 system.entity.OperationLog 字段不兼容
@RequiredArgsConstructor
public class AuditLogAspect {

    private final OperationLogMapper operationLogMapper;
    private final ObjectMapper objectMapper;

    @Around("@annotation(auditLog)")
    public Object around(ProceedingJoinPoint point, AuditLog auditLog) throws Throwable {
        long startTime = System.currentTimeMillis();
        OperationLog opLog = new OperationLog();
        opLog.setModule(auditLog.module());
        opLog.setAction(auditLog.action());
        opLog.setOperationTime(LocalDateTime.now());

        // 用户信息
        UserContext ctx = UserContext.get();
        if (ctx != null) {
            opLog.setUserId(ctx.getUserId());
            opLog.setUsername(ctx.getUsername());
        }

        // 请求信息
        try {
            ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs != null) {
                HttpServletRequest request = attrs.getRequest();
                opLog.setRequestUrl(request.getRequestURI());
                opLog.setMethod(request.getMethod());
                opLog.setClientIp(getClientIp(request));
            }
        } catch (Exception e) {
            log.debug("Failed to get request info for audit log", e);
        }

        // 记录请求参数
        if (auditLog.recordParams()) {
            try {
                Object[] args = point.getArgs();
                if (args != null && args.length > 0) {
                    String params = objectMapper.writeValueAsString(args);
                    // 截断过长参数（防止字段溢出）
                    opLog.setRequestParams(truncate(params, 2000));
                }
            } catch (Exception e) {
                log.debug("Failed to serialize audit log params", e);
            }
        }

        Object result = null;
        try {
            result = point.proceed();
            opLog.setStatus("success");

            // 记录返回结果
            if (auditLog.recordResult() && result != null) {
                try {
                    String resultStr = objectMapper.writeValueAsString(result);
                    opLog.setResponseResult(truncate(resultStr, 2000));
                } catch (Exception e) {
                    log.debug("Failed to serialize audit log result", e);
                }
            }

            return result;
        } catch (Throwable ex) {
            opLog.setStatus("error");
            opLog.setErrorMessage(truncate(ex.getMessage(), 500));
            throw ex;
        } finally {
            opLog.setDuration(System.currentTimeMillis() - startTime);
            saveLogAsync(opLog);
        }
    }

    /**
     * 异步保存日志（不影响主业务性能）
     */
    @Async("taskExecutor")
    public void saveLogAsync(OperationLog opLog) {
        try {
            operationLogMapper.insert(opLog);
        } catch (Exception e) {
            log.error("Failed to save audit log: module={}, action={}", opLog.getModule(), opLog.getAction(), e);
        }
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        // 多代理时取第一个
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }

    private String truncate(String str, int maxLength) {
        if (str == null) return null;
        return str.length() > maxLength ? str.substring(0, maxLength) + "..." : str;
    }
}
