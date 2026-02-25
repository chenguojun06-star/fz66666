package com.fashion.supplychain.wechat.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

@Component
public class WeChatMiniProgramClient {

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
            return Code2SessionResult.fail("调用微信接口失败");
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
                return Code2SessionResult.fail(msg);
            }
            if (!StringUtils.hasText(openid)) {
                return Code2SessionResult.fail("未获取到openid");
            }
            Code2SessionResult ok = Code2SessionResult.ok();
            ok.setOpenid(openid);
            ok.setSessionKey(sessionKey);
            ok.setUnionid(unionid);
            return ok;
        } catch (Exception e) {
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
            return null;
        }
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
}
