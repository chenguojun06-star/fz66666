package com.fashion.supplychain.wechat.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.wechat.orchestration.WeChatH5AuthOrchestrator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/wechat/h5")
public class WeChatH5AuthController {

    private static final Logger log = LoggerFactory.getLogger(WeChatH5AuthController.class);

    @Autowired
    private WeChatH5AuthOrchestrator h5AuthOrchestrator;

    @GetMapping("/jssdk-config")
    public Result<?> getJsSdkConfig(@RequestParam String url) {
        try {
            Map<String, Object> config = h5AuthOrchestrator.generateJsSdkConfig(url);
            return Result.success(config);
        } catch (Exception e) {
            return Result.fail("获取JS-SDK配置失败：" + e.getMessage());
        }
    }

    @PostMapping("/oauth-login")
    public Result<?> oauthLogin(@RequestBody Map<String, Object> body) {
        String code = body == null ? null : (String) body.get("code");
        if (code == null || code.isBlank()) {
            return Result.fail("缺少授权码code");
        }
        try {
            Map<String, Object> result = h5AuthOrchestrator.oauthLogin(code);
            boolean success = (Boolean) result.getOrDefault("success", false);
            boolean needBind = (Boolean) result.getOrDefault("needBind", false);
            if (success && !needBind) {
                return Result.success(result);
            }
            if (needBind) {
                return Result.fail(400, "需要绑定账号", result);
            }
            return Result.fail((String) result.getOrDefault("message", "登录失败"));
        } catch (Exception e) {
            return Result.fail("微信登录失败：" + e.getMessage());
        }
    }

    @PostMapping("/bind-login")
    public Result<?> bindLogin(@RequestBody Map<String, Object> body) {
        String openid = body == null ? null : (String) body.get("openid");
        String username = body == null ? null : (String) body.get("username");
        String password = body == null ? null : (String) body.get("password");
        Long tenantId = null;
        if (body != null && body.get("tenantId") != null) {
            try { tenantId = Long.valueOf(body.get("tenantId").toString()); } catch (NumberFormatException e) { log.warn("Invalid tenantId format in bind-login: {}", body.get("tenantId")); }
        }
        if (openid == null || openid.isBlank()) {
            return Result.fail("缺少openid");
        }
        if (username == null || username.isBlank() || password == null || password.isBlank()) {
            return Result.fail("用户名和密码不能为空");
        }
        try {
            Map<String, Object> result = h5AuthOrchestrator.bindAndLogin(openid, username, password, tenantId);
            boolean success = (Boolean) result.getOrDefault("success", false);
            if (success) {
                return Result.success(result);
            }
            return Result.fail((String) result.getOrDefault("message", "绑定登录失败"));
        } catch (Exception e) {
            return Result.fail("绑定登录失败：" + e.getMessage());
        }
    }
}
