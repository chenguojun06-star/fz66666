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

import java.util.*;
import java.util.stream.Collectors;

/**
 * MCP 协议服务 — Model Context Protocol v2024-11-05
 *
 * <p>修复历史存根问题并补全协议：
 * <ul>
 *   <li><b>Bug修复</b>：原代码 description=name（无意义）→ 改为从 {@link AiTool.AiFunction#getDescription()} 取真实描述。</li>
 *   <li><b>inputSchema补全</b>：根据 {@link AiTool.AiParameters} 构建 JSON Schema，
 *       外部 LLM（Claude / GPT）现在可以知道每个工具需要哪些参数、参数类型和说明。</li>
 *   <li><b>initialize 响应</b>：新增 {@link McpInitializeResult}，声明协议版本与服务能力。</li>
 *   <li><b>capabilities 声明</b>：标准 {@code tools / prompts / resources} 能力标志。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class McpProtocolService {

    private final List<AgentTool> registeredTools;
    private final ObjectMapper objectMapper;

    @Value("${spring.application.name:fashion-supplychain}")
    private String appName;

    // ─────────────────────────────────────────────────────────────────────
    // DTO — MCP 标准格式
    // ─────────────────────────────────────────────────────────────────────

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class McpTool {
        private String name;
        private String description;
        /** JSON Schema object — 告知调用方需要哪些参数 */
        private Map<String, Object> inputSchema;
    }

    @Data
    public static class McpToolsResponse {
        private List<McpTool> tools;
    }

    @Data
    public static class McpToolCallRequest {
        private String name;
        private Map<String, Object> arguments;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class McpToolResult {
        private boolean success;
        private List<Map<String, Object>> content;
        private Object data;
        private String error;
        // @JsonProperty("isError") 确保 JSON 序列化为 "isError" 而非 "error"（MCP协议要求）
        // 字段用 error 而非 isError 是为了规避 Lombok @Data 对 boolean is前缀字段的 setter 生成异常
        @com.fasterxml.jackson.annotation.JsonProperty("isError")
        private boolean e 序列化为 "isError"（MCP 协议要求），用 errorFlag 名字规避 Lombok
        // 对 boolean is前缀字段 setter 生成 setError() 与 String error 字段冲突的问题
        @com.fasterxml.jackson.annotation.JsonProperty("isError")
        private boolean errorFlag;
    }

    /** MCP initialize 响应 — 告知客户端服务能力 */
    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class McpInitializeResult {
        private String protocolVersion = "2024-11-05";
        private McpCapabilities capabilities;
        private McpServerInfo serverInfo;
        private String instructions;
    }

    @Data
    public static class McpCapabilities {
        /** 是否支持工具调用 */
        private McpCapabilityFlag tools = new McpCapabilityFlag(true, false);
        /** 是否支持资源访问（暂未实现） */
        private McpCapabilityFlag resources = new McpCapabilityFlag(false, false);
        /** 是否支持提示词模板（暂未实现） */
        private McpCapabilityFlag prompts = new McpCapabilityFlag(false, false);
    }

    @Data
    public static class McpCapabilityFlag {
        private boolean listChanged;
        private boolean subscribeChanged;
        McpCapabilityFlag(boolean listChanged, boolean subscribeChanged) {
            this.listChanged = listChanged; this.subscribeChanged = subscribeChanged;
        }
    }

    @Data
    public static class McpServerInfo {
        private String name;
        private String version;
        McpServerInfo(String name, String version) { this.name = name; this.version = version; }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 公开方法
    // ─────────────────────────────────────────────────────────────────────

    /**
     * MCP initialize 响应 — 客户端建立连接时调用。
     */
    public McpInitializeResult initialize() {
        McpInitializeResult result = new McpInitializeResult();
        result.setCapabilities(new McpCapabilities());
        result.setServerInfo(new McpServerInfo(appName, "1.0.0"));
        result.setInstructions("小云供应链AI助手 — 服装供应链管理系统的 AI 能力接口，支持生产订单、扫码追踪、质检、财务、仓库等68+工具。");
        return result;
    }

    /**
     * 列出所有可用工具（MCP tools/list）。
     *
     * <p>与旧实现的区别：
     * <ul>
     *   <li>description 取自 {@link AiTool.AiFunction#getDescription()}（旧代码错误地使用了 tool.getName()）</li>
     *   <li>inputSchema 从 {@link AiTool.AiParameters} 构建标准 JSON Schema</li>
     * </ul>
     */
    public McpToolsResponse listTools() {
        McpToolsResponse response = new McpToolsResponse();
        response.setTools(registeredTools.stream().map(this::toMcpTool).collect(Collectors.toList()));
        return response;
    }

    /**
     * 调用工具（MCP tools/call）。
     *
     * <p>返回 MCP 标准的 content 数组格式，isError=false 表示执行成功。
     */
    public McpToolResult callTool(McpToolCallRequest request) {
        McpToolResult result = new McpToolResult();
        try {
            AgentTool tool = registeredTools.stream()
                    .filter(t -> t.getName().equals(request.getName()))
                    .findFirst().orElse(null);
            if (tool == null) {
                result.setccess(false);
                result.setError("工具不存在：" + request.getName());
                result.setErrorFlag(true);
                return result;
            }
            String toolResult = tool.execute(request.getArguments() != null
                    ? jectMapper.writeValueAsString(request.getArguments()) : "{}");
            result.setSuccess(true);
            result.setErrorFlag(false);
            // MCP 标准 content 数组
            result.setContent(List.of(Map.of("type", "text", "text", toolResult)));
            result.setData(toolResult);
        } catch (ExcepError(true);
            result.setErrorMessagess(false);
            result.setErrorFlag(true);
            result.setError(e.getMessage());
            log.warn("[McpProtocol] callTool {} failed: {}", request.getName(), e.getMessage());
        }
        return result;
    }

    // ─────────────────────────────────────────────────────────────────────
    // 私有：工具 → MCP 格式转换
    // ─────────────────────────────────────────────────────────────────────

    private McpTool toMcpTool(AgentTool tool) {
        McpTool mcpTool = new McpTool();
        mcpTool.setName(tool.getName());

        AiTool def = tool.getToolDefinition();
        if (def != null && def.getFunction() != null) {
            // ✅ 修复：使用真实描述，不再用 name 代替
            mcpTool.setDescription(def.getFunction().getDescription());
            // ✅ 新增：构建 JSON Schema inputSchema
            mcpTool.setInputSchema(buildInputSchema(def.getFunction().getParameters()));
        } else {
            mcpTool.setDescription("供应链工具：" + tool.getName());
            mcpTool.setInputSchema(Map.of("type", "object", "properties", Map.of()));
        }
        return mcpTool;
    }

    /**
     * 将 {@link AiTool.AiParameters} 转换为 JSON Schema {@code inputSchema}。
     *
     * <p>JSON Schema 格式（MCP 要求）：
     * <pre>
     * {
     *   "type": "object",
     *   "properties": {
     *     "query": {"type": "string", "description": "搜索关键词"}
     *   },
     *   "required": ["query"]
     * }
     * </pre>
     */
    private Map<String, Object> buildInputSchema(AiTool.AiParameters params) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");

        if (params == null) {
            schema.put("properties", Map.of());
            return schema;
        }

        // properties — 每个属性包含 type + description
        if (params.getProperties() != null) {
            Map<String, Object> propsOut = new LinkedHashMap<>();
            params.getProperties().forEach((propName, propDef) -> {
                Map<String, Object> propSchema = new LinkedHashMap<>();
                if (propDef instanceof Map<?,?> propMap) {
                    // 已经是 {type:..., description:...} 格式，直接使用
                    propMap.forEach((k, v) -> propSchema.put(k.toString(), v));
                } else {
                    // 退化处理：propDef 是字符串（description）
                    propSchema.put("type", "string");
                    propSchema.put("description", propDef != null ? propDef.toString() : propName);
                }
                propsOut.put(propName, propSchema);
            });
            schema.put("properties", propsOut);
        } else {
            schema.put("properties", Map.of());
        }

        // required 字段
        if (params.getRequired() != null && !params.getRequired().isEmpty()) {
            schema.put("required", params.getRequired());
        }

        return schema;
    }
}
