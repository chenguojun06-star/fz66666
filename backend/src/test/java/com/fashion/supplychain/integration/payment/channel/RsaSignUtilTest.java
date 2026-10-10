package com.fashion.supplychain.integration.payment.channel;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * RSA2 签名/验签单测（支付宝用）。
 *
 * <p>这是**可以真实验证**的部分：本测试现场生成一对 RSA 密钥，
 * 用私钥签名、公钥验签，走的是和线上完全相同的代码路径。
 * 因此"签名串拼错了""Base64 处理错了""PEM 头尾没剥掉"这类问题会被直接拦住。
 */
class RsaSignUtilTest {

    private static KeyPair keyPair;
    private static String privateKeyBase64;
    private static String publicKeyBase64;
    private static String privateKeyPem;
    private static String publicKeyPem;

    @BeforeAll
    static void generateKeys() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        keyPair = gen.generateKeyPair();
        privateKeyBase64 = Base64.getEncoder().encodeToString(keyPair.getPrivate().getEncoded());
        publicKeyBase64 = Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded());
        // 商家从开放平台复制出来的密钥通常带 PEM 头尾与换行，两种都要能处理
        privateKeyPem = "-----BEGIN PRIVATE KEY-----\n"
                + wrap(privateKeyBase64) + "\n-----END PRIVATE KEY-----";
        publicKeyPem = "-----BEGIN PUBLIC KEY-----\n"
                + wrap(publicKeyBase64) + "\n-----END PUBLIC KEY-----";
    }

    private static String wrap(String s) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i += 64) {
            sb.append(s, i, Math.min(i + 64, s.length())).append('\n');
        }
        return sb.toString().trim();
    }

    @Test
    @DisplayName("① 签名与验签闭环：同一串内容能通过，改一个字符就不通过")
    void signAndVerify() {
        String content = "app_id=2021000000&method=alipay.trade.precreate&out_trade_no=POS1&total_amount=12.34";
        String sign = RsaSignUtil.sign(content, privateKeyBase64);

        assertTrue(RsaSignUtil.verify(content, sign, publicKeyBase64));
        assertFalse(RsaSignUtil.verify(content + "&x=1", sign, publicKeyBase64), "内容被改必须验不过");
        assertFalse(RsaSignUtil.verify(content, sign, publicKeyBase64.substring(0, 100)), "公钥不对必须验不过");
    }

    @Test
    @DisplayName("② 带 PEM 头尾与换行的密钥也能用（商家复制出来的就是这个样子）")
    void toleratesPemWrapping() {
        String content = "hello=world";
        String sign = RsaSignUtil.sign(content, privateKeyPem);
        assertTrue(RsaSignUtil.verify(content, sign, publicKeyPem));
    }

    @Test
    @DisplayName("③ stripPem 只留 Base64 主体")
    void stripPem() {
        assertEquals(privateKeyBase64, RsaSignUtil.stripPem(privateKeyPem));
        assertEquals(publicKeyBase64, RsaSignUtil.stripPem(publicKeyPem));
    }

    @Test
    @DisplayName("④ 密钥格式不对时给出可读错误（而不是抛一段看不懂的堆栈）")
    void badKeyGivesReadableError() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> RsaSignUtil.sign("x", "这不是一个密钥"));
        assertTrue(e.getMessage().contains("私钥格式不正确"), "实际：" + e.getMessage());
    }

    @Test
    @DisplayName("⑤ 验签异常一律当不通过（宁可让真回调重试，也不能放过伪造回调）")
    void verifyFailureIsFalse() {
        assertFalse(RsaSignUtil.verify("x", "bm90LWEtc2ln", publicKeyBase64));
        assertFalse(RsaSignUtil.verify("x", null, publicKeyBase64));
    }
}
