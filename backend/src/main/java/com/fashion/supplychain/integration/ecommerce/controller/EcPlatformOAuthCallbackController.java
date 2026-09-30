package com.fashion.supplychain.integration.ecommerce.controller;

import com.fashion.supplychain.integration.ecommerce.helper.EcPlatformOAuthHelper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.Map;

/**
 * D-587 平台 OAuth 授权回调（匿名端点，平台把商家浏览器重定向到这里）。
 *
 * <p>安全设计：不依赖登录态；callback 带发起授权时落库的一次性 state，
 * 校验通过才换 token，state 在成功后被清空不可重放。之后 302 回前端平台详情页，
 * 由前端轮询 auth-status 展示结果。换 token 失败也 302（带失败消息），不回裸 JSON。
 *
 * <p>注意：与 {@link PlatformConnectorController} 分开建类，
 * 因为后者类级 @PreAuthorize(isAuthenticated()) 会拦掉匿名回调。
 */
@Slf4j
@RestController
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class EcPlatformOAuthCallbackController {

    @Autowired
    private EcPlatformOAuthHelper ecPlatformOAuthHelper;

    @GetMapping("/api/platform-connector/oauth/callback/{platformCode}")
    public ResponseEntity<String> callback(
            @PathVariable String platformCode,
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(name = "error", required = false) String platformError) {

        log.info("[EcOAuth] 收到平台回调: platform={}, hasCode={}, state={}", platformCode, code != null, state);

        Map<String, Object> result;
        if (platformError != null && !platformError.isBlank()) {
            result = Map.of("success", false, "message", "平台拒绝授权: " + platformError);
        } else {
            result = ecPlatformOAuthHelper.handleCallback(platformCode, code, state);
        }

        boolean success = Boolean.TRUE.equals(result.get("success"));
        String message = String.valueOf(result.getOrDefault("message", success ? "授权成功" : "授权失败"));
        String target = ecPlatformOAuthHelper.frontendRedirect(platformCode, success, message);

        String html = "<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<title>授权" + (success ? "成功" : "结果") + "</title></head><body>"
                + "<p>" + (success ? "店铺授权成功" : "授权失败：" + escape(message)) + "，正在返回系统…</p>"
                + "<script>setTimeout(function(){ window.location.replace(" + jsString(target) + "); }, 600);</script>"
                + "</body></html>";
        return ResponseEntity.status(302)
                .location(URI.create(target))
                .contentType(MediaType.TEXT_HTML)
                .body(html);
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static String jsString(String s) {
        String safe = s.replace("\\", "\\\\").replace("'", "\\'").replace("<", "\\x3c").replace(">", "\\x3e");
        return "'" + safe + "'";
    }
}
