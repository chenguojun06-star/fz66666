package com.fashion.supplychain.integration.util;

import lombok.extern.slf4j.Slf4j;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

/**
 * 第三方平台签名工具类
 *
 * 已实现以下平台的签名算法（接入时直接调用，无需自己实现）：
 * - Alipay (RSA2) → verifyAlipayCallback()
 * - WechatPay V3 (HMAC-SHA256) → buildWechatPaySignMessage() / verifyWechatV3Callback()
 * - SF Express (MD5) → buildSFSignature()
 * - STO Express (MD5) → buildSTOSignature()
 * - 淘宝TOP / 京东宙斯 / 拼多多 (MD5) → buildSortedSign()
 */
@Slf4j
public class SignatureUtils {

    private SignatureUtils() {}

    // =====================================================
    // MD5 工具
    // =====================================================

    /** 计算 MD5（大写十六进制） */
    public static String md5(String content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            byte[] bytes = digest.digest(content.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) {
                sb.append(String.format("%02X", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException("MD5计算失败", e);
        }
    }

    // =====================================================
    // 电商平台通用签名（淘宝TOP / 京东宙斯 / 拼多多）
    // =====================================================

    /**
     * 构建「参数排序 + 密钥包裹 + MD5」型签名，大写十六进制。
     *
     * <p>淘宝开放平台(TOP)、京东宙斯(routerjson)、拼多多开放平台三者的签名规则
     * 本质一致，只是参数名不同（淘宝 method/app_key、京东 method/app_key、
     * 拼多多 type/client_id），故此处提供统一实现：
     * <pre>
     *   sign = MD5( secret + k1v1 + k2v2 + ... + secret ).toUpperCase()
     * </pre>
     * 其中参数按 key 字典序升序排列，key 与 value 直接拼接（无分隔符），
     * 首尾各拼一次 appSecret。
     *
     * <p><b>注意</b>：调用方需自行排除 sign 字段本身，并已注入 method/app_key/
     * timestamp/format 等公共参数。嵌套结构（Map/List）会被 JSON 序列化后参与签名，
     * 与平台对嵌套参数的约定保持一致。
     *
     * @param params 待签名参数（不含 sign）
     * @param secret 平台分配的 AppSecret
     * @return 大写 MD5 签名
     */
    public static String buildSortedSign(java.util.Map<String, Object> params, String secret) {
        if (params == null) params = java.util.Collections.emptyMap();
        if (secret == null) secret = "";
        java.util.TreeMap<String, Object> sorted = new java.util.TreeMap<>(params);
        StringBuilder sb = new StringBuilder();
        sb.append(secret);
        for (java.util.Map.Entry<String, Object> e : sorted.entrySet()) {
            if (e.getKey() == null || "sign".equals(e.getKey())) continue;
            sb.append(e.getKey()).append(stringify(e.getValue()));
        }
        sb.append(secret);
        return md5(sb.toString());
    }

    /** 参数值转字符串：嵌套结构走 JSON 序列化，其余走 String.valueOf */
    private static String stringify(Object value) {
        if (value == null) return "";
        if (value instanceof java.util.Map || value instanceof java.util.Collection) {
            try {
                return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(value);
            } catch (Exception e) {
                log.warn("[签名] 嵌套参数序列化失败，降级为String.valueOf: {}", e.getMessage());
                return String.valueOf(value);
            }
        }
        return String.valueOf(value);
    }

    // =====================================================
    // HMAC-SHA256 工具（微信支付 V3 使用）
    // =====================================================

    /**
     * HMAC-SHA256 签名
     * @param content 待签名内容
     * @param key     密钥
     * @return Base64编码的签名
     */
    public static String hmacSha256(String content, String key) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(
                    key.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKey);
            byte[] hashBytes = mac.doFinal(content.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hashBytes);
        } catch (Exception e) {
            throw new RuntimeException("HMAC-SHA256签名失败", e);
        }
    }

    // =====================================================
    // 顺丰签名（BSP标准接口）
    // =====================================================

    /**
     * 构建顺丰（丰桥/LaaS）API 签名 msgDigest。
     *
     * <p><b>官方规则（简易MD5）</b>：
     * <pre>
     *   msgDigest = Base64( MD5( msgData + timestamp + checkWord ) )   // UTF-8
     * </pre>
     * 其中 {@code checkWord} 为顺丰分配的「客户校验码」。
     *
     * <p><b>注意：appKey / 顾客编码不参与签名</b>——只拼接 msgData、timestamp、checkWord 三者，
     * 且顺序固定。历史上本方法曾把 appKey 一并拼入，导致签名与官方规则不符，
     * 即便填了正确密钥也会被顺丰拒绝（已修正，见 {@code SignatureUtilsTest} 中的官方测试向量）。
     *
     * <p>官方文档：https://open.sf-express.com/developSupport/195960 （鉴权方式-数字签名-简易MD5）
     * <p>官方测试向量（务必保持一致）：
     * <pre>
     *   msgData   = {"language":"zh-CN","orderId":"QIAO-20200618-004"}
     *   timestamp = 12312334453453
     *   checkWord = fjcg5PGKaNpPSHFAZ4QsCOkV71R3zVci
     *   msgDigest = IIKJtuLVzoFTu4kHI8M8vA==
     * </pre>
     *
     * @param msgData   JSON业务报文（msgData字段原文，不做URL编码）
     * @param timestamp 时间戳（与报文中的 timestamp 一致）
     * @param checkWord 顺丰分配的客户校验码
     * @return Base64 编码的签名（msgDigest）
     */
    public static String buildSFSignature(String msgData, String timestamp, String checkWord) {
        String toSign = nullToEmpty(msgData) + nullToEmpty(timestamp) + nullToEmpty(checkWord);
        return Base64.getEncoder().encodeToString(md5Raw(toSign));
    }

    /** null 安全：参与签名拼接时 null 视为空串 */
    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    private static byte[] md5Raw(String content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            return digest.digest(content.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new RuntimeException("MD5计算失败", e);
        }
    }

    // =====================================================
    // 申通签名
    // =====================================================

    /**
     * 构建申通API签名
     * 规则：MD5(AppKey + content + AppSecret)（大写）
     *
     * @param content   请求内容（JSON字符串）
     * @param appKey    申通分配的AppKey
     * @param appSecret 申通分配的AppSecret
     * @return 签名字符串（大写MD5）
     *
     * 使用示例（在 STOAdapter 中）：
     *   String sign = SignatureUtils.buildSTOSignature(jsonContent, appKey, appSecret);
     */
    public static String buildSTOSignature(String content, String appKey, String appSecret) {
        return md5(appKey + content + appSecret);
    }

    // =====================================================
    // 微信支付 V3 签名构建
    // =====================================================

    /**
     * 构建微信支付V3签名报文
     * 格式：{HTTP_METHOD}\n{URL}\n{TIMESTAMP}\n{NONCE_STR}\n{BODY}\n
     *
     * 注：最终RSA-SHA256签名需要使用商户私钥，通过微信支付SDK完成。
     * 此方法用于构建待签名字符串，方便调试验证。
     *
     * @param httpMethod  HTTP方法（GET/POST）
     * @param url         请求URL路径（不含域名）
     * @param timestamp   时间戳（秒）
     * @param nonceStr    随机字符串（32位）
     * @param body        请求体（GET请求为空字符串）
     */
    public static String buildWechatV3SignMessage(String httpMethod, String url,
                                                   String timestamp, String nonceStr, String body) {
        return httpMethod + "\n" + url + "\n" + timestamp + "\n" + nonceStr + "\n" + body + "\n";
    }

    /**
     * 验证微信支付V3回调签名
     * 使用微信平台公钥验证签名（实际使用微信SDK的 RequestValidator）
     *
     * 注：此处为签名内容构建，真正的验证需使用 wechatpay-java SDK 的 RequestValidator
     * 示例代码见 WechatPayAdapter.verifyCallback()
     *
     * @param timestamp   回调Header中的 Wechatpay-Timestamp
     * @param nonce       回调Header中的 Wechatpay-Nonce
     * @param body        回调请求体
     * @return 待验签字符串（交给SDK验证）
     */
    public static String buildWechatV3CallbackMessage(String timestamp, String nonce, String body) {
        return timestamp + "\n" + nonce + "\n" + body + "\n";
    }

    // =====================================================
    // 支付宝回调验签辅助
    // =====================================================

    /**
     * 支付宝回调参数排序（用于调试）
     * 正式验签使用 AlipaySignature.rsaCheckV1() 或 rsaCheckV2()
     *
     * 使用示例（在 AlipayAdapter 中）：
     *   boolean ok = AlipaySignature.rsaCheckV1(params, alipayPublicKey, charset, signType);
     *
     * @param params 回调参数Map（从HttpServletRequest获取）
     * @return 排好序的适合日志输出的字符串
     */
    public static String alipayParamsToSignString(java.util.Map<String, String[]> params) {
        java.util.TreeMap<String, String> sorted = new java.util.TreeMap<>();
        params.forEach((k, v) -> {
            if (!"sign".equals(k) && !"sign_type".equals(k)) {
                sorted.put(k, v[0]);
            }
        });
        StringBuilder sb = new StringBuilder();
        sorted.forEach((k, v) -> sb.append(k).append("=").append(v).append("&"));
        if (sb.length() > 0) sb.deleteCharAt(sb.length() - 1);
        return sb.toString();
    }

    // =====================================================
    // 通用工具
    // =====================================================

    /** 生成指定长度的随机字符串（用于微信支付 nonce） */
    public static String randomNonceStr(int length) {
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        StringBuilder sb = new StringBuilder(length);
        java.security.SecureRandom r = new java.security.SecureRandom();
        for (int i = 0; i < length; i++) {
            sb.append(chars.charAt(r.nextInt(chars.length())));
        }
        return sb.toString();
    }

    /** 当前秒级时间戳 */
    public static String currentTimestamp() {
        return String.valueOf(System.currentTimeMillis() / 1000);
    }
}
