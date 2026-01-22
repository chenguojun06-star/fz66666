package com.fashion.supplychain.wechat.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

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
