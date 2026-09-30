package com.fashion.supplychain.integration.ecommerce.helper;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * D-587 电商平台店铺 OAuth 授权服务。
 *
 * <p>对标聚水潭的「点一下跳平台授权」体验：商家在我们系统里点「去平台授权」→
 * 跳到平台登录/确认页 → 平台携带 code 回调我们 → 后端用 code 换 access_token/refresh_token 落库。
 * 前提是商家已在平台开放平台创建应用（自用型应用免费、无需上架审核）并把回调地址配成我们的 callback。
 *
 * <p>各平台 token 接口都是 OAuth2 授权码模式的变体，差异在参数名（client_id vs client_key）
 * 与响应格式（JSON vs form），用 {@link PlatformOAuthSpec} 注册表收敛。
 * 不支持 OAuth 的平台（微信小店/SHEIN/聚水潭）走 CREDENTIAL 手工凭证模式。
 *
 * <p><b>D-664</b>：由 {@code EcPlatformOAuthService}
 * （{@code integration.ecommerce.service}）更名并移入
 * {@code integration.ecommerce.helper}。本类是 OAuth2 授权码流程的工具实现
 * （拼授权 URL → 换 token → 落库）；对 {@code EcPlatformConfigService} 的依赖是
 * **围绕配置表的读写**（读 appKey/appSecret、写回 access/refresh token），
 * 属工具协作而非跨业务服务编排，故不适用规则7（同 D-658 / D-660）。
 */
@Slf4j
@Service
public class EcPlatformOAuthHelper {

    /** 平台 OAuth 端点规格 */
    record PlatformOAuthSpec(
            String authorizeUrl,
            String tokenUrl,
            String clientIdParam,
            String clientSecretParam,
            boolean tokenResponseJson
    ) {}

    private static final Map<String, PlatformOAuthSpec> OAUTH_SPECS = new LinkedHashMap<>();

    static {
        OAUTH_SPECS.put("PINDUODUO", new PlatformOAuthSpec(
                "https://open.pinduoduo.com/oauth/authorize",
                "https://open.pinduoduo.com/oauth/token",
                "client_id", "client_secret", true));
        OAUTH_SPECS.put("DOUYIN", new PlatformOAuthSpec(
                "https://open.jinritemai.com/oauth/authorize",
                "https://open.jinritemai.com/oauth/token",
                "client_key", "client_secret", true));
        OAUTH_SPECS.put("TAOBAO", new PlatformOAuthSpec(
                "https://oauth.taobao.com/authorize",
                "https://oauth.taobao.com/token",
                "client_id", "client_secret", false));
        OAUTH_SPECS.put("TMALL", new PlatformOAuthSpec(
                "https://oauth.taobao.com/authorize",
                "https://oauth.taobao.com/token",
                "client_id", "client_secret", false));
        OAUTH_SPECS.put("JD", new PlatformOAuthSpec(
                "https://oauth.jd.com/oauth/authorize",
                "https://oauth.jd.com/token",
                "client_id", "client_secret", false));
        OAUTH_SPECS.put("KUAISHOU", new PlatformOAuthSpec(
                "https://open.kwaixiaodon.com/oauth/authorize",
                "https://open.kwaixiaodon.com/oauth/token",
                "client_id", "client_secret", true));
        OAUTH_SPECS.put("XIAOHONGSHU", new PlatformOAuthSpec(
                "https://open.xiaohongshu.com/oauth/authorize",
                "https://open.xiaohongshu.com/oauth/token",
                "client_id", "client_secret", true));
    }

    public static boolean isOAuthPlatform(String platformCode) {
        return platformCode != null && OAUTH_SPECS.containsKey(platformCode);
    }

    @Autowired
    private EcPlatformConfigService ecPlatformConfigService;

    @Autowired
    private IntegrationHttpClient httpClient;

    @Value("${app.public-base-url:https://api.webyszl.cn}")
    private String publicBaseUrl;

    @Value("${app.frontend-base-url:https://www.webyszl.cn}")
    private String frontendBaseUrl;

    private String callbackUrl(String platformCode) {
        String base = publicBaseUrl == null ? "" : publicBaseUrl.trim();
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base + "/api/platform-connector/oauth/callback/" + platformCode;
    }

    public String frontendRedirect(String platformCode, boolean success, String message) {
        String base = frontendBaseUrl == null ? "" : frontendBaseUrl.trim();
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base + "/ecommerce-platform/" + platformCode
                + (success ? "?auth=success" : "?auth=failed&message=" + enc(message));
    }

    private static String enc(String s) {
        if (s == null) return "";
        try {
            return java.net.URLEncoder.encode(s, java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * 生成跳转平台的授权 URL。要求该租户此平台已配置 appKey（自用型应用的 client_id）。
     * state 落库用于回调时校验（兼做跨租户寻址：回调是匿名的，靠 state 找回配置行）。
     */
    public Map<String, Object> buildAuthorizeUrl(Long tenantId, String platformCode) {
        PlatformOAuthSpec spec = OAUTH_SPECS.get(platformCode);
        if (spec == null) {
            throw new IllegalArgumentException("该平台不支持跳转授权，请使用凭证接入: " + platformCode);
        }
        EcPlatformConfig config = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);
        if (config == null || !hasText(config.getAppKey()) || !hasText(config.getAppSecret())) {
            throw new IllegalArgumentException("请先填写该平台的 AppKey 与 AppSecret（自用型应用的 client_id / client_secret）");
        }

        String state = UUID.randomUUID().toString().replace("-", "");
        config.setAuthState(state);
        config.setAuthMode("OAUTH");
        ecPlatformConfigService.updateById(config);

        String redirectUri = callbackUrl(platformCode);
        StringBuilder url = new StringBuilder(spec.authorizeUrl())
                .append(spec.authorizeUrl().contains("?") ? '&' : '?')
                .append(spec.clientIdParam()).append('=').append(enc(config.getAppKey()))
                .append("&response_type=code")
                .append("&redirect_uri=").append(enc(redirectUri))
                .append("&state=").append(enc(state));
        String scope = oauthScope(platformCode);
        if (hasText(scope)) {
            url.append("&scope=").append(enc(scope));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("authorizeUrl", url.toString());
        result.put("callbackUrl", redirectUri);
        result.put("state", state);
        return result;
    }

    private static String oauthScope(String platformCode) {
        // 各平台 scope 取默认即可（自用型应用默认全店铺权限），个别平台需要显式 scope 时在此追加
        return switch (platformCode) {
            case "XIAOHONGSHU" -> "item.marketing";
            default -> null;
        };
    }

    /**
     * 平台回调（匿名）：按 state 找回配置行，校验后用 code 换 token 落库。
     */
    public Map<String, Object> handleCallback(String platformCode, String code, String state) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platformCode", platformCode);
        if (!hasText(code) || !hasText(state)) {
            result.put("success", false);
            result.put("message", "回调缺少 code 或 state");
            return result;
        }
        EcPlatformConfig config = ecPlatformConfigService.getByAuthState(state);
        if (config == null || !platformCode.equals(config.getPlatformCode())) {
            result.put("success", false);
            result.put("message", "授权状态已失效，请重新发起授权");
            return result;
        }
        if (!hasText(config.getAuthState()) || !config.getAuthState().equals(state)) {
            result.put("success", false);
            result.put("message", "授权状态校验失败，请重新发起授权");
            return result;
        }
        try {
            applyTokenExchange(config, code);
            result.put("success", true);
            result.put("shopName", config.getShopName());
        } catch (Exception e) {
            log.error("[EcOAuth] code 换 token 失败: platform={}, err={}", platformCode, e.getMessage());
            result.put("success", false);
            result.put("message", "授权码换取令牌失败: " + e.getMessage());
        }
        return result;
    }

    /**
     * 手动粘贴授权码（登录态）：部分平台回调 URL 配置不便时，用户把平台给的 code 粘进来换 token。
     */
    public Map<String, Object> exchangeManually(Long tenantId, String platformCode, String code) {
        TenantAssert.assertTenantContext();
        EcPlatformConfig config = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);
        if (config == null) {
            throw new IllegalArgumentException("请先保存该平台的接入配置");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platformCode", platformCode);
        try {
            applyTokenExchange(config, code);
            result.put("success", true);
        } catch (Exception e) {
            log.error("[EcOAuth] 手动换 token 失败: platform={}, err={}", platformCode, e.getMessage());
            result.put("success", false);
            result.put("message", "授权码换取令牌失败: " + e.getMessage());
        }
        return result;
    }

    /** 用授权码换 token 并落库（PDD/抖店/淘宝等 OAuth2 授权码模式） */
    private void applyTokenExchange(EcPlatformConfig config, String code) {
        PlatformOAuthSpec spec = OAUTH_SPECS.get(config.getPlatformCode());
        if (spec == null) {
            throw new IllegalArgumentException("该平台不支持 OAuth 授权");
        }
        Map<String, String> form = new LinkedHashMap<>();
        form.put("grant_type", "authorization_code");
        form.put("code", code);
        form.put("redirect_uri", callbackUrl(config.getPlatformCode()));
        form.put(spec.clientIdParam(), config.getAppKey());
        form.put(spec.clientSecretParam(), config.getAppSecret());

        Map<String, Object> resp;
        if (spec.tokenResponseJson()) {
            resp = httpClient.postForm(spec.tokenUrl(), form, Map.class);
        } else {
            String raw = httpClient.postForm(spec.tokenUrl(), form, String.class);
            resp = parseFormResponse(raw);
        }
        String accessToken = str(resp != null ? resp.get("access_token") : null);
        if (!hasText(accessToken)) {
            String err = str(resp != null ? resp.get("error") : null);
            String errMsg = str(resp != null ? resp.get("error_description") : null);
            throw new IllegalStateException(hasText(errMsg) ? errMsg : (hasText(err) ? err : "平台未返回 access_token"));
        }
        config.setAccessToken(accessToken);
        String refresh = str(resp.get("refresh_token"));
        if (hasText(refresh)) {
            config.setRefreshToken(refresh);
        }
        Long expiresInSeconds = longOf(resp.get("expires_in"));
        if (expiresInSeconds != null && expiresInSeconds > 0) {
            config.setTokenExpiresAt(LocalDateTime.now().plusSeconds(expiresInSeconds));
        }
        Long refreshExpiresInSeconds = longOf(resp.get("refresh_token_expires_in"));
        if (refreshExpiresInSeconds == null) {
            refreshExpiresInSeconds = longOf(resp.get("expires_in"));
            if (refreshExpiresInSeconds != null) {
                refreshExpiresInSeconds *= 30; // 平台不给刷新有效期时按 30 倍兜底（PDD 刷新令牌远长于访问令牌）
            }
        }
        if (refreshExpiresInSeconds != null && refreshExpiresInSeconds > 0) {
            config.setRefreshExpiresAt(LocalDateTime.now().plusSeconds(refreshExpiresInSeconds));
        }
        config.setAuthorizedAt(LocalDateTime.now());
        config.setAuthState(null);
        config.setAuthMode("OAUTH");
        config.setStatus("ACTIVE");
        ecPlatformConfigService.updateById(config);
        log.info("[EcOAuth] 平台授权成功: platform={}, tenant={}", config.getPlatformCode(), config.getTenantId());
    }

    /**
     * 刷新令牌（供定时任务调用）。可刷新且距过期不足 7 天才刷新；失败不抛出只记日志。
     */
    public boolean refreshTokenIfDue(EcPlatformConfig config) {
        PlatformOAuthSpec spec = OAUTH_SPECS.get(config.getPlatformCode());
        if (spec == null || !hasText(config.getRefreshToken())) {
            return false;
        }
        LocalDateTime due = config.getTokenExpiresAt();
        if (due == null || due.isAfter(LocalDateTime.now().plusDays(7))) {
            return false;
        }
        try {
            Map<String, String> form = new LinkedHashMap<>();
            form.put("grant_type", "refresh_token");
            form.put("refresh_token", config.getRefreshToken());
            form.put(spec.clientIdParam(), config.getAppKey());
            form.put(spec.clientSecretParam(), config.getAppSecret());
            Map<String, Object> resp;
            if (spec.tokenResponseJson()) {
                resp = httpClient.postForm(spec.tokenUrl(), form, Map.class);
            } else {
                resp = parseFormResponse(httpClient.postForm(spec.tokenUrl(), form, String.class));
            }
            String accessToken = str(resp != null ? resp.get("access_token") : null);
            if (!hasText(accessToken)) {
                log.warn("[EcOAuth] 刷新令牌未返回 access_token: platform={}, tenant={}",
                        config.getPlatformCode(), config.getTenantId());
                return false;
            }
            config.setAccessToken(accessToken);
            String refresh = str(resp.get("refresh_token"));
            if (hasText(refresh)) {
                config.setRefreshToken(refresh);
            }
            Long expiresInSeconds = longOf(resp.get("expires_in"));
            if (expiresInSeconds != null && expiresInSeconds > 0) {
                config.setTokenExpiresAt(LocalDateTime.now().plusSeconds(expiresInSeconds));
            }
            config.setUpdatedAt(LocalDateTime.now());
            ecPlatformConfigService.updateById(config);
            log.info("[EcOAuth] 令牌已刷新: platform={}, tenant={}", config.getPlatformCode(), config.getTenantId());
            return true;
        } catch (Exception e) {
            log.warn("[EcOAuth] 刷新令牌失败（不阻断）: platform={}, tenant={}, err={}",
                    config.getPlatformCode(), config.getTenantId(), e.getMessage());
            return false;
        }
    }

    /**
     * 授权状态汇总（向导第三步轮询用）
     */
    public Map<String, Object> authStatus(Long tenantId, String platformCode) {
        EcPlatformConfig config = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("platformCode", platformCode);
        result.put("oauthSupported", isOAuthPlatform(platformCode));
        boolean authorized = config != null && hasText(config.getAccessToken());
        result.put("authorized", authorized);
        if (config != null) {
            result.put("authMode", config.getAuthMode());
            result.put("shopName", config.getShopName());
            result.put("shopCode", config.getShopCode());
            result.put("authorizedAt", config.getAuthorizedAt());
            result.put("tokenExpiresAt", config.getTokenExpiresAt());
            boolean expiring = config.getTokenExpiresAt() != null
                    && config.getTokenExpiresAt().isBefore(LocalDateTime.now().plusDays(7));
            result.put("tokenExpiringSoon", expiring);
        }
        return result;
    }

    /** 解析 form 形式的 token 响应（淘宝/京东） */
    private static Map<String, Object> parseFormResponse(String raw) {
        Map<String, Object> map = new LinkedHashMap<>();
        if (!hasText(raw)) return map;
        for (String pair : raw.split("&")) {
            int idx = pair.indexOf('=');
            if (idx <= 0) continue;
            String k = pair.substring(0, idx);
            String v = pair.substring(idx + 1);
            try {
                map.put(k, java.net.URLDecoder.decode(v, java.nio.charset.StandardCharsets.UTF_8));
            } catch (Exception e) {
                map.put(k, v);
            }
        }
        return map;
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Long longOf(Object o) {
        if (o == null) return null;
        try {
            return Long.parseLong(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
