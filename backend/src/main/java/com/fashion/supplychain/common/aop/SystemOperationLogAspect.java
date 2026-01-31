package com.fashion.supplychain.common.aop;

import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.service.OperationLogService;
import com.fashion.supplychain.common.UserContext;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.HashMap;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import javax.servlet.http.HttpServletRequest;
import javax.annotation.Resource;

@Aspect
@Component
public class SystemOperationLogAspect {

    @Resource
    private OperationLogService operationLogService;

    @Pointcut("within(com.fashion.supplychain..controller..*) && (@annotation(org.springframework.web.bind.annotation.PostMapping) || @annotation(org.springframework.web.bind.annotation.PutMapping) || @annotation(org.springframework.web.bind.annotation.DeleteMapping))")
    public void writeEndpoints() {}

    @Around("writeEndpoints()")
    public Object around(ProceedingJoinPoint pjp) throws Throwable {
        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        HttpServletRequest request = attrs == null ? null : attrs.getRequest();
        String method = request == null ? null : request.getMethod();
        String uri = request == null ? null : request.getRequestURI();
        String module = resolveModule(uri);
        String targetType = resolveTargetType(uri);
        String operation = resolveOperation(method);
        String operatorName = resolveOperator();
        String ip = request == null ? null : request.getRemoteAddr();
        String userAgent = request == null ? null : request.getHeader("User-Agent");
        String targetId = resolveTargetId(pjp.getArgs());
        LocalDateTime now = LocalDateTime.now();
        try {
            Object result = pjp.proceed();
            OperationLog log = new OperationLog();
            log.setModule(module);
            log.setOperation(operation);
            log.setOperatorName(operatorName);
            log.setTargetType(targetType);
            log.setTargetId(targetId);
            log.setIp(ip);
            log.setUserAgent(userAgent);
            log.setOperationTime(now);
            log.setStatus("success");
            operationLogService.save(log);
            return result;
        } catch (Throwable e) {
            OperationLog log = new OperationLog();
            log.setModule(module);
            log.setOperation(operation);
            log.setOperatorName(operatorName);
            log.setTargetType(targetType);
            log.setTargetId(targetId);
            log.setIp(ip);
            log.setUserAgent(userAgent);
            log.setOperationTime(now);
            log.setStatus("failure");
            String msg = e.getMessage();
            log.setErrorMessage(msg == null ? null : msg);
            operationLogService.save(log);
            throw e;
        }
    }

    private String resolveOperator() {
        String v = UserContext.username();
        return v == null ? null : v.trim();
    }

    private String resolveOperation(String method) {
        if (method == null) return null;
        String m = method.trim().toUpperCase();
        if ("POST".equals(m)) return "新增";
        if ("PUT".equals(m)) return "修改";
        if ("DELETE".equals(m)) return "删除";
        return m;
    }

    private String resolveModule(String uri) {
        String u = uri == null ? null : uri.trim().toLowerCase();
        if (u == null || u.isEmpty()) return "系统设置";
        if (u.contains("/production")) return "大货生产";
        if (u.contains("/style")) return "样衣开发";
        if (u.contains("/material") || u.contains("/purchase")) return "物料采购";
        if (u.contains("/warehouse")) return "仓库管理";
        if (u.contains("/finance")) return "财务管理";
        return "系统设置";
    }

    private String resolveTargetType(String uri) {
        String u = uri == null ? null : uri.trim().toLowerCase();
        if (u == null || u.isEmpty()) return null;
        if (u.contains("/order")) return "订单";
        if (u.contains("/user")) return "用户";
        if (u.contains("/role")) return "角色";
        if (u.contains("/factory")) return "加工厂";
        if (u.contains("/style")) return "款式";
        if (u.contains("/material")) return "物料";
        if (u.contains("/template")) return "模板";
        return null;
    }

    private String resolveTargetId(Object[] args) {
        if (args == null || args.length == 0) return null;
        for (Object a : args) {
            if (a == null) continue;
            if (a instanceof String) {
                String s = ((String) a).trim();
                if (!s.isEmpty()) return s;
            }
            if (a instanceof Map) {
                Object id = pickIdFromMap((Map<?, ?>) a);
                if (id != null) return String.valueOf(id);
            }
            try {
                Object id = pickIdByGetter(a);
                if (id != null) return String.valueOf(id);
            } catch (Exception ignored) {}
        }
        return null;
    }

    private Object pickIdFromMap(Map<?, ?> map) {
        if (map == null || map.isEmpty()) return null;
        String[] keys = new String[]{"id","orderId","styleId","templateId","factoryId","userId"};
        for (String k : keys) {
            if (map.containsKey(k)) {
                Object v = map.get(k);
                if (v != null) return v;
            }
        }
        return null;
    }

    private Object pickIdByGetter(Object obj) throws Exception {
        String[] keys = new String[]{"getId","getOrderId","getStyleId","getTemplateId","getFactoryId","getUserId"};
        Class<?> c = obj.getClass();
        for (String k : keys) {
            try {
                var m = c.getMethod(k);
                Object v = m.invoke(obj);
                if (v != null) return v;
            } catch (NoSuchMethodException ignore) {}
        }
        return null;
    }
}
