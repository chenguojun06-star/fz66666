package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;

import java.util.*;

/**
 * 工具层公共基类 — 解决 35+ AgentTool 实现中的共性样板代码。
 *
 * <ul>
 *   <li>F18: {@link #prop}/{@link #stringProp}/{@link #buildToolDef} — 属性定义简化</li>
 *   <li>F19: {@link #parseArgs}/{@link #requireString}/{@link #optionalString} — 参数解析辅助</li>
 *   <li>F20: 共享 {@code MAPPER} 实例，子类无需重复声明</li>
 *   <li>F21: {@link #execute} 模板方法 — 统一异常捕获与日志记录</li>
 *   <li>F22: {@link #successJson}/{@link #errorJson} — 统一 JSON 结果格式</li>
 * </ul>
 *
 * <p>新建工具继承此类只需实现 {@link #doExecute(String)} 和 {@link #getToolDefinition()}。
 * 现有工具可逐步迁移，直接 {@code implements AgentTool} 仍然兼容。
 */
@Slf4j
public abstract class AbstractAgentTool implements AgentTool {

    protected static final ObjectMapper MAPPER = new ObjectMapper();

    // ─── F21: 统一异常捕获模板 ──────────────────────────────────

    @Override
    public final String execute(String argumentsJson) throws Exception {
        try {
            Long tenantId = UserContext.tenantId();
            if (tenantId == null) {
                log.warn("[{}] 租户上下文丢失，拒绝执行", getName());
                return errorJson("租户上下文丢失，请重新登录");
            }
            return doExecute(argumentsJson);
        } catch (IllegalArgumentException e) {
            log.warn("[{}] 参数错误: {}", getName(), e.getMessage());
            return errorJson("参数错误：" + e.getMessage());
        } catch (IllegalStateException e) {
            log.warn("[{}] 业务拒绝: {}", getName(), e.getMessage());
            return errorJson(e.getMessage());
        } catch (Exception e) {
            log.error("[{}] 执行异常", getName(), e);
            return errorJson("执行失败：" + e.getMessage());
        }
    }

    /** 子类实现具体业务逻辑，异常由 {@link #execute} 统一捕获。 */
    protected abstract String doExecute(String argumentsJson) throws Exception;

    // ─── F19: 参数解析辅助 ──────────────────────────────────────

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

    // ─── F22: 统一结果 JSON 格式 ─────────────────────────────────

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

    // ─── F18: 属性定义简化辅助 ───────────────────────────────────

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
}
