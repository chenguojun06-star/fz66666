package com.fashion.supplychain.integration.payment.channel;

import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.config.PaymentChannelConfig;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/**
 * 支付宝网关客户端单测（不联网，只测协议细节）。
 *
 * <p>重点守三件最容易出错、且出错就会"钱对不上"的事：
 * <ol>
 *   <li><b>待签名串的拼法</b>：按 key 升序、排除 sign/sign_type、跳过空值、值不做 URL 编码；</li>
 *   <li><b>金额单位换算</b>：系统内部一律「分」，支付宝接口一律「元（两位小数）」；</li>
 *   <li><b>回调验签</b>：验不过就是验不过，绝不放过。</li>
 * </ol>
 */
class AlipayGatewayClientTest {

    private static AlipayGatewayClient client;
    private static KeyPair keyPair;
    private static String alipayPrivateKey;
    private static String alipayPublicKey;

    @BeforeAll
    static void setUp() throws Exception {
        client = new AlipayGatewayClient(mock(IntegrationHttpClient.class));
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        // 这里把"支付宝的私钥"当作测试里的签名方：它签的内容，我们用配置里的公钥验
        keyPair = gen.generateKeyPair();
        alipayPrivateKey = Base64.getEncoder().encodeToString(keyPair.getPrivate().getEncoded());
        alipayPublicKey = Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded());
    }

    private static PaymentChannelConfig cfg() {
        return PaymentChannelConfig.builder()
                .tenantId(1L)
                .channel(PaymentGateway.PaymentType.ALIPAY)
                .appId("2021000000000000")
                .privateKey(alipayPrivateKey)
                .alipayPublicKey(alipayPublicKey)
                .build();
    }

    /* ── 待签名串 ─────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("① 待签名串：按 key 升序、排除 sign/sign_type、跳过空值、值不 URL 编码")
    void buildSignContent() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("total_amount", "12.34");
        params.put("app_id", "2021");
        params.put("sign", "SHOULD_BE_EXCLUDED");
        params.put("sign_type", "RSA2");
        params.put("empty", "");
        params.put("nullValue", null);
        params.put("subject", "桑蚕丝连衣裙 特价");

        String content = AlipayGatewayClient.buildSignContent(params);

        // 字典序：app_id < subject < total_amount；值保持原文（含空格与中文，不编码）
        assertEquals("app_id=2021&subject=桑蚕丝连衣裙 特价&total_amount=12.34", content);
    }

    @Test
    @DisplayName("② 空参数集不抛异常")
    void buildSignContentWithNull() {
        assertEquals("", AlipayGatewayClient.buildSignContent(null));
    }

    /* ── 金额换算 ─────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("③ 分 ↔ 元 换算（避免 0.1+0.2 式的浮点坑，全部走 BigDecimal）")
    void amountConversion() {
        assertEquals("12.34", AlipayGatewayClient.fenToYuan(1234L));
        assertEquals("0.01", AlipayGatewayClient.fenToYuan(1L));
        assertEquals("100.00", AlipayGatewayClient.fenToYuan(10000L));

        assertEquals(1234L, AlipayGatewayClient.yuanToFen("12.34"));
        assertEquals(1L, AlipayGatewayClient.yuanToFen("0.01"));
        assertEquals(0L, AlipayGatewayClient.yuanToFen(null));
        assertEquals(0L, AlipayGatewayClient.yuanToFen(""));

        // 来回换算不丢精度
        for (long fen : new long[]{1, 99, 100, 12345, 999999}) {
            assertEquals(fen, AlipayGatewayClient.yuanToFen(AlipayGatewayClient.fenToYuan(fen)));
        }
    }

    /* ── 回调验签 ─────────────────────────────────────────────────────────── */

    @Test
    @DisplayName("④ 回调验签：真签名通过，篡改金额/单号一律不通过")
    void verifyCallback() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("app_id", "2021000000000000");
        params.put("out_trade_no", "POS202610100001");
        params.put("trade_no", "2026101022001400000001");
        params.put("trade_status", "TRADE_SUCCESS");
        params.put("total_amount", "1680.00");

        String sign = RsaSignUtil.sign(AlipayGatewayClient.buildSignContent(params), alipayPrivateKey);
        params.put("sign", sign);
        params.put("sign_type", "RSA2");

        assertTrue(client.verifyCallback(cfg(), params), "正常回调必须验过");

        // 篡改金额：签名对不上 → 必须拒绝（否则等于让攻击者改价）
        Map<String, String> tampered = new LinkedHashMap<>(params);
        tampered.put("total_amount", "0.01");
        assertFalse(client.verifyCallback(cfg(), tampered), "改了金额必须验不过");

        // 篡改单号
        Map<String, String> tampered2 = new LinkedHashMap<>(params);
        tampered2.put("out_trade_no", "POS202610100999");
        assertFalse(client.verifyCallback(cfg(), tampered2), "改了单号必须验不过");
    }

    @Test
    @DisplayName("⑤ 没有 sign / 没有公钥 / 配置为空：一律拒绝（绝不放行）")
    void verifyCallbackRefuses() {
        Map<String, String> noSign = new LinkedHashMap<>();
        noSign.put("out_trade_no", "POS1");
        assertFalse(client.verifyCallback(cfg(), noSign));

        assertFalse(client.verifyCallback(null, noSign));
        assertFalse(client.verifyCallback(PaymentChannelConfig.builder()
                .channel(PaymentGateway.PaymentType.ALIPAY).build(), noSign));

        Map<String, String> withSign = new LinkedHashMap<>(noSign);
        withSign.put("sign", "whatever");
        assertFalse(client.verifyCallback(PaymentChannelConfig.builder()
                .channel(PaymentGateway.PaymentType.ALIPAY)
                .appId("x").privateKey(alipayPrivateKey).build(), withSign), "没有公钥必须拒绝");
    }
}
