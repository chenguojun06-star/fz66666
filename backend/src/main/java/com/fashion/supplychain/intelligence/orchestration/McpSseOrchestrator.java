package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.agent.resource.McpIdentityContext;
import com.fashion.supplychain.intelligence.service.McpProtocolService;
import com.fashion.supplychain.intelligence.service.McpSseSessionService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

/**
 * MCP SSE 传输编排层（会话管理 + JSON-RPC 2.0 路由）
 *
 * <p>{@code McpSseController} 原先直接注入 {@code McpSseSessionService} +
 * {@code McpProtocolService}（D-630 规则6 违规），现由本层承接。
 *
 * <p><b>刻意留在 Controller 的部分：</b>SSE 传输细节（{@code SseEmitter} 的
 * {@code event: endpoint} 帧、{@code Cache-Control} 响应头、{@code 202/404} 状态码、
 * 线程池调度）—— 这些是 HTTP/SSE 协议层关注点，不是业务编排。
 */
@Slf4j
@Service
public class McpSseOrchestrator {

    @Autowired
    private McpSseSessionService sseSessionService;

    @Autowired
    private McpProtocolService mcpProtocolService;

    @Autowired
    private ObjectMapper objectMapper;

    /** 创建 SSE 会话（绑定租户）。 */
    public McpSseSessionService.SessionEntry createSession(Long tenantId) {
        return sseSessionService.createSession(tenantId);
    }

    /** 会话是否存在（不存在时 Controller 返 404）。 */
    public boolean hasSession(String sessionId) {
        return sseSessionService.hasSession(sessionId);
    }

    /**
     * 处理 JSON-RPC 2.0 请求并把响应写回对应 SSE 流。
     *
     * <p>在调用方指定的线程池中异步执行，避免阻塞 Tomcat 线程。
     */
    public void processJsonRpc(String sessionId, String body) {
        try {
            Map<String, Object> req = objectMapper.readValue(body, new TypeReference<>() {});
            Object id = req.get("id");
            String method = (String) req.get("method");
            @SuppressWarnings("unchecked")
            Map<String, Object> params = req.containsKey("params")
                    ? (Map<String, Object>) req.get("params") : new HashMap<>();

            Object result;
            switch (method != null ? method : "") {
                case "initialize" -> result = mcpProtocolService.initialize();
                case "tools/list" -> result = mcpProtocolService.listTools();
                case "tools/call" -> {
                    McpProtocolService.McpToolCallRequest toolReq = new McpProtocolService.McpToolCallRequest();
                    toolReq.setName((String) params.get("name"));
                    @SuppressWarnings("unchecked")
                    Map<String, Object> args = params.containsKey("arguments")
                            ? (Map<String, Object>) params.get("arguments") : new HashMap<>();
                    toolReq.setArguments(args);
                    result = mcpProtocolService.callTool(toolReq);
                }
                case "resources/list" -> result = mcpProtocolService.listResources(McpIdentityContext.fromUserContext());
                case "resources/read" -> {
                    String uri = (String) params.get("uri");
                    result = mcpProtocolService.readResource(uri, McpIdentityContext.fromUserContext());
                }
                default -> result = Map.of("error", Map.of("code", -32601, "message", "Method not found: " + method));
            }

            // 构造 JSON-RPC 2.0 响应
            Map<String, Object> rpcResponse = new HashMap<>();
            rpcResponse.put("jsonrpc", "2.0");
            if (id != null) {
                rpcResponse.put("id", id);
            }
            rpcResponse.put("result", result);

            String json = objectMapper.writeValueAsString(rpcResponse);
            boolean sent = sseSessionService.send(sessionId, json);
            if (!sent) {
                log.warn("[MCP/SSE] 响应发送失败，会话已断开 sessionId={} method={}", sessionId, method);
            }
        } catch (Exception e) {
            log.error("[MCP/SSE] JSON-RPC 处理异常 sessionId={} err={}", sessionId, e.getMessage(), e);
            try {
                Map<String, Object> errResponse = new HashMap<>();
                errResponse.put("jsonrpc", "2.0");
                errResponse.put("error", Map.of("code", -32603, "message", "Internal error: " + e.getMessage()));
                sseSessionService.send(sessionId, objectMapper.writeValueAsString(errResponse));
            } catch (Exception ex) {
                log.debug("[MCP SSE] 错误响应发送失败: {}", ex.getMessage());
            }
        }
    }
}
