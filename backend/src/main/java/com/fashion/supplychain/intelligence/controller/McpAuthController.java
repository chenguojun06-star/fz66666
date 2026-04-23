package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenSubject;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.integration.openapi.orchestration.TenantAppOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * MCP 开放鉴权控制器
 *
 * <p>外部 MCP 客户端（Cursor / Claude Desktop / n8n）首先通过此端点
 * 将 appKey + HMAC-SHA256 签名换取一个长效 mcpToken（默认 90 天），
 * 后续调用 {@code /api/intelligence/mcp/*} 时携带该 token 即可，无需
 * 每次重新计算签名。
 *
 * <p><b>端点路径</b>：{@code POST /api/intelligence/mcp/token}（已在 SecurityConfig 中 permitAll）
 *
 * <p><b>请求头</b>：
 * <ul>
 *   <li>{@code X-App-Key} — 在「系统 → 开放API → 我的应用」中获取</li>
 *   <li>{@code X-Timestamp} — 当前 Unix 毫秒时间戳（字符串）</li>
 *   <li>{@code X-Signature} — HMAC-SHA256(appSecret, timestamp)，小写十六进制</li>
 * </ul>
 *
 * <p><b>响应</b>：
 * <pre>{@code
 * {
 *   "code": 200,
 *   "data": {
 *     "mcpToken": "eyJ...",
 *     "expiresIn": 7776000,
 *     "tokenType": "Bearer",
 *     "usage": "Authorization: Bearer <mcpToken>"
 *   }
 * }
 * }</pre>
 */
@RestController
@RequestMapping("/api/intelligence/mcp")
@RequiredArgsConstructor
@Slf4j
public class McpAuthController {

    private final TenantAppOrchestrator tenantAppOrchestrator;
    private final AuthTokenService authTokenService;

    /** MCP Token 有效期：90 天（外部工具链接频率低，长期有效更友好） */
    private static final Duration MCP_TOKEN_TTL = Duration.ofDays(90);

    /**
     * 用 appKey + HMAC 签名换取 MCP Bearer Token
     *
     * <p>签名算法：{@code HMAC-SHA256(appSecret, timestamp + "")}
     * — body 为空串，与 openapi 签名规则一致。
     */
    @PostMapping("/token")
    public Result<Map<String, Object>> getMcpToken(
            @RequestHeader("X-App-Key") String appKey,
            @RequestHeader("X-Timestamp") String timestamp,
            @RequestHeader("X-Signature") String signature) {

        // 1. 验证 appKey + HMAC 签名（复用 openapi 鉴权逻辑）
        TenantApp app;
        try {
            app = tenantAppOrchestrator.authenticateByAppKey(appKey, signature, timestamp, "");
        } catch (SecurityException e) {
            log.warn("[MCP/token] 签名验证失败 appKey={} reason={}", appKey, e.getMessage());
            return Result.fail("签名验证失败：" + e.getMessage());
        }

        // 2. 构造 TokenSubject（MCP Bot 身份：租户下虚拟服务账号）
        TokenSubject subject = new TokenSubject();
        subject.setUserId("mcp-bot-" + app.getTenantId());     // 虚拟用户ID，不对应真实 t_user
        subject.setUsername("mcp-" + app.getAppName());         // 可读名称，日志可识别
        subject.setRoleId("mcp");
        subject.setRoleName("MCP_SERVICE");
        subject.setTenantId(app.getTenantId());
        subject.setTenantOwner(false);
        subject.setSuperAdmin(false);
        subject.setPermissionRange("all");                       // MCP 工具需要全量数据访问
        // factoryId 不设，表示"全租户视角"（与租户主账号相同权限范围）

        // 3. 签发长效 JWT（90天）
        String token = authTokenService.issueToken(subject, MCP_TOKEN_TTL);

        log.info("[MCP/token] 签发成功 appKey={} appName={} tenantId={} expiresIn={}d",
                appKey, app.getAppName(), app.getTenantId(), MCP_TOKEN_TTL.toDays());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("mcpToken", token);
        result.put("expiresIn", (int) MCP_TOKEN_TTL.toSeconds());
        result.put("tokenType", "Bearer");
        result.put("usage", "Authorization: Bearer <mcpToken>  →  POST /api/intelligence/mcp/tools/call");

        return Result.success(result);
    }
}
