package com.fashion.supplychain.integration.sync.adapter;

import com.fashion.supplychain.integration.sync.dto.EcSyncContext;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import com.fashion.supplychain.integration.util.SignatureUtils;
import lombok.extern.slf4j.Slf4j;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 电商平台 API 调用与响应校验公共支持类
 *
 * <p>抽出本类的直接原因：此前各平台适配器存在两类系统性缺陷——
 * <ol>
 *   <li><b>缺签名</b>：只把 app_key 塞进 payload 就发请求，淘宝/京东/拼多多
 *       均强制校验 sign 参数，真实平台会直接拒绝；</li>
 *   <li><b>假成功</b>：调用后不解析响应，只要 HTTP 通了就 {@code synced++}、
 *       {@code return true}。平台返回 error_response 时系统仍报"同步成功"，
 *       用户看到的是假象，数据其实没同步出去。</li>
 * </ol>
 * 现在所有平台适配器统一走本类：签名由 {@link SignatureUtils#buildSortedSign} 计算，
 * 结果由 {@link #isSuccess} 判定，杜绝"HTTP 200 即成功"的误判。
 *
 * <p>三平台签名规则一致（参数排序 + 密钥包裹 + MD5 大写），差异仅在参数名：
 * 淘宝用 method/app_key，京东用 method/app_key，拼多多用 type/client_id。
 */
@Slf4j
public final class EcPlatformApiSupport {

    private static final DateTimeFormatter TS_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** 淘宝/京东 的方法参数名 */
    public static final String METHOD_KEY = "method";
    /** 拼多多 的方法参数名 */
    public static final String TYPE_KEY = "type";

    private EcPlatformApiSupport() {}

    /**
     * 发起一次带签名的平台 API 调用。
     *
     * <p>自动注入公共参数（app_key/client_id、timestamp、format、v、sign_method、
     * access_token），计算 sign 后 POST，并校验响应是否真实成功。
     *
     * @param http      HTTP 客户端
     * @param apiUrl    平台网关地址
     * @param ctx       同步上下文（含 appId/appSecret/accessToken）
     * @param methodKey 方法参数名（淘宝京东 "method"、拼多多 "type"）
     * @param method    具体 API 方法名，如 taobao.item.quantity.update
     * @param bizParams 业务参数（不含公共参数与 sign）
     * @return 平台响应；调用失败或返回 error_response 时抛 {@link PlatformApiException}
     */
    public static Map<String, Object> call(IntegrationHttpClient http, String apiUrl,
                                           EcSyncContext ctx, String methodKey,
                                           String method, Map<String, Object> bizParams) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put(methodKey, method);
        params.put("app_key", ctx.getAppId());
        params.put("client_id", ctx.getAppId());
        params.put("timestamp", LocalDateTime.now().format(TS_FMT));
        params.put("format", "json");
        params.put("v", "2.0");
        params.put("sign_method", "md5");
        if (ctx.getAccessToken() != null && !ctx.getAccessToken().isBlank()) {
            params.put("session", ctx.getAccessToken());
            params.put("access_token", ctx.getAccessToken());
        }
        if (bizParams != null) {
            params.putAll(bizParams);
        }
        params.put("sign", SignatureUtils.buildSortedSign(params, ctx.getAppSecret()));

        Map<String, Object> resp = http.postJson(apiUrl, params, Map.class);
        if (!isSuccess(resp)) {
            String err = extractError(resp);
            log.warn("[平台API] 调用被拒绝 method={} 原因={}", method, err);
            throw new PlatformApiException(err);
        }
        return resp != null ? resp : Collections.emptyMap();
    }

    /**
     * 判定平台响应是否真实成功。
     *
     * <p>判定顺序：
     * <ol>
     *   <li>响应为 null → 失败；</li>
     *   <li>含 error_response 节点 → 失败（淘宝/京东/拼多多统一的错误结构）；</li>
     *   <li>顶层含 error_code/error_msg 且 error_code 非 0 → 失败；</li>
     *   <li>顶层含 code 且非 0 且非 200 → 失败。</li>
     * </ol>
     * 这样即使平台返回 HTTP 200，只要业务上是错的，也会被判为失败。
     */
    public static boolean isSuccess(Map<String, Object> resp) {
        if (resp == null || resp.isEmpty()) {
            return false;
        }
        // 标准错误结构：{ error_response: { code, msg, sub_code, sub_msg, zh_desc, en_desc, error_msg } }
        if (resp.get("error_response") instanceof Map) {
            return false;
        }
        // 少数接口把错误码平铺在顶层
        Object errCode = resp.get("error_code");
        if (errCode != null && !"0".equals(String.valueOf(errCode))) {
            return false;
        }
        Object code = resp.get("code");
        if (code instanceof Number && ((Number) code).longValue() != 0L) {
            return false;
        }
        return true;
    }

    /**
     * 提取平台错误信息，用于日志与前端提示。
     *
     * <p>兼容各平台字段命名差异：msg / sub_msg / error_msg / zh_desc / en_desc / message。
     */
    public static String extractError(Map<String, Object> resp) {
        if (resp == null) {
            return "平台无响应（网络失败或熔断中）";
        }
        Object errNode = resp.get("error_response");
        if (errNode instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> err = (Map<String, Object>) errNode;
            StringBuilder sb = new StringBuilder();
            appendIfPresent(sb, err, "code", "错误码");
            appendIfPresent(sb, err, "msg");
            appendIfPresent(sb, err, "sub_msg");
            appendIfPresent(sb, err, "error_msg");
            appendIfPresent(sb, err, "zh_desc");
            appendIfPresent(sb, err, "en_desc");
            return sb.length() > 0 ? sb.toString() : "平台返回错误但无错误信息";
        }
        StringBuilder sb = new StringBuilder();
        appendIfPresent(sb, resp, "error_code", "错误码");
        appendIfPresent(sb, resp, "error_msg");
        appendIfPresent(sb, resp, "msg");
        appendIfPresent(sb, resp, "message");
        appendIfPresent(sb, resp, "code", "错误码");
        return sb.length() > 0 ? sb.toString() : "平台响应校验失败";
    }

    private static void appendIfPresent(StringBuilder sb, Map<String, Object> map, String key) {
        appendIfPresent(sb, map, key, null);
    }

    private static void appendIfPresent(StringBuilder sb, Map<String, Object> map, String key, String label) {
        Object v = map.get(key);
        if (v == null) return;
        String s = String.valueOf(v);
        if (s.isBlank()) return;
        if (sb.length() > 0) sb.append(" | ");
        if (label != null) sb.append(label).append("=");
        sb.append(s);
    }

    /** 平台 API 业务级异常（区别于网络异常，表示平台明确拒绝了请求） */
    public static class PlatformApiException extends RuntimeException {
        public PlatformApiException(String message) {
            super(message);
        }
    }
}
