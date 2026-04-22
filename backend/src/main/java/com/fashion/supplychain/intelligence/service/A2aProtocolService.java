package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * A2A 协议服务 — Google/Linux Foundation Agent-to-Agent Protocol v1.0
 *
 * <p>实现 A2A 标准三大能力：
 * <ol>
 *   <li><b>AgentCard 发现</b>：{@code GET /.well-known/agent.json} 返回小云能力卡片，
 *       外部 Agent（Claude / Cursor / Copilot）可自动发现并委托任务。</li>
 *   <li><b>任务委托（同步）</b>：{@code POST /tasks/send}，JSON-RPC 2.0 格式，
 *       接收外部 Agent 的任务请求，路由到本地 AgentTool 执行并返回。</li>
 *   <li><b>任务追踪</b>：任务状态持久化内存（生产可替换为 Redis），
 *       支持 {@code tasks/get} 查询历史任务结果。</li>
 * </ol>
 *
 * <p>协议对齐：{@code https://google.github.io/A2A/}
 * <br>基于 Java SDK：{@code github.com/a2aproject/a2a-java}（此实现为原生 Java 等价实现）
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class A2aProtocolService {

    private final List<AgentTool> registeredTools;
    private final ObjectMapper objectMapper;

    @Value("${server.port:8088}")
    private int serverPort;

    @Value("${a2a.agent.name:小云供应链AI助手}")
    private String agentName;

    @Value("${a2a.agent.description:服装供应链智能AI助手，支持生产订单管理、扫码追踪、质检入库、财务结算等68+供应链工具}")
    private String agentDescription;

    @Value("${a2a.agent.version:1.0.0}")
    private String agentVersion;

    /** 内存任务状态存储（生产环境可替换为 Redis） */
    private final ConcurrentHashMap<String, A2aTask> taskStore = new ConcurrentHashMap<>();

    // ─────────────────────────────────────────────────────────────────────
    // AgentCard DTO（A2A 标准格式）
    // ─────────────────────────────────────────────────────────────────────

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AgentCard {
        private String name;
        private String description;
        private String url;
        private String version;
        private AgentCapabilities capabilities;
        private List<AgentSkill> skills;
        private String defaultInputModes;
        private String defaultOutputModes;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AgentCapabilities {
        private boolean streaming = false;
        private boolean pushNotifications = false;
        private boolean stateTransitionHistory = true;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AgentSkill {
        private String id;
        private String name;
        private String description;
        private List<String> inputModes;
        private List<String> outputModes;
    }

    // ─────────────────────────────────────────────────────────────────────
    // JSON-RPC 2.0 请求/响应
    // ─────────────────────────────────────────────────────────────────────

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class A2aRequest {
        private String jsonrpc = "2.0";
        private String method;
        private Map<String, Object> params;
        private String id;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class A2aResponse {
        private String jsonrpc = "2.0";
        private String id;
        private Object result;
        private A2aError error;
    }

    @Data
    public static class A2aError {
        private int code;
        private String message;
        public A2aError(int code, String message) { this.code = code; this.message = message; }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 任务状态
    // ─────────────────────────────────────────────────────────────────────

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class A2aTask {
        private String id;
        /** submitted / working / completed / failed */
        private String status;
        private String message;
        private Object result;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 公开方法
    // ─────────────────────────────────────────────────────────────────────

    /**
     * 生成 AgentCard（符合 A2A 标准格式）。
     * 外部 AI 系统调用 GET /.well-known/agent.json 即可获得小云的能力清单。
     */
    public AgentCard buildAgentCard(String baseUrl) {
        AgentCard card = new AgentCard();
        card.setName(agentName);
        card.setDescription(agentDescription);
        card.setUrl(baseUrl + "/api/intelligence/a2a");
        card.setVersion(agentVersion);

        AgentCapabilities caps = new AgentCapabilities();
        caps.setStateTransitionHistory(true);
        card.setCapabilities(caps);

        card.setDefaultInputModes("text");
        card.setDefaultOutputModes("text");

        // 每个 AgentTool 映射为一个 AgentSkill
        List<AgentSkill> skills = registeredTools.stream().map(tool -> {
            AgentSkill skill = new AgentSkill();
            skill.setId(tool.getName());
            skill.setName(tool.getName());
            AiTool def = tool.getToolDefinition();
            skill.setDescription(def != null && def.getFunction() != null
                    ? def.getFunction().getDescription() : tool.getName());
            skill.setInputModes(List.of("text", "application/json"));
            skill.setOutputModes(List.of("text", "application/json"));
            return skill;
        }).collect(Collectors.toList());
        card.setSkills(skills);

        log.info("[A2A] AgentCard 生成完毕，工具数量={}", skills.size());
        return card;
    }

    /**
     * 处理 JSON-RPC 2.0 请求（A2A 协议标准入口）。
     *
     * <p>支持的 method：
     * <ul>
     *   <li>{@code tasks/send} — 发送任务（同步执行 AgentTool）</li>
     *   <li>{@code tasks/get} — 查询任务状态</li>
     *   <li>{@code tools/list} — 列出所有可用工具</li>
     * </ul>
     */
    public A2aResponse handleRequest(A2aRequest request) {
        if (request == null || request.getMethod() == null) {
            return errorResponse(null, -32600, "无效请求");
        }
        log.info("[A2A] 收到请求 method={} id={}", request.getMethod(), request.getId());

        return switch (request.getMethod()) {
            case "tasks/send"  -> handleTaskSend(request);
            case "tasks/get"   -> handleTaskGet(request);
            case "tools/list"  -> handleToolsList(request);
            default -> errorResponse(request.getId(), -32601, "未知 method: " + request.getMethod());
        };
    }

    // ─────────────────────────────────────────────────────────────────────
    // 私有实现
    // ─────────────────────────────────────────────────────────────────────

    private A2aResponse handleTaskSend(A2aRequest request) {
        Map<String, Object> params = request.getParams();
        if (params == null) return errorResponse(request.getId(), -32602, "缺少 params");

        String toolName = getStr(params, "skill");
        if (toolName == null) toolName = getStr(params, "tool");
        if (toolName == null) return errorResponse(request.getId(), -32602, "缺少参数：skill / tool");

        Object rawArgs = params.get("arguments");
        String argsJson = "{}";
        try {
            argsJson = rawArgs != null ? objectMapper.writeValueAsString(rawArgs) : "{}";
        } catch (Exception ignore) {}

        // 查找工具
        final String finalToolName = toolName;
        AgentTool tool = registeredTools.stream()
                .filter(t -> t.getName().equals(finalToolName))
                .findFirst().orElse(null);
        if (tool == null) return errorResponse(request.getId(), -32602, "未知工具：" + finalToolName);

        // 创建任务记录
        String taskId = UUID.randomUUID().toString().replace("-", "");
        A2aTask task = new A2aTask();
        task.setId(taskId);
        task.setStatus("working");
        task.setCreatedAt(LocalDateTime.now());
        taskStore.put(taskId, task);

        // 同步执行
        try {
            String result = tool.execute(argsJson);
            task.setStatus("completed");
            task.setResult(result);
            task.setUpdatedAt(LocalDateTime.now());
            log.info("[A2A] 任务完成 taskId={} tool={}", taskId, finalToolName);
        } catch (Exception e) {
            task.setStatus("failed");
            task.setMessage(e.getMessage());
            task.setUpdatedAt(LocalDateTime.now());
            log.warn("[A2A] 任务失败 taskId={} tool={} err={}", taskId, finalToolName, e.getMessage());
        }

        return successResponse(request.getId(), Map.of("taskId", taskId, "task", task));
    }

    private A2aResponse handleTaskGet(A2aRequest request) {
        Map<String, Object> params = request.getParams();
        String taskId = params != null ? getStr(params, "taskId") : null;
        if (taskId == null) return errorResponse(request.getId(), -32602, "缺少 taskId");
        A2aTask task = taskStore.get(taskId);
        if (task == null) return errorResponse(request.getId(), -32602, "任务不存在：" + taskId);
        return successResponse(request.getId(), task);
    }

    private A2aResponse handleToolsList(A2aRequest request) {
        List<Map<String, Object>> tools = registeredTools.stream().map(t -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", t.getName());
            m.put("domain", t.getDomain().name());
            AiTool def = t.getToolDefinition();
            if (def != null && def.getFunction() != null) {
                m.put("description", def.getFunction().getDescription());
            }
            return m;
        }).collect(Collectors.toList());
        return successResponse(request.getId(), Map.of("tools", tools, "count", tools.size()));
    }

    private A2aResponse successResponse(String id, Object result) {
        A2aResponse r = new A2aResponse();
        r.setId(id);
        r.setResult(result);
        return r;
    }

    private A2aResponse errorResponse(String id, int code, String message) {
        A2aResponse r = new A2aResponse();
        r.setId(id);
        r.setError(new A2aError(code, message));
        return r;
    }

    private String getStr(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v != null ? v.toString() : null;
    }
}
