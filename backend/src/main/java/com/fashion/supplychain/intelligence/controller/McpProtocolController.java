package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.service.McpProtocolService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/intelligence/mcp")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class McpProtocolController {

    private final McpProtocolService mcpProtocolService;

    @PostMapping("/tools/list")
    public Result<McpProtocolService.McpToolsResponse> listTools() {
        return Result.success(mcpProtocolService.listTools());
    }

    @PostMapping("/tools/call")
    public Result<McpProtocolService.McpToolResult> callTool(@RequestBody McpProtocolService.McpToolCallRequest request) {
        return Result.success(mcpProtocolService.callTool(request));
    }
}
