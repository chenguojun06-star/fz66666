package com.fashion.supplychain.common.util;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;

/**
 * 二维码 HMAC-SHA256 签名工具
 *
 * <p>生成和验证裁剪菲号二维码的数字签名，防止伪造扫码。</p>
 *
 * <h3>QR 码格式</h3>
 * <ul>
 *   <li>无 SKU：{base}|SIG-{hmac16hex}</li>
 *   <li>有 SKU：{base}|SKU-{sku}|SIG-{hmac16hex}</li>
 * </ul>
 *
 * <h3>签名范围</h3>
 * <p>HMAC 对 {@code |SIG-} 之前的所有内容签名（包括 SKU 后缀）。</p>
 *
 * <h3>向后兼容</h3>
 * <p>过渡期内接受无签名的旧 QR 码（记录 WARN 日志），未来可通过配置强制要求签名。</p>
 *
 * @author Security Hardening
 * @since 2026-02
 */
@Component
@Slf4j
public class QrCodeSigner {

    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final String SIG_PREFIX = "|SIG-";
    private static final int SIG_HEX_LENGTH = 16; // 前16位hex = 8字节

    private final String secretKey;
    private final boolean enabled;

    public QrCodeSigner(
            @Value("${app.qrcode.hmac-secret:}") String secretKey) {
        this.secretKey = secretKey;
        this.enabled = StringUtils.hasText(secretKey);
        if (!this.enabled) {
            log.warn("[QrCodeSigner] QR HMAC 签名未启用（缺少 app.qrcode.hmac-secret 配置），"
                    + "二维码将以明文生成，存在伪造风险");
        } else {
            log.info("[QrCodeSigner] QR HMAC 签名已启用（密钥长度={}字符）", secretKey.length());
        }
    }

    /**
     * 为 QR 码内容追加 HMAC 签名。
     *
     * @param qrContent QR 码内容（不含签名），如 {@code PO123-ST001-黑色-L-50-01|SKU-...}
     * @return 带签名的 QR 码内容，如 {@code PO123-ST001-黑色-L-50-01|SKU-...|SIG-a3f8c2e91b4d7e05}；
     *         若签名未启用则原样返回
     */
    public String sign(String qrContent) {
        if (!enabled || !StringUtils.hasText(qrContent)) {
            return qrContent;
        }
        String hmac = computeHmac(qrContent);
        return qrContent + SIG_PREFIX + hmac;
    }

    /**
     * 验证 QR 码内容的 HMAC 签名。
     *
     * @param fullQrCode 完整 QR 码内容（可能含签名）
     * @return 验证结果
     */
    public VerifyResult verify(String fullQrCode) {
        if (!StringUtils.hasText(fullQrCode)) {
            return VerifyResult.invalid("QR码内容为空");
        }

        int sigIndex = fullQrCode.lastIndexOf(SIG_PREFIX);

        if (sigIndex < 0) {
            // 无签名 — 向后兼容模式
            if (enabled) {
                log.warn("[QrCodeSigner] 收到无签名QR码（过渡期允许）: {}",
                        truncateForLog(fullQrCode));
            }
            return VerifyResult.unsigned(fullQrCode);
        }

        if (!enabled) {
            // 密钥未配置但收到了带签名的QR码 — 跳过验证
            String content = fullQrCode.substring(0, sigIndex);
            return VerifyResult.ok(content);
        }

        String content = fullQrCode.substring(0, sigIndex);
        String providedSig = fullQrCode.substring(sigIndex + SIG_PREFIX.length());

        String expectedSig = computeHmac(content);

        if (expectedSig.equalsIgnoreCase(providedSig)) {
            return VerifyResult.ok(content);
        } else {
            log.error("[QrCodeSigner] QR码签名验证失败！可能被伪造: qrCode={}", truncateForLog(fullQrCode));
            return VerifyResult.invalid("二维码签名验证失败，可能被伪造");
        }
    }

    /**
     * 计算 HMAC-SHA256 并返回前 {@value SIG_HEX_LENGTH} 位 hex。
     */
    private String computeHmac(String content) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            SecretKeySpec keySpec = new SecretKeySpec(secretKey.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM);
            mac.init(keySpec);
            byte[] hash = mac.doFinal(content.getBytes(StandardCharsets.UTF_8));
            return bytesToHex(hash).substring(0, SIG_HEX_LENGTH);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            log.error("[QrCodeSigner] HMAC计算失败", e);
            throw new IllegalStateException("HMAC签名计算失败", e);
        }
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b & 0xff));
        }
        return sb.toString();
    }

    private static String truncateForLog(String s) {
        return s.length() > 60 ? s.substring(0, 60) + "..." : s;
    }

    // ========== 验证结果 ==========

    /**
     * QR 码签名验证结果。
     */
    public static class VerifyResult {
        private final Status status;
        private final String content;   // 不含签名的 QR 内容
        private final String message;

        private VerifyResult(Status status, String content, String message) {
            this.status = status;
            this.content = content;
            this.message = message;
        }

        public static VerifyResult ok(String content) {
            return new VerifyResult(Status.VALID, content, null);
        }

        public static VerifyResult unsigned(String content) {
            return new VerifyResult(Status.UNSIGNED, content, null);
        }

        public static VerifyResult invalid(String message) {
            return new VerifyResult(Status.INVALID, null, message);
        }

        /** 签名有效 */
        public boolean isValid() {
            return status == Status.VALID;
        }

        /** 无签名（旧 QR 码） */
        public boolean isUnsigned() {
            return status == Status.UNSIGNED;
        }

        /** 签名无效（伪造） */
        public boolean isInvalid() {
            return status == Status.INVALID;
        }

        /** 签名有效或无签名（可放行） */
        public boolean isAcceptable() {
            return status != Status.INVALID;
        }

        /** 获取不含签名的 QR 内容（仅 VALID/UNSIGNED 时有值） */
        public String getContent() {
            return content;
        }

        /** 获取错误消息（仅 INVALID 时有值） */
        public String getMessage() {
            return message;
        }

        public enum Status { VALID, UNSIGNED, INVALID }
    }
}
