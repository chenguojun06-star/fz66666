package com.fashion.supplychain.common.aop;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.helper.OperationLogTargetNameResolver;
import com.fashion.supplychain.system.service.OperationLogService;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Set;

/**
 * 系统操作日志切面（P2#10 拆分后）
 * 事务边界：无（仅记录日志，不涉及业务事务）
 *
 * 拆分原则（不影响数据链路）：
 *   - 实体快照查询 → OperationLogSnapshotHelper
 *   - 变更摘要/详情构建 → OperationLogChangeSummaryHelper
 *   - Aspect 只保留切面逻辑 + URI/参数解析 + 日志保存
 *
 * 符合 P0 铁律 #2：@Transactional 只在 Orchestrator 层（Aspect 不涉及业务事务）
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class SystemOperationLogAspect {

    @Resource
    private final OperationLogService operationLogService;

    private final StyleInfoService styleInfoService;

    private final ProductionOrderService productionOrderService;

    private final MaterialPurchaseService materialPurchaseService;

    private final MaterialPickingService materialPickingService;

    private final CuttingTaskService cuttingTaskService;

    private final CuttingBundleService cuttingBundleService;

    private final OperationLogTargetNameResolver operationLogTargetNameResolver;

    private final OperationLogSnapshotHelper snapshotHelper;

    private final OperationLogChangeSummaryHelper changeSummaryHelper;

    /**
     * 只记录「有溯源价值」的操作：修改/删除/报废/关单/驳回/撤销/审批等异常/破坏性事件。
     * 刻意排除：新增/开始/完工/提交审批/确认/状态变更/领料（正常流程无溯源必要）
     * 保留：入库/出库/结算（有财务意义需可追溯）
     */
    private static final Set<String> LOGGED_OPERATIONS = Set.of(
        "修改", "删除", "报废", "转移", "删除扫码链",
        "关单", "驳回", "撤销", "审批通过", "审批",
        "入库", "物料入库", "出库", "结算"
    );

    private static final Set<String> SENSITIVE_FIELDS = Set.of(
        "password", "newPassword", "oldPassword", "confirmPassword",
        "secret", "appSecret", "privateKey", "accessToken", "refreshToken"
    );

    /** 跳过列表：系统配置类接口，不是业务操作，不记录 */
    private static final String[] SKIP_PREFIXES = {
        "/api/system/dict", "/api/system/permission", "/api/system/role",
        "/api/system/user", "/api/system/tenant", "/api/system/serial",
        "/api/system/app-store", "/api/system/operation-log", "/api/system/login-log",
        "/api/system/menu", "/api/auth/", "/api/internal/", "/api/dashboard/",
        "/api/datacenter/", "/api/wechat/", "/api/template/operation-log",
    };

    @Pointcut("within(com.fashion.supplychain..controller..*) && (@annotation(org.springframework.web.bind.annotation.PostMapping) || @annotation(org.springframework.web.bind.annotation.PutMapping) || @annotation(org.springframework.web.bind.annotation.DeleteMapping))")
    public void writeEndpoints() {}

    @Around("writeEndpoints()")
    public Object around(ProceedingJoinPoint pjp) throws Throwable {
        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        HttpServletRequest request = attrs == null ? null : attrs.getRequest();
        String method = request == null ? "" : request.getMethod().toUpperCase();
        String uri    = request == null ? "" : request.getRequestURI().toLowerCase();

        if (shouldSkip(uri)) {
            return pjp.proceed();
        }

        String operation = resolveOperationByUri(uri, method, request);
        if (!LOGGED_OPERATIONS.contains(operation)) {
            return pjp.proceed();
        }

        String module     = resolveModule(uri);
        String targetType = resolveTargetType(uri);
        String targetId   = resolveTargetId(pjp.getArgs());
        String prefetchedTargetName = resolveTargetName(pjp.getArgs());
        if (prefetchedTargetName == null) {
            prefetchedTargetName = resolveEntityNameFromUri(uri, pjp.getArgs(), targetId);
        }
        if (prefetchedTargetName == null && operationLogTargetNameResolver != null) {
            prefetchedTargetName = operationLogTargetNameResolver.resolveByTarget(targetType, targetId);
        }

        String operatorName = resolveOperator();
        String ip           = request == null ? null : request.getRemoteAddr();
        String reason       = extractReason(pjp.getArgs());
        String details      = changeSummaryHelper.buildDetails(method, pjp.getArgs(), request, SENSITIVE_FIELDS);
        LocalDateTime now   = LocalDateTime.now();

        // 修改操作：执行前查询旧值快照
        Map<String, String> oldSnapshot = null;
        if ("修改".equals(operation) && targetType != null && targetId != null) {
            oldSnapshot = snapshotHelper.queryEntitySnapshot(targetType, targetId);
        }

        try {
            Object result = pjp.proceed();

            // 修改操作：执行后查询新值，生成变更摘要
            String changeSummary = null;
            if ("修改".equals(operation) && oldSnapshot != null) {
                Map<String, String> newSnapshot = snapshotHelper.queryEntitySnapshot(targetType, targetId);
                changeSummary = changeSummaryHelper.buildChangeSummary(oldSnapshot, newSnapshot, SENSITIVE_FIELDS);
            }
            String targetName = extractTargetNameFromResult(result);
            if (targetName == null) targetName = prefetchedTargetName;

            OperationLog log = new OperationLog();
            log.setModule(module);
            log.setOperation(operation);
            log.setOperatorName(operatorName);
            log.setTargetType(targetType);
            log.setTargetId(limitLength(targetId, 100));
            log.setTargetName(limitLength(targetName, 200));
            log.setReason(limitLength(reason, 500));
            log.setDetails(details);
            log.setChangeSummary(limitLength(changeSummary, 2000));
            log.setIp(ip);
            log.setOperationTime(now);
            log.setStatus("success");
            operationLogService.save(log);
            return result;
        } catch (Throwable e) {
            String targetName = prefetchedTargetName;
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

    // ─── URI/参数解析（Aspect 内部逻辑，不抽出）────────────────────────────

    private boolean shouldSkip(String uri) {
        for (String prefix : SKIP_PREFIXES) {
            if (uri.startsWith(prefix)) return true;
        }
        return false;
    }

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
        if (u.contains("/pattern-revision") || u.contains("/pattern-production") || u.contains("/sample-production")) return "样衣开发";
        if (u.contains("/style"))             return "样衣开发";
        if (u.contains("/production/order") || u.contains("/production/orders") || u.contains("/production/cutting") || u.contains("/production/scan") || u.contains("/production/warehousing")) return "大货生产";
        if (u.contains("/material-purchase") || u.contains("/material-inbound") || u.contains("/material-picking") || u.contains("/material-roll")) return "大货生产";
        if (u.contains("/production"))        return "大货生产";
        if (u.contains("/warehouse/finished") || u.contains("/product-outstock") || u.contains("/product-warehousing")) return "仓库管理";
        if (u.contains("/warehouse"))         return "仓库管理";
        if (u.contains("/finance"))           return "财务管理";
        if (u.contains("/order-management"))  return "下单管理";
        if (u.contains("/system/factory") || u.contains("/system/process")) return "基础设置";
        if (u.contains("/template"))          return "模板库";
        return "其他";
    }

    private String resolveTargetType(String uri) {
        if (uri == null) return null;
        String u = uri.toLowerCase();
        if (u.contains("/material-purchase") || u.contains("/cancel-receive")) return "采购单";
        if (u.contains("/material-picking")  || u.contains("/cancel-picking") || u.contains("/picking")) return "领料单";
        if (u.contains("/material-inbound")  || u.contains("/inbound"))       return "物料入库单";
        if (u.contains("/cutting-bundle")    || u.contains("/bundle"))        return "菲号";
        if (u.contains("/cutting"))   return "裁剪单";
        if (u.contains("/scan"))      return "扫码记录";
        if (u.contains("/warehousing")) return "入库单";
        if (u.contains("/outstock"))  return "出货单";
        if (u.contains("/order") || u.contains("/orders"))     return "订单";
        if (u.contains("/warehouse")) return "仓库单";
        if (u.contains("/style"))     return "款式";
        if (u.contains("/material"))  return "物料";
        if (u.contains("/purchase"))  return "采购单";
        if (u.contains("/factory"))   return "加工厂";
        if (u.contains("/finance"))   return "财务单";
        if (u.contains("/template"))  return "模板";
        if (u.contains("/pattern"))   return "纸样/样衣";
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
            } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
        }
        return null;
    }

    private Object pickIdFromMap(Map<?, ?> map) {
        if (map == null || map.isEmpty()) return null;
        String[] keys = new String[]{
            "id","orderId","styleId","templateId","factoryId","userId",
            "purchaseId","pickingId","cuttingBundleId","cuttingTaskId","warehouseId","inboundId",
            "orderNo","purchaseNo","pickingNo","bundleNo","cuttingNo"
        };
        for (String k : keys) {
            if (map.containsKey(k)) {
                Object v = map.get(k);
                if (v != null) return v;
            }
        }
        return null;
    }

    private Object pickIdByGetter(Object obj) throws Exception {
        String[] keys = new String[]{
            "getId","getOrderId","getStyleId","getTemplateId","getFactoryId","getUserId",
            "getPurchaseId","getPickingId","getCuttingBundleId","getCuttingTaskId",
            "getOrderNo","getPurchaseNo","getPickingNo","getBundleNo","getCuttingNo"
        };
        Class<?> c = obj.getClass();
        for (String k : keys) {
            try {
                var m = c.getMethod(k);
                Object v = m.invoke(obj);
                if (v != null) return v;
            } catch (NoSuchMethodException e) { log.debug("方法不存在: {}", e.getMessage()); }
        }
        return null;
    }

    /**
     * 从请求参数解析目标名称（订单号+款号合并显示）
     */
    private String resolveTargetName(Object[] args) {
        if (args == null || args.length == 0) return null;
        for (Object arg : args) {
            if (arg == null) continue;
            if (arg instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> map = (Map<String, Object>) arg;
                String orderNo = mapStr(map, "orderNo");
                String styleNo = mapStr(map, "styleNo");
                if (orderNo != null && styleNo != null) return orderNo + " (" + styleNo + ")";
                if (orderNo != null) return orderNo;
                for (String key : new String[]{
                        "purchaseNo","pickingNo","cuttingBundleNo","bundleNo",
                        "warehouseOrderNo","cuttingNo","materialName","name","code"}) {
                    String v = mapStr(map, key);
                    if (v != null) return v;
                }
                if (styleNo != null) return styleNo;
            } else if (!(arg instanceof String) && !(arg instanceof Number) && !(arg instanceof Boolean)) {
                String orderNo = reflStr(arg, "getOrderNo");
                String styleNo = reflStr(arg, "getStyleNo");
                if (orderNo != null && styleNo != null) return orderNo + " (" + styleNo + ")";
                if (orderNo != null) return orderNo;
                for (String getter : new String[]{
                        "getPurchaseNo","getPickingNo","getCuttingBundleNo",
                        "getBundleNo","getWarehouseOrderNo","getCuttingNo","getMaterialName",
                        "getName","getCode"}) {
                    String v = reflStr(arg, getter);
                    if (v != null) return v;
                }
                if (styleNo != null) return styleNo;
            }
        }
        return null;
    }

    private String extractTargetNameFromResult(Object result) {
        if (result == null) return null;
        try {
            java.lang.reflect.Method getDataMethod = result.getClass().getMethod("getData");
            Object data = getDataMethod.invoke(result);
            if (data == null) return null;
            if (data instanceof Map) {
                Map<?,?> m = (Map<?,?>) data;
                String orderNo = mapStrObj(m, "orderNo");
                String styleNo = mapStrObj(m, "styleNo");
                if (orderNo != null && styleNo != null) return orderNo + " (" + styleNo + ")";
                if (orderNo != null) return orderNo;
                for (String key : new String[]{"purchaseNo","cuttingBundleNo","bundleNo",
                        "pickingNo","warehouseOrderNo","materialName","name","code"}) {
                    String v = mapStrObj(m, key);
                    if (v != null) return v;
                }
                return styleNo;
            }
            String orderNo = reflStr(data, "getOrderNo");
            String styleNo = reflStr(data, "getStyleNo");
            if (orderNo != null && styleNo != null) return orderNo + " (" + styleNo + ")";
            if (orderNo != null) return orderNo;
            for (String g : new String[]{
                    "getPurchaseNo","getPickingNo","getCuttingBundleNo",
                    "getBundleNo","getWarehouseOrderNo","getCuttingNo","getMaterialName",
                    "getName","getCode"}) {
                String v = reflStr(data, g);
                if (v != null) return v;
            }
            return styleNo;
        } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
        return null;
    }

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
                try { Object v = arg.getClass().getMethod("getRemark").invoke(arg); if (v != null) return String.valueOf(v); } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
                try { Object v = arg.getClass().getMethod("getReason").invoke(arg); if (v != null) return String.valueOf(v); } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
            }
        }
        return null;
    }

    /**
     * fallback：用 ID 查库获取实体名称（款式/订单/采购单/出库单/菲号）
     */
    private String resolveEntityNameFromUri(String uri, Object[] args, String resolvedTargetId) {
        if (uri == null) return null;
        String entityId = resolvedTargetId != null ? resolvedTargetId : extractEntityId(args);
        String orderNo    = extractFieldFromArgs(args, "orderNo");
        String purchaseId = extractFieldFromArgs(args, "purchaseId");
        String purchaseNo = extractFieldFromArgs(args, "purchaseNo");
        String pickingId  = extractFieldFromArgs(args, "pickingId");
        String pickingNo  = extractFieldFromArgs(args, "pickingNo");
        String bundleId   = extractFieldFromArgs(args, "cuttingBundleId");
        try {
            if (uri.contains("/style/") || uri.contains("/pattern")) {
                if (styleInfoService != null && entityId != null) {
                    var style = styleInfoService.getById(entityId);
                    if (style != null) return style.getStyleNo();
                }
            }
            if (uri.contains("/production/order") || uri.contains("/production/orders") || uri.contains("/production/cutting-task")) {
                if (productionOrderService != null) {
                    var order = org.springframework.util.StringUtils.hasText(orderNo)
                            ? productionOrderService.getByOrderNo(orderNo)
                            : (entityId == null ? null : productionOrderService.getById(entityId));
                    if (order != null) {
                        String on = order.getOrderNo(), sn = order.getStyleNo();
                        return (on != null && sn != null) ? on + " (" + sn + ")" : (on != null ? on : sn);
                    }
                }
            }
            if (uri.contains("/material-purchase") || uri.contains("/purchase")) {
                if (materialPurchaseService != null) {
                    String id = purchaseId != null ? purchaseId : entityId;
                    var p = org.springframework.util.StringUtils.hasText(purchaseNo)
                            ? materialPurchaseService.lambdaQuery().eq(MaterialPurchase::getPurchaseNo, purchaseNo).last("LIMIT 1").one()
                            : (id == null ? null : materialPurchaseService.getById(id));
                    if (p != null) {
                        String pno = p.getPurchaseNo();
                        String mn  = p.getMaterialName();
                        return pno != null ? pno + (mn != null ? " [" + mn + "]" : "") : mn;
                    }
                }
            }
            if (uri.contains("/picking") || uri.contains("/cancel-picking")) {
                if (materialPickingService != null) {
                    String id = pickingId != null ? pickingId : entityId;
                    var pk = org.springframework.util.StringUtils.hasText(pickingNo)
                            ? materialPickingService.lambdaQuery().eq(MaterialPicking::getPickingNo, pickingNo).last("LIMIT 1").one()
                            : (id == null ? null : materialPickingService.getById(id));
                    if (pk != null) {
                        try { return String.valueOf(pk.getClass().getMethod("getPickingNo").invoke(pk)); } catch (Exception ignr) { log.debug("[操作日志] 提取领料单号失败"); }
                    }
                }
            }
            if (uri.contains("/cutting-bundle") || uri.contains("/bundle")) {
                if (cuttingBundleService != null) {
                    String id = bundleId != null ? bundleId : entityId;
                    if (id != null) {
                        var b = cuttingBundleService.getById(id);
                        if (b != null) {
                            try { return String.valueOf(b.getClass().getMethod("getBundleNo").invoke(b)); } catch (Exception ignr) { log.debug("[操作日志] 提取菲号失败"); }
                        }
                    }
                }
            }
            if (uri.contains("/cutting") && entityId != null) {
                if (cuttingTaskService != null) {
                    var ct = cuttingTaskService.getById(entityId);
                    if (ct != null) {
                        try { return String.valueOf(ct.getClass().getMethod("getOrderNo").invoke(ct)); } catch (Exception ignr) { log.debug("[操作日志] 提取裁剪任务单号失败"); }
                    }
                }
            }
        } catch (Exception e) {
            log.debug("[操作日志] 业务编号提取失败: {}", e.getMessage());
        }
        return null;
    }

    private String extractFieldFromArgs(Object[] args, String fieldName) {
        if (args == null) return null;
        for (Object a : args) {
            if (a instanceof Map) {
                Object v = ((Map<?,?>) a).get(fieldName);
                if (v != null) { String s = String.valueOf(v).trim(); if (!s.isEmpty() && !"null".equals(s)) return s; }
            } else if (a != null && !(a instanceof String) && !(a instanceof Number)) {
                String getter = "get" + fieldName.substring(0,1).toUpperCase() + fieldName.substring(1);
                try { Object v = a.getClass().getMethod(getter).invoke(a); if (v != null) { String s = String.valueOf(v).trim(); if (!s.isEmpty() && !"null".equals(s)) return s; } } catch (Exception ig) { log.debug("[操作日志] 提取字段{}失败", fieldName); }
            }
        }
        return null;
    }

    private String extractEntityId(Object[] args) {
        if (args == null) return null;
        for (Object a : args) {
            if (a instanceof Long) return String.valueOf(a);
        }
        for (Object a : args) {
            if (a == null || a instanceof String || a instanceof Number
                    || a instanceof Boolean || a instanceof Map) continue;
            try {
                Object id = a.getClass().getMethod("getId").invoke(a);
                if (id != null) {
                    String s = String.valueOf(id).trim();
                    if (!s.isEmpty()) return s;
                }
            } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
        }
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

    private String resolveOperator() {
        String v = UserContext.username();
        return v == null ? null : v.trim();
    }

    private static String mapStr(Map<?, ?> map, String key) {
        Object v = map.get(key);
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return (s.isEmpty() || "null".equals(s)) ? null : s;
    }

    private static String mapStrObj(Map<?,?> map, String key) {
        Object v = map.get(key);
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return (s.isEmpty() || "null".equals(s)) ? null : s;
    }

    private static String reflStr(Object obj, String getter) {
        try {
            Object v = obj.getClass().getMethod(getter).invoke(obj);
            if (v == null) return null;
            String s = String.valueOf(v).trim();
            return (s.isEmpty() || "null".equals(s)) ? null : s;
        } catch (Exception ignored) { log.debug("[OpLog] reflStr反射失败: getter={}", getter); return null; }
    }

    private static String limitLength(String value, int max) {
        if (value == null) return null;
        if (max <= 0 || value.length() <= max) return value;
        return value.substring(0, max);
    }
}
