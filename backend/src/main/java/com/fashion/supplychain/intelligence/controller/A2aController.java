package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.orchestration.A2aOrchestrator;
import com.fashion.supplychain.intelligence.service.A2aProtocolService.A2aRequest;
import com.fashion.supplychain.intelligence.service.A2aProtocolService.A2aResponse;
import com.fashion.supplychain.intelligence.service.A2aProtocolService.AgentCard;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

/**
 * A2A（Agent-to-Agent）协议入口。
 *
 * <p>本类只做「取 baseUrl（传输层）→ 调 Orchestrator → 组装响应」。
 * AgentCard 构建、签名换 Token、JSON-RPC 处理都在 {@link A2aOrchestrator}，
 * 原先直接注入的 A2aProtocolService / AuthTokenService 已下沉（D-630 规则6）。
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class A2aController {

    private final A2aOrchestrator a2aOrchestrator;

    @GetMapping("/.well-known/agent.json")
    public AgentCard getAgentCard(HttpServletRequest request) {
        log.info("[A2A] AgentCard discovered from={}", request.getRemoteAddr());
        return a2aOrchestrator.buildAgentCard(baseUrlOf(request));
    }

    @PostMapping("/api/intelligence/a2a/token")
    public Result<Map<String, Object>> getA2aToken(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature) {
        return a2aOrchestrator.issueToken(appKey, timestamp, signature);
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/api/intelligence/a2a/rpc")
    public A2aResponse handleRpc(@RequestBody A2aRequest request) {
        return a2aOrchestrator.handleRpc(request);
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/api/intelligence/a2a/status")
    public Result<Map<String, Object>> status(HttpServletRequest request) {
        return a2aOrchestrator.status(baseUrlOf(request));
    }

    /** 由请求推导对外可访问的 baseUrl（兼容 80/443 默认端口不显式拼接）。 */
    private static String baseUrlOf(HttpServletRequest request) {
        return request.getScheme() + "://" + request.getServerName()
                + (request.getServerPort() != 80 && request.getServerPort() != 443
                ? ":" + request.getServerPort() : "");
    }
}
