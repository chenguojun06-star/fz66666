package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.command.CompensableTool;
import com.fashion.supplychain.intelligence.agent.command.CompensationResult;
import com.fashion.supplychain.intelligence.agent.tracker.AiOperationAudit;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.*;
import java.util.concurrent.*;

@Slf4j
public abstract class AbstractAgentTool implements AgentTool, CompensableTool {

    protected static final ObjectMapper MAPPER = new ObjectMapper();

    private static final ExecutorService TIMEOUT_EXECUTOR = new ThreadPoolExecutor(
            4, 16, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(64),
            r -> {
                Thread t = new Thread(r, "agent-tool-timeout-" + System.nanoTime());
                t.setDaemon(true);
                return t;
            },
            new ThreadPoolExecutor.CallerRunsPolicy());

    @Autowired
    private AiAgentToolAccessService accessService;

    @Autowired
    private AiOperationAudit operationAudit;

    @Override
    public final String execute(String argumentsJson) throws Exception {
        long startMs = System.currentTimeMillis();
        String toolName = getName();
        try {
            try {
                TenantAssert.assertTenantContext();
            } catch (BusinessException e) {
                log.warn("[{}] 租户上下文丢失: {}", toolName, e.getMessage());
                return errorJson("租户上下文丢失，请重新登录");
            }
            Long tenantId = UserContext.tenantId();
            if (accessService != null && !accessService.canUseTool(toolName)) {
                log.warn("[{}] 权限不足，拒绝执行: userId={}", toolName, UserContext.userId());
                return errorJson("权限不足，该操作需要管理员权限");
            }

            Map<String, Object> args = parseArgs(argumentsJson);
            String validationError = validateArguments(args);
            if (validationError != null) {
                log.warn("[{}] 参数校验失败: {}", toolName, validationError);
                return errorJson("参数校验失败：" + validationError);
            }

            if (accessService != null && accessService.isHighRiskTool(toolName)) {
                String approvalToken = args.get("_approvalToken") instanceof String ? (String) args.get("_approvalToken") : null;
                if (approvalToken == null || approvalToken.isBlank()) {
                    log.info("[{}] 高风险工具需要人工审批，返回审批请求", toolName);
                    return buildApprovalRequiredResult(toolName, args);
                }
                if (!accessService.validateApprovalToken(toolName, approvalToken)) {
                    log.warn("[{}] 审批令牌无效或已过期", toolName);
                    return errorJson("审批令牌无效或已过期，请重新获取审批");
                }
                args.remove("_approvalToken");
            }

            String auditId = null;
            if (operationAudit != null) {
                auditId = operationAudit.recordStart(toolName, args);
            }

            int timeoutMs = resolveTimeoutMs();
            String result;
            if (timeoutMs > 0) {
                result = executeWithTimeout(argumentsJson, timeoutMs, startMs);
            } else {
                result = doExecute(argumentsJson);
            }

            if (operationAudit != null && auditId != null) {
                boolean success = !result.contains("\"success\":false") && !result.contains("\"error\":");
                operationAudit.recordComplete(auditId, success, truncate(result, 200));
            }

            long elapsed = System.currentTimeMillis() - startMs;
            log.debug("[{}] 执行完成, 耗时{}ms", toolName, elapsed);
            return result;
        } catch (IllegalArgumentException e) {
            log.warn("[{}] 参数错误: {}", toolName, e.getMessage());
            return errorJson("参数错误：" + e.getMessage());
        } catch (IllegalStateException e) {
            log.warn("[{}] 业务拒绝: {}", toolName, e.getMessage());
            return errorJson(e.getMessage());
        } catch (Exception e) {
            log.error("[{}] 执行异常", toolName, e);
            return errorJson("执行失败：" + e.getMessage());
        }
    }

    private String executeWithTimeout(String argumentsJson, int timeoutMs, long startMs) throws Exception {
        String toolName = getName();
        // 关键：捕获调用线程的 UserContext，submit 进异步线程时手动恢复，
        // 避免 ThreadLocal 跨线程丢失导致 TenantAssert 抛出"缺少租户上下文"。
        final UserContext capturedCtx = UserContext.get();
        Future<String> future = TIMEOUT_EXECUTOR.submit(() -> {
            UserContext previous = UserContext.get();
            try {
                if (capturedCtx != null) {
                    UserContext.set(capturedCtx);
                }
                return doExecute(argumentsJson);
            } finally {
                if (previous == null) {
                    UserContext.clear();
                } else {
                    UserContext.set(previous);
                }
            }
        });
        try {
            return future.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            long elapsed = System.currentTimeMillis() - startMs;
            log.warn("[{}] 执行超时, 耗时{}ms, 限制{}ms", toolName, elapsed, timeoutMs);
            return errorJson("执行超时（" + timeoutMs + "ms），请稍后重试或简化查询条件");
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof Exception ex) throw ex;
            throw new RuntimeException(cause);
        }
    }

    private int resolveTimeoutMs() {
        AgentToolDef def = getClass().getAnnotation(AgentToolDef.class);
        if (def != null && def.timeoutMs() > 0) {
            return def.timeoutMs();
        }
        AiTool toolDef = getToolDefinition();
        if (toolDef != null && toolDef.getFunction() != null
                && toolDef.getFunction().getParameters() != null) {
            return 30000;
        }
        return 0;
    }

    protected String validateArguments(Map<String, Object> args) {
        AiTool toolDef = getToolDefinition();
        if (toolDef == null || toolDef.getFunction() == null
                || toolDef.getFunction().getParameters() == null) {
            return null;
        }
        List<String> required = toolDef.getFunction().getParameters().getRequired();
        if (required == null || required.isEmpty()) {
            return null;
        }
        List<String> missing = new ArrayList<>();
        for (String key : required) {
            Object val = args.get(key);
            if (val == null || (val instanceof String s && s.isBlank())) {
                missing.add(key);
            }
        }
        if (!missing.isEmpty()) {
            return "缺少必填参数：" + String.join(", ", missing);
        }
        Map<String, Object> properties = toolDef.getFunction().getParameters().getProperties();
        if (properties != null) {
            List<String> typeErrors = new ArrayList<>();
            for (Map.Entry<String, Object> entry : properties.entrySet()) {
                String key = entry.getKey();
                Object val = args.get(key);
                if (val == null) continue;
                if (entry.getValue() instanceof Map<?, ?> propDef) {
                    Object typeObj = propDef.get("type");
                    if (typeObj != null) {
                        String expectedType = typeObj.toString();
                        if (!checkType(val, expectedType)) {
                            typeErrors.add(key + " 应为 " + expectedType + " 类型，实际为 " + val.getClass().getSimpleName());
                        }
                    }
                }
            }
            if (!typeErrors.isEmpty()) {
                return "参数类型错误：" + String.join("; ", typeErrors);
            }
        }
        return null;
    }

    private boolean checkType(Object val, String expectedType) {
        return switch (expectedType) {
            case "string" -> val instanceof String;
            case "integer" -> val instanceof Number;
            case "number" -> val instanceof Number;
            case "boolean" -> val instanceof Boolean;
            case "array" -> val instanceof List;
            case "object" -> val instanceof Map;
            default -> true;
        };
    }

    protected abstract String doExecute(String argumentsJson) throws Exception;

    protected Map<String, Object> parseArgs(String json) throws Exception {
        return MAPPER.readValue(json, new TypeReference<>() {});
    }

    protected String requireString(Map<String, Object> args, String key) {
        Object val = args.get(key);
        if (val == null || val.toString().isBlank()) {
            throw new IllegalArgumentException("缺少必填参数：" + key);
        }
        return val.toString().trim();
    }

    protected String optionalString(Map<String, Object> args, String key) {
        Object val = args.get(key);
        return (val != null && !val.toString().isBlank()) ? val.toString().trim() : null;
    }

    protected Integer optionalInt(Map<String, Object> args, String key) {
        Object val = args.get(key);
        if (val == null) return null;
        if (val instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(val.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    protected Long optionalLong(Map<String, Object> args, String key) {
        Object val = args.get(key);
        if (val == null) return null;
        if (val instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(val.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    protected String successJson(String message) throws Exception {
        return MAPPER.writeValueAsString(Map.of("success", true, "message", message));
    }

    protected String successJson(String message, Map<String, Object> data) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("message", message);
        result.putAll(data);
        return MAPPER.writeValueAsString(result);
    }

    protected String errorJson(String message) {
        try {
            return MAPPER.writeValueAsString(Map.of("success", false, "error", message));
        } catch (Exception e) {
            return "{\"success\":false,\"error\":\"" + message.replace("\"", "'") + "\"}";
        }
    }

    protected Map<String, Object> prop(String type, String description) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("type", type);
        p.put("description", description);
        return p;
    }

    protected Map<String, Object> stringProp(String description) {
        return prop("string", description);
    }

    protected Map<String, Object> intProp(String description) {
        return prop("integer", description);
    }

    private String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() > max ? s.substring(0, max) + "..." : s;
    }

    private String buildApprovalRequiredResult(String toolName, Map<String, Object> args) {
        try {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("success", false);
            result.put("requiresApproval", true);
            result.put("toolName", toolName);
            result.put("reason", "该操作为高风险操作，需要人工审批后方可执行");
            result.put("approvalHint", "请在管理端审批后，携带审批令牌重新调用");
            Map<String, Object> safeArgs = new LinkedHashMap<>(args);
            safeArgs.remove("_approvalToken");
            result.put("pendingArgs", safeArgs);
            return MAPPER.writeValueAsString(result);
        } catch (Exception e) {
            return "{\"success\":false,\"requiresApproval\":true,\"toolName\":\"" + toolName + "\"}";
        }
    }

    protected AiTool buildToolDef(String description,
                                  Map<String, Object> properties,
                                  List<String> required) {
        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription(description);
        AiTool.AiParameters params = new AiTool.AiParameters();
        params.setProperties(properties);
        params.setRequired(required);
        function.setParameters(params);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public CompensationResult compensate(Map<String, Object> execSnapshot) {
        return CompensationResult.fail("工具 " + getName() + " 暂不支持自动回滚");
    }

    @Override
    public boolean isCompensable() {
        return false;
    }
}
