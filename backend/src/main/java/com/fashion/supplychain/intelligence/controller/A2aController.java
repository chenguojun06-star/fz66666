package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.service.A2aProtocolService;
import com.fashion.supplychain.intelligence.service.A2aProtocolService.A2aRequest;
import com.fashion.supplychain.intelligence.service.A2aProtocolService.A2aResponse;
import com.fashion.supplychain.intelligence.service.A2aProtocolService.AgentCard;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;

/**
 * A2A 协议控制器 — Agent-to-Agent Protocol v1.0
 *
 * <p>遵循 A2A 标准，提供三个端点：
 * <ul>
 *   <li>{@code GET  /.well-known/agent.json} — 公开能力发现端点（无需鉴权）</li>
 *   <li>{@code POST /api/intelligence/a2a/rpc} — 私有 JSON-RPC 2.0 任务入口（需鉴权）</li>
 *   <li>{@code GET  /api/intelligence/a2a/status} — 服务状态检查（需鉴权）</li>
 * </ul>
 *
 * <p>外部 AI 系统（Claude / Cursor / OpenAI Agent）可通过以下方式接入：
 * <pre>
 *   1. GET /.well-known/agent.json  →  获取 AgentCard（自动发现）
 *   2. POST /api/intelligence/a2a/rpc  →  委托任务（需携带 Bearer Token）
 * </pre>
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class A2aController {

    private final A2aProtocolService a2aProtocolService;

    // ─────────────────────────────────────────────────────────────────────
    // ① AgentCard 公开发现端点（A2A 标准：不需要鉴权）
    // ─────────────────────────────────────────────────────────────────────

    /**
     * A2A 标准能力发现端点。
     * 外部系统通过 GET /.well-known/agent.json 获取小云的 AgentCard。
     * 该端点<b>不需要鉴权</b>，因为 AgentCard 本身是公开的能力声明。
     */
    @GetMapping("/.well-known/agent.json")
    public AgentCard getAgentCard(HttpServletRequest request) {
        String baseUrl = request.getScheme() + "://" + request.getServerName()
                + (request.getServerPort() != 80 && request.getServerPort() != 443
                ? ":" + request.getServerPort() : "");
        log.info("[A2A] AgentCard 被发现 from={}", request.getRemoteAddr());
        return a2aProtocolService.buildAgentCard(baseUrl);
    }

    // ─────────────────────────────────────────────────────────────────────
    // ② JSON-RPC 2.0 任务入口（需鉴权）
    // ─────────────────────────────────────────────────────────────────────

    /**
     * A2A JSON-RPC 2.0 主入口。
     * 接收外部 Agent 委托的任务，支持方法：
     * <ul>
     *   <li>{@code tasks/send}  — 执行工具任务</li>
     *   <li>{@code tasks/get}   — 查询任务状态</li>
     *   <li>{@code tools/list}  — 列出所有可用工具</li>
     * </ul>
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/api/intelligence/a2a/rpc")
    public A2aResponse handleRpc(@RequestBody A2aRequest request) {
        return a2aProtocolService.handleRequest(request);
    }

    // ─────────────────────────────────────────────────────────────────────
    // ③ 状态端点（内部监控）
    // ─────────────────────────────────────────────────────────────────────

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/api/intelligence/a2a/status")
    public Result<java.util.Map<String, Object>> status(HttpServletRequest request) {
        String baseUrl = request.getScheme() + "://" + request.getServerName()
                + (request.getServerPort() != 80 && request.getServerPort() != 443
                ? ":" + request.getServerPort() : "");
        AgentCard card = a2aProtocolService.buildAgentCard(baseUrl);
        return Result.success(java.util.Map.of(
                "protocol", "A2A v1.0",
                "agentName", card.getName(),
                "skillCount", card.getSkills().size(),
                "agentCardUrl", baseUrl + "/.well-known/agent.json",
                "rpcUrl", baseUrl + "/api/intelligence/a2a/rpc"
        ));
    }
}
