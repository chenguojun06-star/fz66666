package com.fashion.supplychain.integration.payment.channel;

import lombok.extern.slf4j.Slf4j;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/**
 * RSA2（SHA256withRSA）签名/验签工具 —— 支付宝用。
 *
 * <p><b>为什么不引 alipay-sdk</b>：本项目构建走离线仓库（{@code mvn -o}），
 * 新增依赖会直接卡住构建；而支付宝网关协议本身很简单（排序拼串 → RSA2 签名 →
 * 表单 POST → JSON 响应），用 JDK 自带的 {@code java.security} 实现既够用又可控。
 * 微信支付则直接用已在依赖里的官方 {@code wechatpay-java}。
 *
 * <p><b>密钥格式宽容处理</b>：商家从开放平台复制出来的密钥常常带
 * {@code -----BEGIN PRIVATE KEY-----} 头尾与换行，也可能不带。这里统一剥掉
 * 头尾与空白后再 Base64 解码，避免"格式差一点点就签不出来"这种最难查的问题。
 */
@Slf4j
public final class RsaSignUtil {

    private RsaSignUtil() {
    }

    /** 去掉 PEM 头尾与所有空白，得到纯 Base64 */
    public static String stripPem(String key) {
        if (key == null) {
            return null;
        }
        return key.replaceAll("-----BEGIN [A-Z ]+-----", "")
                .replaceAll("-----END [A-Z ]+-----", "")
                .replaceAll("\\s", "");
    }

    /** 载入 PKCS#8 私钥（支付宝应用私钥 / 微信商户私钥都是 PKCS#8） */
    public static PrivateKey loadPrivateKey(String privateKey) {
        try {
            byte[] der = Base64.getDecoder().decode(stripPem(privateKey));
            return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der));
        } catch (Exception e) {
            throw new IllegalArgumentException("私钥格式不正确（需 PKCS#8，RSA）：" + e.getMessage(), e);
        }
    }

    /** 载入 X.509 公钥（支付宝公钥） */
    public static PublicKey loadPublicKey(String publicKey) {
        try {
            byte[] der = Base64.getDecoder().decode(stripPem(publicKey));
            return KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
        } catch (Exception e) {
            throw new IllegalArgumentException("公钥格式不正确（需 X.509，RSA）：" + e.getMessage(), e);
        }
    }

    /** RSA2 签名 → Base64 */
    public static String sign(String content, String privateKey) {
        try {
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initSign(loadPrivateKey(privateKey));
            signature.update(content.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(signature.sign());
        } catch (Exception e) {
            throw new IllegalArgumentException("签名失败：" + e.getMessage(), e);
        }
    }

    /** RSA2 验签（签名是 Base64 文本） */
    public static boolean verify(String content, String signBase64, String publicKey) {
        try {
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initVerify(loadPublicKey(publicKey));
            signature.update(content.getBytes(StandardCharsets.UTF_8));
            return signature.verify(Base64.getDecoder().decode(signBase64));
        } catch (Exception e) {
            // 验签失败一律当"不通过"：宁可拒绝真回调（可重试），也不能放过伪造回调
            log.warn("[支付验签] 验签异常，按不通过处理：{}", e.getMessage());
            return false;
        }
    }
}
