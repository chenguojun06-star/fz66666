package com.fashion.supplychain.common.aop;

import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.service.OperationLogService;
import com.fashion.supplychain.common.UserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.HashMap;
import java.util.LinkedHashMap;
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

    private static final ObjectMapper objectMapper = new ObjectMapper();

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
        String userAgent = limitLength(request == null ? null : request.getHeader("User-Agent"), 200);
        String targetId = resolveTargetId(pjp.getArgs());
        String targetName = resolveTargetName(pjp.getArgs());
        String details = buildDetails(method, pjp.getArgs());
        LocalDateTime now = LocalDateTime.now();
        try {
            Object result = pjp.proceed();
            OperationLog log = new OperationLog();
            log.setModule(module);
            log.setOperation(operation);
            log.setOperatorName(operatorName);
            log.setTargetType(targetType);
            log.setTargetId(targetId);
            log.setTargetName(targetName);
            log.setDetails(details);
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
            log.setTargetName(targetName);
            log.setDetails(details);
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

    /**
     * 构建详细操作信息（记录修改内容）
     */
    private String buildDetails(String method, Object[] args) {
        if (args == null || args.length == 0) {
            return null;
        }

        try {
            Map<String, Object> detailMap = new LinkedHashMap<>();

            // PUT/DELETE 记录详细变更
            if ("PUT".equalsIgnoreCase(method) || "DELETE".equalsIgnoreCase(method)) {
                for (Object arg : args) {
                    if (arg == null) continue;

                    // 跳过基础类型
                    if (arg instanceof String || arg instanceof Number || arg instanceof Boolean) {
                        continue;
                    }

                    // 记录实体对象的关键字段
                    if (arg instanceof Map) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> map = (Map<String, Object>) arg;
                        extractKeyFields(detailMap, map);
                    } else {
                        // 使用反射提取对象字段
                        extractObjectFields(detailMap, arg);
                    }
                }
            }

            // POST 只记录关键标识
            else if ("POST".equalsIgnoreCase(method)) {
                for (Object arg : args) {
                    if (arg == null) continue;
                    if (arg instanceof Map) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> map = (Map<String, Object>) arg;
                        String[] keyFields = {"id", "orderNo", "styleNo", "name", "code"};
                        for (String key : keyFields) {
                            if (map.containsKey(key)) {
                                detailMap.put(key, map.get(key));
                            }
                        }
                    }
                }
            }

            if (detailMap.isEmpty()) {
                return null;
            }

            return objectMapper.writeValueAsString(detailMap);
        } catch (Exception e) {
            return null; // 构建失败不影响主流程
        }
    }

    /**
     * 从 Map 中提取关键字段
     */
    private void extractKeyFields(Map<String, Object> detailMap, Map<String, Object> source) {
        // 关键字段列表（优先记录）
        String[] importantFields = {
            "id", "orderNo", "styleNo", "name", "code", "status",
            "price", "unitPrice", "quantity", "amount", "totalAmount",
            "oldPrice", "newPrice", "oldStatus", "newStatus",
            "reason", "remark", "approvalStatus"
        };

        for (String field : importantFields) {
            if (source.containsKey(field)) {
                Object value = source.get(field);
                if (value != null) {
                    detailMap.put(field, value);
                }
            }
        }
    }

    /**
     * 从对象中提取字段
     */
    private void extractObjectFields(Map<String, Object> detailMap, Object obj) {
        try {
            String[] getterNames = {
                "getId", "getOrderNo", "getStyleNo", "getName", "getCode",
                "getPrice", "getUnitPrice", "getQuantity", "getAmount",
                "getOldPrice", "getNewPrice", "getStatus", "getReason", "getRemark"
            };

            Class<?> clazz = obj.getClass();
            for (String methodName : getterNames) {
                try {
                    var method = clazz.getMethod(methodName);
                    Object value = method.invoke(obj);
                    if (value != null) {
                        String fieldName = methodName.substring(3, 4).toLowerCase() + methodName.substring(4);
                        detailMap.put(fieldName, value);
                    }
                } catch (NoSuchMethodException ignored) {
                    // 方法不存在，跳过
                }
            }
        } catch (Exception ignored) {
            // 反射失败不影响主流程
        }
    }

    /**
     * 解析目标名称
     */
    private String resolveTargetName(Object[] args) {
        if (args == null || args.length == 0) {
            return null;
        }

        for (Object arg : args) {
            if (arg == null) continue;

            if (arg instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> map = (Map<String, Object>) arg;
                Object name = map.get("name");
                if (name != null) {
                    return String.valueOf(name);
                }
                Object orderNo = map.get("orderNo");
                if (orderNo != null) {
                    return String.valueOf(orderNo);
                }
                Object styleNo = map.get("styleNo");
                if (styleNo != null) {
                    return String.valueOf(styleNo);
                }
            } else {
                try {
                    var method = arg.getClass().getMethod("getName");
                    Object name = method.invoke(arg);
                    if (name != null) {
                        return String.valueOf(name);
                    }
                } catch (Exception ignored) {
                }
            }
        }

        return null;
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

    private static String limitLength(String value, int max) {
        if (value == null) {
            return null;
        }
        if (max <= 0 || value.length() <= max) {
            return value;
        }
        return value.substring(0, max);
    }
}

