package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class McpProtocolService {

    private final List<AgentTool> registeredTools;
    private final ObjectMapper objectMapper;

    @Data
    public static class McpTool {
        private String name;
        private String description;
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
    public static class McpToolResult {
        private boolean success;
        private Object data;
        private String error;
    }

    public McpToolsResponse listTools() {
        McpToolsResponse response = new McpToolsResponse();
        response.setTools(registeredTools.stream().map(tool -> {
            McpTool mcpTool = new McpTool();
            mcpTool.setName(tool.getName());
            mcpTool.setDescription(tool.getName());
            return mcpTool;
        }).collect(Collectors.toList()));
        return response;
    }

    public McpToolResult callTool(McpToolCallRequest request) {
        McpToolResult result = new McpToolResult();
        try {
            AgentTool tool = registeredTools.stream()
                    .filter(t -> t.getName().equals(request.getName()))
                    .findFirst()
                    .orElse(null);
            if (tool == null) {
                result.setSuccess(false);
                result.setError("Tool not found: " + request.getName());
                return result;
            }
            String toolResult = tool.execute(request.getArguments() != null
                    ? objectMapper.writeValueAsString(request.getArguments()) : "{}");
            result.setSuccess(true);
            result.setData(toolResult);
        } catch (Exception e) {
            result.setSuccess(false);
            result.setError(e.getMessage());
            log.warn("[McpProtocol] callTool {} failed: {}", request.getName(), e.getMessage());
        }
        return result;
    }
}
