package com.fashion.supplychain.common.aop;

import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.service.OperationLogService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.springframework.beans.factory.annotation.Autowired;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
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

    @Autowired(required = false)
    private StyleInfoService styleInfoService;

    @Autowired(required = false)
    private ProductionOrderService productionOrderService;

    private static final ObjectMapper objectMapper = new ObjectMapper();

    /** 只记录异常/重要操作，正常业务流转不记录 */
    private static final Set<String> LOGGED_OPERATIONS = Set.of(
        "报废", "修改", "转移", "删除", "关单", "驳回", "撤销", "删除扫码链"
    );

    /** 跳过列表：系统配置类接口，不是业务操作，不记录 */
    private static final String[] SKIP_PREFIXES = {
        "/api/system/dict",
        "/api/system/permission",
        "/api/system/role",
        "/api/system/user",
        "/api/system/tenant",
        "/api/system/serial",
        "/api/system/app-store",
        "/api/system/operation-log",
        "/api/system/login-log",
        "/api/system/menu",
        "/api/auth/",
        "/api/internal/",
        "/api/dashboard/",
        "/api/datacenter/",
        "/api/wechat/",
        "/api/template/operation-log",
    };

    @Pointcut("within(com.fashion.supplychain..controller..*) && (@annotation(org.springframework.web.bind.annotation.PostMapping) || @annotation(org.springframework.web.bind.annotation.PutMapping) || @annotation(org.springframework.web.bind.annotation.DeleteMapping))")
    public void writeEndpoints() {}

    @Around("writeEndpoints()")
    public Object around(ProceedingJoinPoint pjp) throws Throwable {
        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        HttpServletRequest request = attrs == null ? null : attrs.getRequest();
        String method = request == null ? "" : request.getMethod().toUpperCase();
        String uri    = request == null ? "" : request.getRequestURI().toLowerCase();

        // 非业务路径直接放行，不记录
        if (shouldSkip(uri)) {
            return pjp.proceed();
        }

        String operation    = resolveOperationByUri(uri, method, request);

        // 只记录异常/重要操作（报废、修改、转单、删除、关单、驳回、撤销），正常流转不记录
        if (!LOGGED_OPERATIONS.contains(operation)) {
            return pjp.proceed();
        }

        String module       = resolveModule(uri);
        String targetType   = resolveTargetType(uri);
        String operatorName = resolveOperator();
        String ip           = request == null ? null : request.getRemoteAddr();
        String reason       = extractReason(pjp.getArgs());
        String details      = buildDetails(method, pjp.getArgs());
        LocalDateTime now   = LocalDateTime.now();
        try {
            Object result = pjp.proceed();
            // 优先从返回值取 orderNo（关单/报废/更新都有完整对象返回）
            String targetName = extractTargetNameFromResult(result);
            if (targetName == null) targetName = resolveTargetName(pjp.getArgs());
            // fallback：stage-action 等返回 Boolean 时从数据库取实体名称
            if (targetName == null) targetName = resolveEntityNameFromUri(uri, pjp.getArgs());
            String targetId = resolveTargetId(pjp.getArgs());
            OperationLog log = new OperationLog();
            log.setModule(module);
            log.setOperation(operation);
            log.setOperatorName(operatorName);
            log.setTargetType(targetType);
            log.setTargetId(limitLength(targetId, 100));
            log.setTargetName(limitLength(targetName, 200));
            log.setReason(limitLength(reason, 500));
            log.setDetails(details);
            log.setIp(ip);
            log.setOperationTime(now);
            log.setStatus("success");
            operationLogService.save(log);
            return result;
        } catch (Throwable e) {
            String targetName = resolveTargetName(pjp.getArgs());
            if (targetName == null) targetName = resolveEntityNameFromUri(uri, pjp.getArgs());
            String targetId   = resolveTargetId(pjp.getArgs());
            OperationLog log = new OperationLog();
            log.setModule(module);
            log.setOperation(operation);
            log.setOperatorName(operatorName);
            log.setTargetType(targetType);
            log.setTargetId(limitLength(targetId, 100));
            log.setTargetName(limitLength(targetName, 200));
            log.setReason(limitLength(reason, 500));
            log.setDetails(details);
            log.setIp(ip);
            log.setOperationTime(now);
            log.setStatus("failure");
            String msg = e.getMessage();
            log.setErrorMessage(msg == null ? null : limitLength(msg, 200));
            operationLogService.save(log);
            throw e;
        }
    }

    private boolean shouldSkip(String uri) {
        for (String prefix : SKIP_PREFIXES) {
            if (uri.startsWith(prefix)) return true;
        }
        return false;
    }

    /** 从返回值中提取 orderNo（对关单/报废最有效，结果包含完整订单对象） */
    private String extractTargetNameFromResult(Object result) {
        if (result == null) return null;
        try {
            java.lang.reflect.Method getDataMethod = result.getClass().getMethod("getData");
            Object data = getDataMethod.invoke(result);
            if (data == null) return null;
            for (String g : new String[]{"getOrderNo","getCuttingBundleNo","getBundleNo","getPurchaseNo","getName","getStyleNo"}) {
                try {
                    Object v = data.getClass().getMethod(g).invoke(data);
                    if (v != null) return String.valueOf(v);
                } catch (NoSuchMethodException ignored) {}
            }
        } catch (Exception ignored) {}
        return null;
    }

    /** 从请求 body 的 remark / reason 字段提取操作原因 */
    private String extractReason(Object[] args) {
        if (args == null) return null;
        for (Object arg : args) {
            if (arg == null) continue;
            if (arg instanceof Map) {
                Object v = ((Map<?,?>) arg).get("remark");
                if (v != null) return String.valueOf(v);
                v = ((Map<?,?>) arg).get("reason");
                if (v != null) return String.valueOf(v);
            } else if (!(arg instanceof String) && !(arg instanceof Number)) {
                try { Object v = arg.getClass().getMethod("getRemark").invoke(arg); if (v != null) return String.valueOf(v); } catch (Exception ignored) {}
                try { Object v = arg.getClass().getMethod("getReason").invoke(arg); if (v != null) return String.valueOf(v); } catch (Exception ignored) {}
            }
        }
        return null;
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

    /** URI关键词精确映射操作类型，stage-action 读 action 查询参数 */
    private String resolveOperationByUri(String uri, String method, HttpServletRequest request) {
        if (uri.contains("/stage-action") && request != null) {
            String action = request.getParameter("action");
            if (action != null && !action.isBlank()) {
                switch (action.toLowerCase()) {
                    case "approve":  return "审批通过";
                    case "reject":   return "驳回";
                    case "submit":   return "提交审批";
                    case "close":    return "关单";
                    case "complete": return "完成";
                    case "cancel":   return "撤销";
                    case "confirm":  return "确认";
                    case "start":    return "开始";
                    case "finish":   return "完工";
                    case "scrap":    return "报废";
                    default:         return "状态变更→" + action;
                }
            }
        }
        if (uri.contains("/scrap"))                 return "报废";
        if (uri.contains("/close"))                 return "关单";
        if (uri.contains("/complete"))              return "完成生产";
        if (uri.contains("/delegate-process"))      return "委托工序";
        if (uri.contains("/sync-process-prices") || uri.contains("/sync-prices")) return "同步单价";
        if (uri.contains("/approve"))               return "审批";
        if (uri.contains("/reject"))                return "驳回";
        if (uri.contains("/submit"))                return "提交";
        if (uri.contains("/cancel"))                return "撤销";
        if (uri.contains("/transfer"))              return "转移";
        if (uri.contains("/delete-full-link"))       return "删除扫码链";
        if (uri.contains("/outstock"))              return "出库";
        if (uri.contains("/warehousing"))           return "入库";
        if (uri.contains("/inbound"))               return "物料入库";
        if (uri.contains("/picking"))               return "领料";
        if (uri.contains("/settle"))                return "结算";
        switch (method) {
            case "DELETE": return "删除";
            case "PUT":    return "修改";
            default:       return "新增";
        }
    }

    private String resolveModule(String uri) {
        if (uri == null || uri.isEmpty()) return "其他";
        String u = uri.toLowerCase();
        if (u.contains("/production"))        return "大货生产";
        if (u.contains("/order-management"))  return "下单管理";
        if (u.contains("/finance"))           return "财务管理";
        if (u.contains("/warehouse"))         return "仓库管理";
        if (u.contains("/style"))             return "样衣开发";
        if (u.contains("/material") || u.contains("/purchase")) return "物料采购";
        if (u.contains("/pattern-revision"))  return "样衣开发";
        if (u.contains("/system/factory"))    return "基础设置";
        if (u.contains("/template"))          return "模板库";
        return "其他";
    }

    private String resolveTargetType(String uri) {
        if (uri == null) return null;
        String u = uri.toLowerCase();
        if (u.contains("/order"))     return "订单";
        if (u.contains("/cutting"))   return "裁剪单";
        if (u.contains("/scan"))      return "扫码记录";
        if (u.contains("/warehouse")) return "仓库单";
        if (u.contains("/style"))     return "款式";
        if (u.contains("/material"))  return "物料";
        if (u.contains("/purchase"))  return "采购单";
        if (u.contains("/factory"))   return "加工厂";
        if (u.contains("/picking"))   return "领料单";
        if (u.contains("/outstock"))  return "出货单";
        if (u.contains("/finance"))   return "财务单";
        if (u.contains("/template"))  return "模板";
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

    /**
     * 当返回值无法提取名称时（如报废返回消息字符串），
     * 根据 URI 路径判断实体类型，用 args 中的 id 查库获取订单号+款号。
     * 支持 Long 和 String UUID 两种 ID 类型。
     * 样衣开发 → 款号；生产订单 → 订单号(款号)
     */
    private String resolveEntityNameFromUri(String uri, Object[] args) {
        if (uri == null) return null;
        String entityId = extractEntityId(args);
        if (entityId == null) return null;
        try {
            if (uri.contains("/style/")) {
                if (styleInfoService != null) {
                    var style = styleInfoService.getById(entityId);
                    return style != null ? style.getStyleNo() : null;
                }
            }
            if (uri.contains("/production/") || uri.contains("/cutting/")) {
                if (productionOrderService != null) {
                    var order = productionOrderService.getById(entityId);
                    if (order != null) {
                        String orderNo = order.getOrderNo();
                        String styleNo = order.getStyleNo();
                        if (orderNo != null && styleNo != null) return orderNo + " (" + styleNo + ")";
                        return orderNo != null ? orderNo : styleNo;
                    }
                }
            }
        } catch (Exception ignored) {
            // 查询失败不影响主流程
        }
        return null;
    }

    /**
     * 从方法参数中提取实体 ID（支持 Long 和 String UUID）。
     * 优先级：Long参数 → DTO对象的getId() → Map中的id字段
     */
    private String extractEntityId(Object[] args) {
        if (args == null) return null;
        // 1. 优先取 Long 类型参数（@PathVariable Long id）
        for (Object a : args) {
            if (a instanceof Long) return String.valueOf(a);
        }
        // 2. 从 DTO 对象中反射取 getId()（如 ScrapOrderRequest.getId()）
        for (Object a : args) {
            if (a == null || a instanceof String || a instanceof Number
                    || a instanceof Boolean || a instanceof Map) continue;
            try {
                Object id = a.getClass().getMethod("getId").invoke(a);
                if (id != null) {
                    String s = String.valueOf(id).trim();
                    if (!s.isEmpty()) return s;
                }
            } catch (Exception ignored) {}
        }
        // 3. 从 Map 参数中取 id 字段
        for (Object a : args) {
            if (a instanceof Map) {
                Object id = ((Map<?,?>) a).get("id");
                if (id != null) {
                    String s = String.valueOf(id).trim();
                    if (!s.isEmpty()) return s;
                }
            }
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

