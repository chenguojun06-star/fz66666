package com.fashion.supplychain.integration.payment.config;

import com.fashion.supplychain.common.util.AesEncryptor;
import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.entity.PaymentConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 收款配置服务单测。
 *
 * <p>要守住的口径：
 * <ol>
 *   <li><b>密钥绝不明文落库</b>（存的是 AES-GCM 密文）；</li>
 *   <li><b>密钥绝不回传前端</b>（只报"是否已设置"）；</li>
 *   <li>密钥字段留空 = 保持原值（改个回调地址不该把私钥清空），传 "-" 才是清空；</li>
 *   <li>启用但参数不全 → **拒绝保存并说清缺什么**（宁可不让启用，也不能收不了钱还显示"已开启"）。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PaymentConfigServiceTest {

    @Mock
    private PaymentConfigMapper configMapper;

    /** 用真实例：加解密本身就是要验证的东西 */
    private final AesEncryptor aesEncryptor = new AesEncryptor("unit-test-key-please-change-123456");

    private PaymentConfigService service() {
        return new PaymentConfigService(configMapper, aesEncryptor);
    }

    private PaymentConfig existing(boolean enabled) {
        PaymentConfig cfg = new PaymentConfig();
        cfg.setId(1L);
        cfg.setTenantId(9L);
        cfg.setChannel("ALIPAY");
        cfg.setEnabled(enabled ? 1 : 0);
        cfg.setAppId("2021000000000000");
        cfg.setPrivateKeyCipher(aesEncryptor.encrypt("OLD_PRIVATE_KEY"));
        cfg.setPublicKeyCipher(aesEncryptor.encrypt("OLD_PUBLIC_KEY"));
        return cfg;
    }

    private static Map<String, Object> body(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return m;
    }

    /* ── 加密落库 ─────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("① 密钥加密落库：库里存的是密文，且能解回原文")
    void secretsAreEncrypted() {
        when(configMapper.findByTenantAndChannel(9L, "ALIPAY")).thenReturn(null);
        PaymentConfigService svc = service();

        svc.save(9L, PaymentGateway.PaymentType.ALIPAY, body(
                "enabled", false,
                "appId", "2021000000000000",
                "privateKey", "MY_PRIVATE_KEY",
                "publicKey", "ALIPAY_PUBLIC_KEY"));

        ArgumentCaptor<PaymentConfig> cap = ArgumentCaptor.forClass(PaymentConfig.class);
        verify(configMapper).insert(cap.capture());
        PaymentConfig saved = cap.getValue();

        assertNotEquals("MY_PRIVATE_KEY", saved.getPrivateKeyCipher(), "私钥绝不能明文落库");
        assertEquals("MY_PRIVATE_KEY", aesEncryptor.decrypt(saved.getPrivateKeyCipher()));
        assertEquals("ALIPAY_PUBLIC_KEY", aesEncryptor.decrypt(saved.getPublicKeyCipher()));
    }

    @Test
    @DisplayName("② 密钥字段留空 = 保持原值；传 \"-\" = 清空")
    void secretMergeSemantics() {
        when(configMapper.findByTenantAndChannel(9L, "ALIPAY")).thenReturn(existing(false));
        PaymentConfigService svc = service();

        // 只改回调地址，不传密钥 → 私钥保持
        svc.save(9L, PaymentGateway.PaymentType.ALIPAY, body("notifyUrl", "https://x/api/webhook/payment/alipay"));
        ArgumentCaptor<PaymentConfig> cap = ArgumentCaptor.forClass(PaymentConfig.class);
        verify(configMapper).updateById(cap.capture());
        assertEquals("OLD_PRIVATE_KEY", aesEncryptor.decrypt(cap.getValue().getPrivateKeyCipher()),
                "没传密钥时不该把已存的私钥清掉");

        // 明确传 "-" → 清空
        svc.save(9L, PaymentGateway.PaymentType.ALIPAY, body("privateKey", "-"));
        ArgumentCaptor<PaymentConfig> cap2 = ArgumentCaptor.forClass(PaymentConfig.class);
        verify(configMapper, org.mockito.Mockito.times(2)).updateById(cap2.capture());
        assertNull(cap2.getAllValues().get(1).getPrivateKeyCipher());
    }

    /* ── 启用校验 ─────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("③ 启用但参数不全 → 拒绝保存，并说清缺什么")
    void cannotEnableIncompleteConfig() {
        when(configMapper.findByTenantAndChannel(9L, "WECHAT_PAY")).thenReturn(null);
        PaymentConfigService svc = service();

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> svc.save(
                9L, PaymentGateway.PaymentType.WECHAT_PAY,
                body("enabled", true, "appId", "wx123", "mchId", "1600000000")));

        assertTrue(e.getMessage().contains("启用前请补齐"), "实际：" + e.getMessage());
        assertTrue(e.getMessage().contains("商户私钥"), "要说清缺私钥，实际：" + e.getMessage());
        verify(configMapper, never()).insert(any(PaymentConfig.class));
    }

    @Test
    @DisplayName("④ 微信参数齐全时可以启用；支付宝缺公钥则不行（公钥是验签用的，缺了收不到结果）")
    void enableRequiresChannelSpecificFields() {
        when(configMapper.findByTenantAndChannel(9L, "WECHAT_PAY")).thenReturn(null);
        PaymentConfigService svc = service();

        svc.save(9L, PaymentGateway.PaymentType.WECHAT_PAY, body(
                "enabled", true, "appId", "wx123", "mchId", "1600000000",
                "serialNo", "SERIAL", "privateKey", "PK", "apiV3Key", "V3KEY"));
        verify(configMapper).insert(any(PaymentConfig.class));

        when(configMapper.findByTenantAndChannel(9L, "ALIPAY")).thenReturn(null);
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> svc.save(
                9L, PaymentGateway.PaymentType.ALIPAY,
                body("enabled", true, "appId", "2021", "privateKey", "PK")));
        assertTrue(e.getMessage().contains("支付宝公钥"), "实际：" + e.getMessage());
    }

    /* ── 读取与展示 ───────────────────────────────────────────────────────── */

    @Test
    @DisplayName("⑤ 未启用 / 不存在 → load 返回 null（上层据此明确拒绝，而不是「假装能收」）")
    void loadReturnsNullWhenNotEnabled() {
        PaymentConfigService svc = service();
        when(configMapper.findByTenantAndChannel(9L, "ALIPAY")).thenReturn(null);
        assertNull(svc.load(9L, PaymentGateway.PaymentType.ALIPAY));

        when(configMapper.findByTenantAndChannel(9L, "ALIPAY")).thenReturn(existing(false));
        assertNull(svc.load(9L, PaymentGateway.PaymentType.ALIPAY), "未启用不该当作可用");
    }

    @Test
    @DisplayName("⑥ 启用且齐全 → load 返回可运行配置（密钥已解密）")
    void loadDecryptsWhenUsable() {
        PaymentConfig cfg = existing(true);
        when(configMapper.findByTenantAndChannel(9L, "ALIPAY")).thenReturn(cfg);

        PaymentChannelConfig runtime = service().load(9L, PaymentGateway.PaymentType.ALIPAY);

        assertNotNull(runtime);
        assertTrue(runtime.isUsable());
        assertEquals("OLD_PRIVATE_KEY", runtime.getPrivateKey());
        assertEquals("OLD_PUBLIC_KEY", runtime.getAlipayPublicKey());
    }

    @Test
    @DisplayName("⑦ 给前端的描述里绝不出现密钥内容，只报「是否已设置」")
    void describeNeverLeaksSecrets() {
        when(configMapper.findByTenantAndChannel(9L, "ALIPAY")).thenReturn(existing(true));

        Map<String, Object> desc = service().describe(9L, PaymentGateway.PaymentType.ALIPAY);

        assertTrue((Boolean) desc.get("privateKeySet"));
        assertTrue((Boolean) desc.get("publicKeySet"));
        String flat = desc.toString();
        assertFalse(flat.contains("OLD_PRIVATE_KEY"), "描述里不能出现私钥明文");
        assertFalse(flat.contains("OLD_PUBLIC_KEY"), "描述里不能出现公钥明文");
        // 密文也不该给前端
        assertFalse(flat.contains(aesEncryptor.encrypt("OLD_PRIVATE_KEY").substring(0, 10)));
    }

    @Test
    @DisplayName("⑧ 主密钥被换掉时：解密失败不抛异常，而是表现为「该渠道不可用」")
    void decryptFailureDegradesGracefully() {
        PaymentConfig cfg = existing(true);
        // 用一个不同的主密钥解密 → 必然失败
        PaymentConfigService other = new PaymentConfigService(configMapper,
                new AesEncryptor("a-completely-different-master-key-00"));
        when(configMapper.findByTenantAndChannel(9L, "ALIPAY")).thenReturn(cfg);

        PaymentChannelConfig runtime = other.load(9L, PaymentGateway.PaymentType.ALIPAY);

        assertNotNull(runtime);
        assertNull(runtime.getPrivateKey(), "解不开就当没配，提示重新填写");
        assertFalse(runtime.isUsable());
    }
}
