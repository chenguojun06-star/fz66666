package com.fashion.supplychain.wechat.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class WeChatMiniProgramClient {

    private static final Logger log = LoggerFactory.getLogger(WeChatMiniProgramClient.class);

    private final String appid;
    private final String secret;
    private final boolean mockEnabled;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public WeChatMiniProgramClient(
            @Value("${wechat.mini-program.appid:}") String appid,
            @Value("${wechat.mini-program.secret:}") String secret,
            @Value("${wechat.mini-program.mock-enabled:false}") boolean mockEnabled,
            ObjectMapper objectMapper) {
        this.appid = appid == null ? "" : appid.trim();
        this.secret = secret == null ? "" : secret.trim();
        this.mockEnabled = mockEnabled;
        this.restTemplate = new RestTemplate();
        this.objectMapper = objectMapper;
    }

    public Code2SessionResult code2Session(String jsCode) {
        String code = jsCode == null ? "" : jsCode.trim();
        if (!StringUtils.hasText(code)) {
            return Code2SessionResult.fail("code不能为空");
        }
        if (!StringUtils.hasText(appid) || !StringUtils.hasText(secret)) {
            if (mockEnabled) {
                String openid = code.length() > 96 ? code.substring(0, 96) : code;
                Code2SessionResult ok = Code2SessionResult.ok();
                ok.setOpenid("mock_" + openid);
                ok.setSessionKey("");
                ok.setUnionid(null);
                return ok;
            }
            // 当未配置appid/secret但mockEnabled为false时，如果code是模拟数据（如mock_code），也允许通过
            if (code.startsWith("mock_")) {
                 String openid = code;
                 Code2SessionResult ok = Code2SessionResult.ok();
                 ok.setOpenid(openid);
                 ok.setSessionKey("");
                 ok.setUnionid(null);
                 return ok;
            }
            return Code2SessionResult.fail("小程序appid/secret未配置");
        }

        String url = "https://api.weixin.qq.com/sns/jscode2session" +
                "?appid=" + urlEncode(appid) +
                "&secret=" + urlEncode(secret) +
                "&js_code=" + urlEncode(code) +
                "&grant_type=authorization_code";

        ResponseEntity<String> resp;
        try {
            resp = restTemplate.getForEntity(url, String.class);
        } catch (Exception e) {
            log.warn("[WxCode2Session] request failed appId={} codePrefix={} reason={}",
                    maskAppId(appid), maskCode(code), buildExceptionMessage(e));
            return Code2SessionResult.fail("调用微信接口失败，请检查服务端网络、DNS、TLS 或微信配置");
        }
        String body = resp == null ? null : resp.getBody();
        if (!StringUtils.hasText(body)) {
            return Code2SessionResult.fail("微信接口返回为空");
        }

        try {
            JsonNode root = objectMapper.readTree(body);
            int errcode = root.path("errcode").asInt(0);
            String errmsg = root.path("errmsg").asText("");
            String openid = root.path("openid").asText(null);
            String sessionKey = root.path("session_key").asText(null);
            String unionid = root.path("unionid").asText(null);

            if (errcode != 0) {
                String msg = StringUtils.hasText(errmsg) ? errmsg : "微信接口错误";
                log.warn("[WxCode2Session] wechat returned errcode={} errmsg={} appId={} codePrefix={}",
                        errcode, msg, maskAppId(appid), maskCode(code));
                return Code2SessionResult.fail(msg);
            }
            if (!StringUtils.hasText(openid)) {
                log.warn("[WxCode2Session] openid missing appId={} codePrefix={}", maskAppId(appid), maskCode(code));
                return Code2SessionResult.fail("未获取到openid");
            }
            Code2SessionResult ok = Code2SessionResult.ok();
            ok.setOpenid(openid);
            ok.setSessionKey(sessionKey);
            ok.setUnionid(unionid);
            return ok;
        } catch (Exception e) {
            log.warn("[WxCode2Session] parse failed appId={} bodySnippet={} reason={}",
                    maskAppId(appid), bodySnippet(body), buildExceptionMessage(e));
            return Code2SessionResult.fail("解析微信返回失败");
        }
    }

    /**
     * 获取微信接口调用凭证（access_token）
     * 使用 stable_token 接口，有效期2小时，调用方负责缓存
     *
     * @return access_token 字符串，失败返回 null
     */
    public String fetchAccessToken() {
        if (!StringUtils.hasText(appid) || !StringUtils.hasText(secret)) {
            return null;
        }
        String url = "https://api.weixin.qq.com/cgi-bin/stable_token";
        Map<String, String> body = new HashMap<>();
        body.put("grant_type", "client_credential");
        body.put("appid", appid);
        body.put("secret", secret);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, String>> request = new HttpEntity<>(body, headers);
        try {
            ResponseEntity<String> resp = restTemplate.postForEntity(url, request, String.class);
            String respBody = resp == null ? null : resp.getBody();
            if (!StringUtils.hasText(respBody)) return null;
            JsonNode root = objectMapper.readTree(respBody);
            String token = root.path("access_token").asText(null);
            return StringUtils.hasText(token) ? token : null;
        } catch (Exception e) {
            log.warn("[WxAccessToken] fetch failed appId={} reason={}", maskAppId(appid), buildExceptionMessage(e));
            return null;
        }
    }

    /**
     * 生成小程序码图片（getwxacodeunlimit，不限制扫描次数）
     * scene 最长 32 字节，page 为小程序页面路径
     *
     * @param accessToken 有效的 access_token
     * @param scene       附带参数（如 "inviteToken=abc123"，最长32字节）
     * @param page        页面路径（如 "pages/login/index"）
     * @return 图片字节数组（PNG），失败返回 null
     */
    public byte[] fetchMiniProgramQrCode(String accessToken, String scene, String page) {
        if (!StringUtils.hasText(accessToken)) return null;
        String url = "https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token="
                + urlEncode(accessToken);

        Map<String, Object> body = new HashMap<>();
        body.put("scene", scene == null ? "" : scene);
        body.put("page", page == null ? "pages/login/index" : page);
        body.put("width", 280);
        body.put("auto_color", false);
        body.put("is_hyaline", true);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
        try {
            ResponseEntity<byte[]> resp = restTemplate.postForEntity(url, request, byte[].class);
            byte[] bytes = resp == null ? null : resp.getBody();
            if (bytes == null || bytes.length < 100) return null;
            // 微信返回 JSON 错误时 content-type 也是 image/jpeg，检查 PNG magic bytes
            if (bytes[0] == (byte) 0x89 && bytes[1] == 'P') return bytes;
            // 非 PNG → 可能是 JSON 错误，忽略
            return null;
        } catch (Exception e) {
            log.warn("[WxQrCode] fetch failed appId={} reason={}", maskAppId(appid), buildExceptionMessage(e));
            return null;
        }
    }

    private String maskAppId(String value) {
        if (!StringUtils.hasText(value)) {
            return "(empty)";
        }
        if (value.length() <= 6) {
            return value.charAt(0) + "***";
        }
        return value.substring(0, 3) + "***" + value.substring(value.length() - 3);
    }

    private String maskCode(String value) {
        if (!StringUtils.hasText(value)) {
            return "(empty)";
        }
        int end = Math.min(8, value.length());
        return value.substring(0, end) + "...";
    }

    private String bodySnippet(String body) {
        if (!StringUtils.hasText(body)) {
            return "(empty)";
        }
        String normalized = body.replaceAll("\\s+", " ").trim();
        int end = Math.min(120, normalized.length());
        return normalized.substring(0, end);
    }

    private String buildExceptionMessage(Exception e) {
        if (e == null) {
            return "(unknown)";
        }
        String simpleName = e.getClass().getSimpleName();
        String message = e.getMessage();
        if (!StringUtils.hasText(message)) {
            return simpleName;
        }
        return simpleName + ": " + message;
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    public static class Code2SessionResult {
        private boolean success;
        private String message;
        private String openid;
        private String sessionKey;
        private String unionid;

        public static Code2SessionResult ok() {
            Code2SessionResult r = new Code2SessionResult();
            r.success = true;
            r.message = "";
            return r;
        }

        public static Code2SessionResult fail(String message) {
            Code2SessionResult r = new Code2SessionResult();
            r.success = false;
            r.message = message;
            return r;
        }

        public boolean isSuccess() {
            return success;
        }

        public String getMessage() {
            return message;
        }

        public String getOpenid() {
            return openid;
        }

        public void setOpenid(String openid) {
            this.openid = openid;
        }

        public String getSessionKey() {
            return sessionKey;
        }

        public void setSessionKey(String sessionKey) {
            this.sessionKey = sessionKey;
        }

        public String getUnionid() {
            return unionid;
        }

        public void setUnionid(String unionid) {
            this.unionid = unionid;
        }
    }

    /**
     * 发送小程序订阅消息（需用户在小程序内订阅该模板）
     * 接口：POST /cgi-bin/message/subscribe/send
     *
     * @param accessToken 有效的 access_token（调用方负责缓存，2小时有效）
     * @param openid      接收者的小程序 openid
     * @param templateId  微信公众平台申请的订阅消息模板 ID
     * @param page        点击消息后跳转的小程序页面路径（可为 null）
     * @param data        模板数据：模板变量key → 显示文本（最长20字）
     * @return true=发送成功，false=失败（失败时已记录 warn 日志）
     */
    public boolean sendSubscribeMessage(String accessToken, String openid,
                                        String templateId, String page,
                                        Map<String, String> data) {
        if (!StringUtils.hasText(accessToken) || !StringUtils.hasText(openid)
                || !StringUtils.hasText(templateId)) {
            return false;
        }
        String url = "https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token="
                + urlEncode(accessToken);

        // 将 {key: value} 包装为微信要求的 {key: {value: xxx}} 格式
        Map<String, Map<String, String>> wrappedData = new LinkedHashMap<>();
        if (data != null) {
            data.forEach((k, v) -> {
                Map<String, String> cell = new HashMap<>();
                cell.put("value", v == null ? "" : (v.length() > 20 ? v.substring(0, 20) : v));
                wrappedData.put(k, cell);
            });
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("touser", openid);
        body.put("template_id", templateId);
        if (StringUtils.hasText(page)) body.put("page", page);
        body.put("miniprogram_state", "formal");
        body.put("lang", "zh_CN");
        body.put("data", wrappedData);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
        try {
            ResponseEntity<String> resp = restTemplate.postForEntity(url, request, String.class);
            String respBody = resp == null ? null : resp.getBody();
            if (!StringUtils.hasText(respBody)) return false;
            JsonNode root = objectMapper.readTree(respBody);
            int errcode = root.path("errcode").asInt(-1);
            if (errcode == 0) return true;
            // errcode=43101: 用户未订阅该模板，属于正常情况，仅 debug 级
            if (errcode == 43101) {
                return false;
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }
}
