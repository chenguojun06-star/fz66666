package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.orchestration.McpSseOrchestrator;
import com.fashion.supplychain.intelligence.service.McpSseSessionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.concurrent.Executor;

/**
 * MCP SSE 传输控制器
 *
 * <p>实现 MCP 协议 2024-11-05 规范的 SSE Transport，让 Cursor / Claude Desktop
 * 等原生 MCP 客户端可以通过标准 SSE 连接使用小云的 68+ 工具。
 *
 * <h3>连接流程</h3>
 * <ol>
 *   <li>客户端连接 {@code GET /api/intelligence/mcp/sse?token=<mcpToken>}</li>
 *   <li>服务端立即发送 {@code event: endpoint}，告知消息推送地址：
 *       {@code /api/intelligence/mcp/messages?sessionId=<sid>}</li>
 *   <li>客户端通过 {@code POST /api/intelligence/mcp/messages?sessionId=<sid>}
 *       发送 JSON-RPC 2.0 请求（initialize / tools/list / tools/call）</li>
 *   <li>服务端处理后通过 SSE 流将响应 {@code event: message} 推送回客户端</li>
 * </ol>
 *
 * <h3>Cursor 配置示例</h3>
 * <pre>{@code
 * // ~/.cursor/mcp.json
 * {
 *   "mcpServers": {
 *     "小云": {
 *       "url": "https://<your-cloud-domain>/api/intelligence/mcp/sse?token=<mcpToken>"
 *     }
 *   }
 * }
 * }</pre>
 *
 * <h3>Claude Desktop 配置示例</h3>
 * <pre>{@code
 * // claude_desktop_config.json
 * {
 *   "mcpServers": {
 *     "xiaoyun": {
 *       "url": "https://<your-cloud-domain>/api/intelligence/mcp/sse?token=<mcpToken>",
 *       "transport": "sse"
 *     }
 *   }
 * }
 * }</pre>
 *
 * <p><b>分层说明（D-635）：</b>会话创建与 JSON-RPC 路由已下沉到 {@link McpSseOrchestrator}；
 * 本类只保留 SSE 协议层细节（endpoint 帧、禁缓存响应头、202/404 状态码、异步线程池调度）。
 */
@RestController
@RequestMapping("/api/intelligence/mcp")
@RequiredArgsConstructor
@Slf4j
public class McpSseController {

    private final McpSseOrchestrator mcpSseOrchestrator;

    @org.springframework.beans.factory.annotation.Autowired
    @Qualifier("taskExecutor")
    private Executor taskExecutor;

    /**
     * SSE 连接端点 — 客户端建立长连接并获取消息推送地址。
     *
     * <p>鉴权：通过 URL 查询参数 {@code ?token=<mcpToken>} 传递，
     * {@link com.fashion.supplychain.auth.TokenAuthFilter} 自动解析并注入 Security Context。
     */
    @GetMapping(value = "/sse", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("isAuthenticated()")
    public SseEmitter connectSse(HttpServletResponse response) throws IOException {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 禁止代理/浏览器缓存 SSE 流
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");  // 禁止 nginx 缓冲

        McpSseSessionService.SessionEntry session = mcpSseOrchestrator.createSession(tenantId);

        // 第一条事件：告知客户端用哪个路径发 JSON-RPC 消息
        session.emitter().send(SseEmitter.event()
                .name("endpoint")
                .data("/api/intelligence/mcp/messages?sessionId=" + session.sessionId()));

        return session.emitter();
    }

    /**
     * JSON-RPC 消息端点 — 客户端通过 POST 发送 initialize / tools/list / tools/call。
     *
     * <p>响应异步写回对应的 SSE 流，HTTP 响应本身返回 202 Accepted（无 body）。
     */
    @PostMapping("/messages")
    @PreAuthorize("isAuthenticated()")
    public void handleMessage(
            @RequestParam("sessionId") String sessionId,
            @RequestBody String body,
            HttpServletResponse response) throws IOException {

        if (!mcpSseOrchestrator.hasSession(sessionId)) {
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.getWriter().write("{\"error\":\"session not found\"}");
            return;
        }

        response.setStatus(HttpServletResponse.SC_ACCEPTED);

        // 异步处理，避免阻塞 Tomcat 线程
        taskExecutor.execute(() -> mcpSseOrchestrator.processJsonRpc(sessionId, body));
    }
}
