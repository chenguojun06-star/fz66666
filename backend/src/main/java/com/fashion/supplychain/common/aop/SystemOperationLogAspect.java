package com.fashion.supplychain.common.aop;

import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.helper.OperationLogTargetNameResolver;
import com.fashion.supplychain.system.service.OperationLogService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.CuttingBundleService;
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
import org.springframework.web.servlet.HandlerMapping;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.annotation.Resource;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

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

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /**
     * 只记录「有溯源价值」的操作：修改/删除/报废/关单/驳回/撤销/审批等异常/破坏性事件。
     *
     * ★ 刻意排除：
     *   - 新增（正常创建流程，无溯源必要）
     *   - 开始 / 完成生产 / 完工（正常工序推进）
     *   - 提交审批（正常流转，审批结果才重要）
     *   - 确认（正常收货/验收动作）
     *   - 状态变更（太泛化，已被具体动作覆盖）
     *   - 领料（正常出库动作，频率高、噪音大）
     *
     * 保留的入库/出库/结算 = 有财务意义，需可追溯。
     */
    private static final Set<String> LOGGED_OPERATIONS = Set.of(
        // 数据变更（真正的破坏性/不可逆操作）
        "修改", "删除", "报废", "转移", "删除扫码链",
        // 异常状态流转（非正常路径）
        "关单", "驳回", "撤销", "审批通过", "审批",
        // 财务/仓储重要动作
        "入库", "物料入库", "出库", "结算"
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
        String targetId     = resolveTargetId(pjp.getArgs());
        String prefetchedTargetName = resolveTargetName(pjp.getArgs());
        if (prefetchedTargetName == null) {
            prefetchedTargetName = resolveEntityNameFromUri(uri, pjp.getArgs(), targetId);
        }
        if (prefetchedTargetName == null && operationLogTargetNameResolver != null) {
            prefetchedTargetName = operationLogTargetNameResolver.resolveByTarget(targetType, targetId);
        }

        // 纯 POST fallback 成"新增"但 URL 无法识别目标类型 → 非核心业务操作，跳过不记录（避免噪音日志）
        if ("新增".equals(operation) && (targetType == null || targetType.isBlank())) {
            return pjp.proceed();
        }

        String operatorName = resolveOperator();
        String ip           = request == null ? null : request.getRemoteAddr();
        String reason       = extractReason(pjp.getArgs());
        String details      = buildDetails(method, pjp.getArgs(), request);
        LocalDateTime now   = LocalDateTime.now();
        try {
            Object result = pjp.proceed();
            // 优先从返回值取 orderNo（关单/报废/更新都有完整对象返回）
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

    private boolean shouldSkip(String uri) {
        for (String prefix : SKIP_PREFIXES) {
            if (uri.startsWith(prefix)) return true;
        }
        return false;
    }

    /**
     * 从返回值提取目标名称。
     * ★ 当同时存在订单号和款号时，合并显示：订单号 (款号)
     * 支持：普通对象（getOrderNo等）+ Map类型返回（cancelReceive等返回 Map<String,Object>）
     */
    private String extractTargetNameFromResult(Object result) {
        if (result == null) return null;
        try {
            java.lang.reflect.Method getDataMethod = result.getClass().getMethod("getData");
            Object data = getDataMethod.invoke(result);
            if (data == null) return null;
            // 处理 Map 类型返回
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
            // 普通实体对象：订单号 + 款号 合并
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

    /** Map 取非空字符串（Object 版本，遍历用） */
    private static String mapStrObj(Map<?,?> map, String key) {
        Object v = map.get(key);
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return (s.isEmpty() || "null".equals(s)) ? null : s;
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
                try { Object v = arg.getClass().getMethod("getRemark").invoke(arg); if (v != null) return String.valueOf(v); } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
                try { Object v = arg.getClass().getMethod("getReason").invoke(arg); if (v != null) return String.valueOf(v); } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
            }
        }
        return null;
    }

    /**
     * 构建详细操作信息（记录修改内容）
     */
    private String buildDetails(String method, Object[] args, HttpServletRequest request) {
        if (args == null || args.length == 0) {
            return buildRequestDetails(request);
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
                        String[] keyFields = {
                            "id", "orderId", "styleId", "purchaseId", "pickingId", "cuttingBundleId",
                            "orderNo", "styleNo", "purchaseNo", "pickingNo", "bundleNo",
                            "name", "code", "materialName", "status", "expectedShipDate",
                            "reason", "remark", "remarks", "quantity"
                        };
                        for (String key : keyFields) {
                            if (map.containsKey(key)) {
                                Object value = map.get(key);
                                if (value != null) {
                                    detailMap.put(key, value);
                                }
                            }
                        }
                    }
                }
            }

            enrichDetailsFromRequest(detailMap, request);

            if (detailMap.isEmpty()) {
                return null;
            }

            return OBJECT_MAPPER.writeValueAsString(detailMap);
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
            "reason", "remark", "remarks", "approvalStatus", "expectedShipDate",
            "purchaseId", "purchaseNo", "pickingId", "pickingNo", "bundleNo",
            "orderId", "styleId", "materialName", "factoryName"
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
     * 从请求参数解析目标名称。
     * ★ 当同时存在订单号和款号时，合并显示：订单号 (款号)
     * 覆盖全业务类型：订单号、采购单号、出库单号、菲号、款号、物料名等。
     */
    private String resolveTargetName(Object[] args) {
        if (args == null || args.length == 0) return null;
        for (Object arg : args) {
            if (arg == null) continue;
            if (arg instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> map = (Map<String, Object>) arg;
                // 订单号 + 款号 合并显示
                String orderNo  = mapStr(map, "orderNo");
                String styleNo  = mapStr(map, "styleNo");
                if (orderNo != null && styleNo != null) return orderNo + " (" + styleNo + ")";
                if (orderNo != null) return orderNo;
                // 其余业务单号
                for (String key : new String[]{
                        "purchaseNo","pickingNo","cuttingBundleNo","bundleNo",
                        "warehouseOrderNo","cuttingNo","materialName","name","code"}) {
                    String v = mapStr(map, key);
                    if (v != null) return v;
                }
                // 款号兜底（单独的款式操作）
                if (styleNo != null) return styleNo;
            } else if (!(arg instanceof String) && !(arg instanceof Number) && !(arg instanceof Boolean)) {
                // 订单号 + 款号 合并显示
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

    /** 从 Map 取非空字符串；null 表示不存在或空 */
    private static String mapStr(Map<?, ?> map, String key) {
        Object v = map.get(key);
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return (s.isEmpty() || "null".equals(s)) ? null : s;
    }

    /** 反射调用 getter 取非空字符串；null 表示不存在或空 */
    private static String reflStr(Object obj, String getter) {
        try {
            Object v = obj.getClass().getMethod(getter).invoke(obj);
            if (v == null) return null;
            String s = String.valueOf(v).trim();
            return (s.isEmpty() || "null".equals(s)) ? null : s;
        } catch (Exception ignored) { return null; }
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
        // 样衣开发（优先于 /style）
        if (u.contains("/pattern-revision") || u.contains("/pattern-production") || u.contains("/sample-production")) return "样衣开发";
        if (u.contains("/style"))             return "样衣开发";
        // 大货生产（含裁剪、扫码、面料）
        if (u.contains("/production/order") || u.contains("/production/orders") || u.contains("/production/cutting") || u.contains("/production/scan") || u.contains("/production/warehousing")) return "大货生产";
        if (u.contains("/material-purchase") || u.contains("/material-inbound") || u.contains("/material-picking") || u.contains("/material-roll")) return "大货生产";
        if (u.contains("/production"))        return "大货生产";
        // 仓库管理
        if (u.contains("/warehouse/finished") || u.contains("/product-outstock") || u.contains("/product-warehousing")) return "仓库管理";
        if (u.contains("/warehouse"))         return "仓库管理";
        // 财务管理
        if (u.contains("/finance"))           return "财务管理";
        // 下单管理
        if (u.contains("/order-management"))  return "下单管理";
        // 基础数据
        if (u.contains("/system/factory") || u.contains("/system/process")) return "基础设置";
        // 模板库
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
            } catch (NoSuchMethodException ignore) {}
        }
        return null;
    }

    /**
     * fallback：当前两步均未取到名称时，用 ID 查库获取实体名称。
     * 覆盖范围：款式开发、生产订单、裁剪任务、菲号、采购单、出库单
     */
    private String resolveEntityNameFromUri(String uri, Object[] args, String resolvedTargetId) {
        if (uri == null) return null;
        // 优先从 body Map 的 ID 类字段反查
        String entityId = resolvedTargetId;
        if (entityId == null) {
            entityId = extractEntityId(args);
        }
        // 也尝试从 body Map 中专用ID字段查（purchaseId, pickingId 等）
        String orderNo    = extractFieldFromArgs(args, "orderNo");
        String purchaseId = extractFieldFromArgs(args, "purchaseId");
        String purchaseNo = extractFieldFromArgs(args, "purchaseNo");
        String pickingId  = extractFieldFromArgs(args, "pickingId");
        String pickingNo  = extractFieldFromArgs(args, "pickingNo");
        String bundleId   = extractFieldFromArgs(args, "cuttingBundleId");
        try {
            // 款式开发
            if (uri.contains("/style/") || uri.contains("/pattern")) {
                if (styleInfoService != null && entityId != null) {
                    var style = styleInfoService.getById(entityId);
                    if (style != null) return style.getStyleNo();
                }
            }
            // 生产订单
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
            // 采购单（优先 purchaseId，其次 entityId）
            if (uri.contains("/material-purchase") || uri.contains("/purchase")) {
                if (materialPurchaseService != null) {
                    String id = purchaseId != null ? purchaseId : entityId;
                    var p = org.springframework.util.StringUtils.hasText(purchaseNo)
                            ? materialPurchaseService.lambdaQuery().eq(com.fashion.supplychain.production.entity.MaterialPurchase::getPurchaseNo, purchaseNo).last("LIMIT 1").one()
                            : (id == null ? null : materialPurchaseService.getById(id));
                    if (p != null) {
                        String pno = p.getPurchaseNo();
                        String mn  = p.getMaterialName();
                        return pno != null ? pno + (mn != null ? " [" + mn + "]" : "") : mn;
                    }
                }
            }
            // 出库领料单
            if (uri.contains("/picking") || uri.contains("/cancel-picking")) {
                if (materialPickingService != null) {
                    String id = pickingId != null ? pickingId : entityId;
                    var pk = org.springframework.util.StringUtils.hasText(pickingNo)
                            ? materialPickingService.lambdaQuery().eq(com.fashion.supplychain.production.entity.MaterialPicking::getPickingNo, pickingNo).last("LIMIT 1").one()
                            : (id == null ? null : materialPickingService.getById(id));
                    if (pk != null) {
                        try { return String.valueOf(pk.getClass().getMethod("getPickingNo").invoke(pk)); } catch (Exception ignr) {}
                    }
                }
            }
            // 菲号
            if (uri.contains("/cutting-bundle") || uri.contains("/bundle")) {
                if (cuttingBundleService != null) {
                    String id = bundleId != null ? bundleId : entityId;
                    if (id != null) {
                        var b = cuttingBundleService.getById(id);
                        if (b != null) {
                            try { return String.valueOf(b.getClass().getMethod("getBundleNo").invoke(b)); } catch (Exception ignr) {}
                        }
                    }
                }
            }
            // 裁剪任务
            if (uri.contains("/cutting") && entityId != null) {
                if (cuttingTaskService != null) {
                    var ct = cuttingTaskService.getById(entityId);
                    if (ct != null) {
                        try { return String.valueOf(ct.getClass().getMethod("getOrderNo").invoke(ct)); } catch (Exception ignr) {}
                    }
                }
            }
        } catch (Exception ignored) {
            // 查询失败不影响主流程
        }
        return null;
    }

    /** 从 args 中的 Map 或 DTO 对象中提取指定字段值 */
    private String extractFieldFromArgs(Object[] args, String fieldName) {
        if (args == null) return null;
        for (Object a : args) {
            if (a instanceof Map) {
                Object v = ((Map<?,?>) a).get(fieldName);
                if (v != null) { String s = String.valueOf(v).trim(); if (!s.isEmpty() && !"null".equals(s)) return s; }
            } else if (a != null && !(a instanceof String) && !(a instanceof Number)) {
                String getter = "get" + fieldName.substring(0,1).toUpperCase() + fieldName.substring(1);
                try { Object v = a.getClass().getMethod(getter).invoke(a); if (v != null) { String s = String.valueOf(v).trim(); if (!s.isEmpty() && !"null".equals(s)) return s; } } catch (Exception ig) {}
            }
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
            } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
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

    private void enrichDetailsFromRequest(Map<String, Object> detailMap, HttpServletRequest request) {
        if (detailMap == null || request == null) {
            return;
        }

        Object pathVariableAttr = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        if (pathVariableAttr instanceof Map) {
            Map<?, ?> pathVariables = (Map<?, ?>) pathVariableAttr;
            for (String key : new String[]{"id", "orderId", "transferId", "trackingId", "productionOrderId"}) {
                Object value = pathVariables.get(key);
                if (value != null) {
                    detailMap.putIfAbsent(key, value);
                }
            }
        }

        for (String key : new String[]{
                "reason", "remark", "action", "stage", "orderNo", "purchaseId",
                "purchaseNo", "pickingId", "pickingNo", "expectedShipDate"
        }) {
            String value = request.getParameter(key);
            if (value != null && !value.isBlank()) {
                detailMap.putIfAbsent(key, value.trim());
            }
        }
    }

    private String buildRequestDetails(HttpServletRequest request) {
        try {
            Map<String, Object> detailMap = new LinkedHashMap<>();
            enrichDetailsFromRequest(detailMap, request);
            if (detailMap.isEmpty()) {
                return null;
            }
            return OBJECT_MAPPER.writeValueAsString(detailMap);
        } catch (Exception ignored) {
            return null;
        }
    }
}

