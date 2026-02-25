package com.fashion.supplychain.wechat.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.wechat.orchestration.WeChatMiniProgramAuthOrchestrator;
import javax.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/wechat/mini-program")
public class WeChatMiniProgramAuthController {

    @Autowired
    private WeChatMiniProgramAuthOrchestrator weChatMiniProgramAuthOrchestrator;

    @PostMapping("/login")
    public Result<?> login(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        String code = body == null ? null : (String) body.get("code");
        String username = body == null ? null : (String) body.get("username");
        String password = body == null ? null : (String) body.get("password");
        Long tenantId = null;
        if (body != null && body.get("tenantId") != null) {
            try { tenantId = Long.valueOf(body.get("tenantId").toString()); } catch (NumberFormatException ignored) {}
        }

        Map<String, Object> result = weChatMiniProgramAuthOrchestrator.login(code, username, password, tenantId);
        boolean success = (Boolean) result.getOrDefault("success", false);
        boolean needBind = (Boolean) result.getOrDefault("needBind", false);
        String openid = result.get("openid") == null ? null : String.valueOf(result.get("openid"));
        String identity = safeTrim(username);
        if (identity == null) {
            String o = safeTrim(openid);
            identity = o == null ? "wechat" : ("openid:" + o);
        }
        String status = success && !needBind ? "SUCCESS" : "FAILED";
        String msg = success ? (needBind ? "需要绑定账号" : "登录成功")
                : safeTrim((String) result.getOrDefault("message", "登录失败"));
        weChatMiniProgramAuthOrchestrator.recordLoginAttempt(
                safeTrim(identity),
                resolveClientIp(request),
                request == null ? null : request.getHeader("User-Agent"),
                status,
                msg);
        if (success && !needBind) {
            return Result.success(result);
        }
        if (needBind) {
            return Result.fail(400, "需要绑定账号", result);
        }
        return Result.fail((String) result.getOrDefault("message", "登录失败"));
    }

    // ======================== 邀请二维码 ========================

    /**
     * 生成邀请员工的小程序码（需要登录，租户管理员使用）
     * POST /api/wechat/mini-program/invite/generate
     * Body 可带 tenantId / tenantName，不带则从当前登录上下文读取
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/invite/generate")
    public Result<?> generateInvite(@RequestBody(required = false) Map<String, Object> body) {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        String tenantName = null;
        if (body != null) {
            if (body.get("tenantId") != null) {
                try { tenantId = Long.valueOf(body.get("tenantId").toString()); } catch (NumberFormatException ignored) {}
            }
            if (body.get("tenantName") != null) {
                tenantName = body.get("tenantName").toString();
            }
        }
        if (tenantId == null) {
            return Result.fail("无法确定租户ID，请确保已登录");
        }
        Map<String, Object> result = weChatMiniProgramAuthOrchestrator.generateInviteQrCode(tenantId, tenantName);
        return Result.success(result);
    }

    /**
     * 解析邀请 token，返回租户信息（小程序扫码后调用，无需登录）
     * GET /api/wechat/mini-program/invite/info?token=xxx
     */
    @GetMapping("/invite/info")
    public Result<?> inviteInfo(@RequestParam String token) {
        Map<String, Object> info = weChatMiniProgramAuthOrchestrator.resolveInviteToken(token);
        if (info == null) {
            return Result.fail("邀请链接不存在或已过期");
        }
        return Result.success(info);
    }

    private static String resolveClientIp(HttpServletRequest request) {
        if (request == null) {
            return null;
        }

        String[] headerNames = new String[] { "X-Forwarded-For", "X-Real-IP", "Proxy-Client-IP",
                "WL-Proxy-Client-IP" };
        for (String h : headerNames) {
            String v = request.getHeader(h);
            if (v == null || v.isBlank() || "unknown".equalsIgnoreCase(v)) {
                continue;
            }
            String first = v.split(",")[0];
            String ip = first == null ? null : first.trim();
            if (ip != null && !ip.isBlank() && !"unknown".equalsIgnoreCase(ip)) {
                return ip;
            }
        }
        return request.getRemoteAddr();
    }

    private static String safeTrim(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
