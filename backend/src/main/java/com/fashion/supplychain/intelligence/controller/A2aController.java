package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenSubject;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.service.A2aProtocolService;
import com.fashion.supplychain.intelligence.service.A2aProtocolService.A2aRequest;
import com.fashion.supplychain.intelligence.service.A2aProtocolService.A2aResponse;
import com.fashion.supplychain.intelligence.service.A2aProtocolService.AgentCard;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.integration.openapi.orchestration.TenantAppOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
public class A2aController {

    private final A2aProtocolService a2aProtocolService;
    private final TenantAppOrchestrator tenantAppOrchestrator;
    private final AuthTokenService authTokenService;

    private static final Duration A2A_TOKEN_TTL = Duration.ofHours(24);
    private static final long SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000; // 5分钟

    @GetMapping("/.well-known/agent.json")
    public AgentCard getAgentCard(HttpServletRequest request) {
        String baseUrl = request.getScheme() + "://" + request.getServerName()
                + (request.getServerPort() != 80 && request.getServerPort() != 443
                ? ":" + request.getServerPort() : "");
        log.info("[A2A] AgentCard discovered from={}", request.getRemoteAddr());
        return a2aProtocolService.buildAgentCard(baseUrl);
    }

    @PostMapping("/api/intelligence/a2a/token")
    public Result<Map<String, Object>> getA2aToken(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature) {

        try {
            long ts = Long.parseLong(timestamp);
            if (Math.abs(System.currentTimeMillis() - ts * 1000) > SIGNATURE_TOLERANCE_MS) {
                log.warn("[A2A/token] 签名时间戳过期: appKey={} timestamp={}", appKey, timestamp);
                return Result.fail("签名时间戳过期");
            }
        } catch (NumberFormatException e) {
            log.warn("[A2A/token] 时间戳格式错误: appKey={} timestamp={}", appKey, timestamp);
            return Result.fail("时间戳格式错误");
        }

        TenantApp app;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, "");
        } catch (SecurityException e) {
            log.warn("[A2A/token] signature verify failed appKey={} reason={}", appKey, e.getMessage());
            return Result.fail("签名验证失败：" + e.getMessage());
        }

        TokenSubject subject = new TokenSubject();
        subject.setUserId("a2a-bot-" + app.getTenantId());
        subject.setUsername("a2a-" + app.getAppName());
        subject.setRoleId("a2a");
        subject.setRoleName("A2A_SERVICE");
        subject.setTenantId(app.getTenantId());
        subject.setTenantOwner(false);
        subject.setSuperAdmin(false);
        subject.setPermissionRange("app");
        subject.setOpenid("appKey:" + app.getAppKey());

        String token = authTokenService.issueToken(subject, A2A_TOKEN_TTL);

        log.info("[A2A/token] issued appKey={} appName={} tenantId={} expiresIn={}h",
                appKey, app.getAppName(), app.getTenantId(), A2A_TOKEN_TTL.toHours());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("a2aToken", token);
        result.put("expiresIn", (int) A2A_TOKEN_TTL.toSeconds());
        result.put("tokenType", "Bearer");
        result.put("usage", "Authorization: Bearer <a2aToken>  →  POST /api/intelligence/a2a/rpc");

        return Result.success(result);
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/api/intelligence/a2a/rpc")
    public A2aResponse handleRpc(@RequestBody A2aRequest request) {
        return a2aProtocolService.handleRequest(request);
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/api/intelligence/a2a/status")
    public Result<Map<String, Object>> status(HttpServletRequest request) {
        String baseUrl = request.getScheme() + "://" + request.getServerName()
                + (request.getServerPort() != 80 && request.getServerPort() != 443
                ? ":" + request.getServerPort() : "");
        AgentCard card = a2aProtocolService.buildAgentCard(baseUrl);
        return Result.success(Map.of(
                "protocol", "A2A v1.0",
                "agentName", card.getName(),
                "skillCount", card.getSkills().size(),
                "agentCardUrl", baseUrl + "/.well-known/agent.json",
                "rpcUrl", baseUrl + "/api/intelligence/a2a/rpc"
        ));
    }
}
