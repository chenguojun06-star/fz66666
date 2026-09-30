package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.AuthTokenService;
import com.fashion.supplychain.common.TokenSubject;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.service.A2aProtocolService;
import com.fashion.supplychain.intelligence.service.A2aProtocolService.A2aRequest;
import com.fashion.supplychain.intelligence.service.A2aProtocolService.A2aResponse;
import com.fashion.supplychain.intelligence.service.A2aProtocolService.AgentCard;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.integration.openapi.orchestration.TenantAppOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A2A（Agent-to-Agent）协议编排层
 *
 * <p>覆盖 AgentCard 发现、应用签名换取 A2A Token、JSON-RPC 处理、协议状态。
 * {@code A2aController} 原先直接注入 {@code A2aProtocolService} + {@code AuthTokenService}
 * （D-630 规则6 违规），现由本层承接；Controller 只保留「取 baseUrl（传输层）→ 委托」。
 *
 * <p><b>返回 {@link Result}：</b>与重构前 Controller 直接返回 {@code Result} 的语义逐字一致。
 */
@Slf4j
@Service
public class A2aOrchestrator {

    /** A2A Token 有效期 */
    private static final Duration A2A_TOKEN_TTL = Duration.ofHours(24);

    /** 签名时间戳容忍窗口：5 分钟 */
    private static final long SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

    @Autowired
    private A2aProtocolService a2aProtocolService;

    @Autowired
    private TenantAppOrchestrator tenantAppOrchestrator;

    @Autowired
    private AuthTokenService authTokenService;

    /** 构造 AgentCard（技能清单 + 协议元信息）。 */
    public AgentCard buildAgentCard(String baseUrl) {
        return a2aProtocolService.buildAgentCard(baseUrl);
    }

    /**
     * 用应用密钥 + 签名换取 A2A Token。
     *
     * <p>三道校验：时间戳未过期 → 签名验证通过 → 签发 24h Token。
     *
     * @return {@code a2aToken / expiresIn / tokenType / usage}；失败返回中文提示
     */
    public Result<Map<String, Object>> issueToken(String appKey, String timestamp, String signature) {
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

    /** 处理 JSON-RPC 请求（initialize / tools/list / tools/call 等）。 */
    public A2aResponse handleRpc(A2aRequest request) {
        return a2aProtocolService.handleRequest(request);
    }

    /** 协议状态自述（供对端探活）。 */
    public Result<Map<String, Object>> status(String baseUrl) {
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
