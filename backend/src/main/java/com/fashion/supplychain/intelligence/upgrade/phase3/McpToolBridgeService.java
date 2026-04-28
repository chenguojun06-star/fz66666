package com.fashion.supplychain.intelligence.upgrade.phase3;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
@Slf4j
public class McpToolBridgeService {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final Map<String, McpToolDescriptor> registry = new LinkedHashMap<>();
    private final Map<String, AgentTool> internalTools = new LinkedHashMap<>();

    public void register(String toolName, AgentTool tool) {
        internalTools.put(toolName, tool);
        McpToolDescriptor desc = new McpToolDescriptor();
        desc.name = toolName;
        AiTool def = tool.getToolDefinition();
        if (def != null && def.getFunction() != null) {
            desc.description = def.getFunction().getDescription();
            if (def.getFunction().getParameters() != null) {
                desc.inputSchema = def.getFunction().getParameters().getProperties();
                desc.required = def.getFunction().getParameters().getRequired();
            }
        } else {
            desc.description = toolName;
        }
        desc.annotations = buildAnnotations(toolName);
        registry.put(toolName, desc);
    }

    public McpCallResult call(String toolName, Map<String, Object> arguments) {
        McpCallResult result = new McpCallResult();
        AgentTool tool = internalTools.get(toolName);
        if (tool == null) {
            result.error = true;
            result.content = "Tool not found: " + toolName;
            return result;
        }
        try {
            String argsJson = MAPPER.writeValueAsString(arguments);
            String output = tool.execute(argsJson);
            result.error = false;
            result.content = output != null ? output : "";
        } catch (Exception e) {
            log.warn("[McpBridge] call failed: {} - {}", toolName, e.getMessage());
            result.error = true;
            result.content = "Execution failed: " + e.getMessage();
        }
        return result;
    }

    public AiTool convertToAiTool(String toolName) {
        McpToolDescriptor desc = registry.get(toolName);
        if (desc == null) return null;
        AiTool tool = new AiTool();
        AiTool.AiFunction fn = new AiTool.AiFunction();
        fn.setName(desc.name);
        fn.setDescription(desc.description);
        AiTool.AiParameters params = new AiTool.AiParameters();
        params.setType("object");
        if (desc.inputSchema != null) params.setProperties(desc.inputSchema);
        if (desc.required != null) params.setRequired(desc.required);
        fn.setParameters(params);
        tool.setFunction(fn);
        return tool;
    }

    public List<McpToolDescriptor> listTools() {
        return new ArrayList<>(registry.values());
    }

    public Set<String> getRegisteredNames() {
        return Collections.unmodifiableSet(registry.keySet());
    }

    private Map<String, Object> buildAnnotations(String toolName) {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("readOnlyHint", isReadOnly(toolName));
        a.put("destructiveHint", isDestructive(toolName));
        a.put("idempotentHint", true);
        return a;
    }

    private boolean isReadOnly(String name) {
        return name.contains("query") || name.contains("search") || name.contains("list")
                || name.contains("get") || name.contains("check") || name.contains("analyze")
                || name.contains("report") || name.contains("dashboard") || name.contains("score");
    }

    private boolean isDestructive(String name) {
        return name.contains("delete") || name.contains("remove") || name.contains("close")
                || name.contains("approve") || name.contains("edit") || name.contains("transfer");
    }

    @Data
    public static class McpToolDescriptor {
        private String name;
        private String description;
        private Map<String, Object> inputSchema;
        private List<String> required;
        private Map<String, Object> annotations;
    }

    @Data
    public static class McpCallResult {
        private boolean error;
        private String content;
    }
}
