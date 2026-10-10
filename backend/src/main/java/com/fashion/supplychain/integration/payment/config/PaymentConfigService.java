package com.fashion.supplychain.integration.payment.config;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.util.AesEncryptor;
import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.entity.PaymentConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 收款配置服务：读（解密）、写（加密）、状态展示。
 *
 * <p><b>安全口径</b>：
 * <ul>
 *   <li>密钥一律 AES-256-GCM 加密后落库，明文只在发起支付/验签的瞬间存在于内存；</li>
 *   <li>**绝不回传密钥给前端**：接口只返回"是否已设置"，前端要改就整段重填
 *       （回传掩码串既没用又容易被误存成真密钥）；</li>
 *   <li>日志里只出现渠道、租户、AppID 这类非敏感字段。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentConfigService {

    private final PaymentConfigMapper configMapper;
    private final AesEncryptor aesEncryptor;

    /* ── 读 ───────────────────────────────────────────────────────────────── */

    /** 取租户某渠道的**可运行配置**（已解密）；未配置或未启用返回 null */
    public PaymentChannelConfig load(Long tenantId, PaymentGateway.PaymentType channel) {
        if (tenantId == null || channel == null) {
            return null;
        }
        PaymentConfig cfg = configMapper.findByTenantAndChannel(tenantId, channel.name());
        if (cfg == null || !isEnabled(cfg)) {
            return null;
        }
        return decrypt(cfg);
    }

    /** 取租户某渠道的**原始配置**（密文，仅用于展示状态与编辑回填） */
    public PaymentConfig raw(Long tenantId, PaymentGateway.PaymentType channel) {
        if (tenantId == null || channel == null) {
            return null;
        }
        return configMapper.findByTenantAndChannel(tenantId, channel.name());
    }

    /** 按支付宝 AppID 反查可运行配置（回调验签用，无租户上下文） */
    public PaymentChannelConfig loadByAlipayAppId(String appId) {
        if (!StringUtils.hasText(appId)) {
            return null;
        }
        PaymentConfig cfg = configMapper.findByAlipayAppId(appId);
        return cfg == null ? null : decrypt(cfg);
    }

    /**
     * 给前端看的配置状态。
     *
     * <p>只给"有没有设置"和参数是否完整，**不含任何密钥内容**。
     */
    public Map<String, Object> describe(Long tenantId, PaymentGateway.PaymentType channel) {
        PaymentConfig cfg = raw(tenantId, channel);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("channel", channel.name());
        out.put("channelName", channel.getDisplayName());
        if (cfg == null) {
            out.put("configured", false);
            out.put("enabled", false);
            out.put("usable", false);
            out.put("missingHint", "尚未配置");
            return out;
        }
        PaymentChannelConfig runtime = decrypt(cfg);
        out.put("configured", true);
        out.put("enabled", isEnabled(cfg));
        out.put("appId", cfg.getAppId());
        out.put("mchId", cfg.getMchId());
        out.put("serialNo", cfg.getSerialNo());
        out.put("notifyUrl", cfg.getNotifyUrl());
        out.put("sandbox", Integer.valueOf(1).equals(cfg.getSandbox()));
        // 密钥只报"已设置/未设置"
        out.put("privateKeySet", StringUtils.hasText(cfg.getPrivateKeyCipher()));
        out.put("publicKeySet", StringUtils.hasText(cfg.getPublicKeyCipher()));
        out.put("apiV3KeySet", StringUtils.hasText(cfg.getApiV3KeyCipher()));
        out.put("verifiedTime", cfg.getVerifiedTime());
        out.put("usable", runtime.isUsable());
        out.put("missingHint", runtime.missingHint());
        return out;
    }

    /* ── 写 ───────────────────────────────────────────────────────────────── */

    /**
     * 保存配置（新建或更新）。
     *
     * <p><b>密钥字段的"空值"语义</b>：不传 = 保持原值（改个 notify_url 不该把私钥清空）；
     * 传 {@code "-"} = 明确清空。这样前端不必回显密钥也能安全编辑其它字段。
     */
    @Transactional(rollbackFor = Exception.class)
    public void save(Long tenantId, PaymentGateway.PaymentType channel, Map<String, Object> body) {
        if (tenantId == null) {
            throw new IllegalArgumentException("请先登录");
        }
        PaymentConfig existing = configMapper.findByTenantAndChannel(tenantId, channel.name());
        PaymentConfig patch = existing == null ? new PaymentConfig() : new PaymentConfig();
        if (existing != null) {
            patch.setId(existing.getId());
        } else {
            patch.setTenantId(tenantId);
            patch.setChannel(channel.name());
        }

        patch.setEnabled(toBool(body.get("enabled")) ? 1 : 0);
        patch.setAppId(trimToNull(body.get("appId")));
        patch.setMchId(trimToNull(body.get("mchId")));
        patch.setSerialNo(trimToNull(body.get("serialNo")));
        patch.setNotifyUrl(trimToNull(body.get("notifyUrl")));
        patch.setGatewayUrl(trimToNull(body.get("gatewayUrl")));
        patch.setSandbox(toBool(body.get("sandbox")) ? 1 : 0);

        patch.setPrivateKeyCipher(mergeSecret(existing == null ? null : existing.getPrivateKeyCipher(),
                body.get("privateKey"), "私钥"));
        patch.setPublicKeyCipher(mergeSecret(existing == null ? null : existing.getPublicKeyCipher(),
                body.get("publicKey"), "公钥"));
        patch.setApiV3KeyCipher(mergeSecret(existing == null ? null : existing.getApiV3KeyCipher(),
                body.get("apiV3Key"), "APIv3密钥"));

        if (patch.getEnabled() != null && patch.getEnabled() == 1) {
            PaymentChannelConfig runtime = decrypt(withDefaults(patch, existing));
            if (!runtime.isUsable()) {
                throw new IllegalArgumentException(
                        "启用前请补齐：" + runtime.missingHint());
            }
        }

        if (existing == null) {
            configMapper.insert(patch);
        } else {
            configMapper.updateById(patch);
        }
        // 只记非敏感字段
        log.info("[收款配置] 保存 tenant={} channel={} enabled={}", tenantId, channel, patch.getEnabled());
    }

    /** 标记连通性验证通过 */
    public void markVerified(Long tenantId, PaymentGateway.PaymentType channel) {
        PaymentConfig cfg = configMapper.findByTenantAndChannel(tenantId, channel.name());
        if (cfg == null) {
            return;
        }
        PaymentConfig patch = new PaymentConfig();
        patch.setId(cfg.getId());
        patch.setVerifiedTime(LocalDateTime.now());
        configMapper.updateById(patch);
    }

    /* ── 内部 ─────────────────────────────────────────────────────────────── */

    private static boolean isEnabled(PaymentConfig cfg) {
        return Integer.valueOf(1).equals(cfg.getEnabled());
    }

    private PaymentChannelConfig decrypt(PaymentConfig cfg) {
        return PaymentChannelConfig.builder()
                .tenantId(cfg.getTenantId())
                .channel(PaymentGateway.PaymentType.valueOf(cfg.getChannel()))
                .appId(cfg.getAppId())
                .mchId(cfg.getMchId())
                .privateKey(decryptQuietly(cfg.getPrivateKeyCipher()))
                .alipayPublicKey(decryptQuietly(cfg.getPublicKeyCipher()))
                .apiV3Key(decryptQuietly(cfg.getApiV3KeyCipher()))
                .serialNo(cfg.getSerialNo())
                .notifyUrl(cfg.getNotifyUrl())
                .gatewayUrl(cfg.getGatewayUrl())
                .sandbox(Integer.valueOf(1).equals(cfg.getSandbox()))
                .build();
    }

    /**
     * 解密密钥；解不开时**返回 null 而不是抛异常**。
     *
     * <p>解不开通常意味着换了主密钥（APP_SECURITY_PII_ENCRYPTION_KEY）。
     * 这时应该表现为"配置不可用，请重新填写"，而不是让整个支付链路 500。
     */
    private String decryptQuietly(String cipher) {
        if (!StringUtils.hasText(cipher)) {
            return null;
        }
        try {
            return aesEncryptor.decrypt(cipher);
        } catch (Exception e) {
            log.error("[收款配置] 密钥解密失败（是否更换了加密主密钥？），该渠道将不可用");
            return null;
        }
    }

    /** 保存校验用：把 patch 的明文密钥补上，得到一份完整运行态 */
    private PaymentConfig withDefaults(PaymentConfig patch, PaymentConfig existing) {
        if (existing != null) {
            if (!StringUtils.hasText(patch.getAppId())) {
                patch.setAppId(existing.getAppId());
            }
            if (!StringUtils.hasText(patch.getMchId())) {
                patch.setMchId(existing.getMchId());
            }
            if (!StringUtils.hasText(patch.getSerialNo())) {
                patch.setSerialNo(existing.getSerialNo());
            }
            if (!StringUtils.hasText(patch.getPrivateKeyCipher())) {
                patch.setPrivateKeyCipher(existing.getPrivateKeyCipher());
            }
            if (!StringUtils.hasText(patch.getPublicKeyCipher())) {
                patch.setPublicKeyCipher(existing.getPublicKeyCipher());
            }
            if (!StringUtils.hasText(patch.getApiV3KeyCipher())) {
                patch.setApiV3KeyCipher(existing.getApiV3KeyCipher());
            }
        }
        return patch;
    }

    /**
     * 密钥字段合并：null/空 = 保持原值；"-" = 清空；其余 = 加密后覆盖。
     */
    private String mergeSecret(String existingCipher, Object incoming, String label) {
        if (incoming == null) {
            return existingCipher;
        }
        String v = String.valueOf(incoming).trim();
        if (v.isEmpty()) {
            return existingCipher;
        }
        if ("-".equals(v)) {
            return null;
        }
        if (v.length() > 8000) {
            throw new IllegalArgumentException(label + "内容过长（是否贴错了？）");
        }
        return aesEncryptor.encrypt(v);
    }

    private static boolean toBool(Object v) {
        if (v == null) {
            return false;
        }
        if (v instanceof Boolean b) {
            return b;
        }
        String s = String.valueOf(v).trim();
        return "true".equalsIgnoreCase(s) || "1".equals(s) || "on".equalsIgnoreCase(s);
    }

    private static String trimToNull(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    /** 供编排器判断"这家商户是否已具备收款能力"（不加载密钥） */
    public boolean anyChannelReady(Long tenantId) {
        for (PaymentGateway.PaymentType t : PaymentGateway.PaymentType.values()) {
            PaymentChannelConfig c = load(tenantId, t);
            if (c != null && c.isUsable()) {
                return true;
            }
        }
        return false;
    }

    /** 清理该租户的配置（仅测试与运维用） */
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long tenantId, PaymentGateway.PaymentType channel) {
        configMapper.delete(new LambdaQueryWrapper<PaymentConfig>()
                .eq(PaymentConfig::getTenantId, tenantId)
                .eq(PaymentConfig::getChannel, channel.name()));
    }
}
