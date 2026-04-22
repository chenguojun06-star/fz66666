package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.service.McpProtocolService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * MCP 协议控制器 — Model Context Protocol v2024-11-05
 *
 * <p>在原有 {@code tools/list} + {@code tools/call} 基础上新增：
 * <ul>
 *   <li>{@code POST /initialize} — 客户端建立连接时调用，返回服务能力声明</li>
 * </ul>
 *
 * <p>与原存根的区别：listTools() 现在返回真实 description 和完整 inputSchema JSON Schema，
 * 外部 LLM（Claude / GPT / Gemini）可以据此正确调用工具。
 */
@RestController
@RequestMapping("/api/intelligence/mcp")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class McpProtocolController {

    private final McpProtocolService mcpProtocolService;

    /** MCP initialize — 建立连接、声明协议版本与服务能力 */
    @PostMapping("/initialize")
    public Result<McpProtocolService.McpInitializeResult> initialize() {
        return Result.success(mcpProtocolService.initialize());
    }

    @PostMapping("/tools/list")
    public Result<McpProtocolService.McpToolsResponse> listTools() {
        return Result.success(mcpProtocolService.listTools());
    }

    @PostMapping("/tools/call")
    public Result<McpProtocolService.McpToolResult> callTool(@RequestBody McpProtocolService.McpToolCallRequest request) {
        return Result.success(mcpProtocolService.callTool(request));
    }
}
