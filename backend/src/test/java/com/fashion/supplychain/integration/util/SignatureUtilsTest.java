package com.fashion.supplychain.integration.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * 签名工具测试
 *
 * <p>重点守护顺丰签名。历史上本项目 {@code buildSFSignature} 把 appKey 也拼进了待签字符串
 * （{@code msgData+timestamp+appKey+checkWord}），与顺丰官方规则不符——
 * 后果是**即便填了正确的密钥，请求/回调也会因验签失败被拒**，且现象很像"密钥填错了"，
 * 极难排查。此处用官方文档给出的测试向量把正确算法钉死。
 *
 * <p>官方文档：https://open.sf-express.com/developSupport/195960 （鉴权方式说明-数字签名-简易MD5）
 *
 * <p><b>关于官方文档示例值</b>：该文档正文给出的示例（msgData 为
 * {@code {"language":"zh-CN","orderId":"QIAO-20200618-004"}}、timestamp
 * {@code 12312334453453}、checkWord {@code fjcg5PGKaNpPSHFAZ4QsCOkV71R3zVci}
 * → {@code IIKJtuLVzoFTu4kHI8M8vA==}）**与其自身的代码示例互相矛盾**——
 * 按代码示例的公式算不出这个结果，穷举三种元素的全部 6 种拼接顺序也都不匹配，
 * 判断为厂商文档示例未随规则更新。
 * <p>因此本测试**不**绑定该示例值，而是绑定文档中权威的**代码示例公式**：
 * <pre>
 *   String toVerifyText = msgData + timestamp + checkWord;   // 顺序固定
 *   msgDigest = Base64( MD5( toVerifyText.getBytes("UTF-8") ) )
 * </pre>
 * 拿到顺丰账号后，应使用顺丰开放平台的「数字签名鉴权测试工具」实测一次以最终确认。
 */
@DisplayName("SignatureUtils - 签名算法")
class SignatureUtilsTest {

    @Nested
    @DisplayName("顺丰（丰桥）签名")
    class SfSignatureTest {

        /** 官方文档示例的输入（仅用于验证公式形态，不绑定其输出值，原因见类注释） */
        private static final String SAMPLE_MSG_DATA =
                "{\"language\":\"zh-CN\",\"orderId\":\"QIAO-20200618-004\"}";
        private static final String SAMPLE_TIMESTAMP = "12312334453453";
        private static final String SAMPLE_CHECK_WORD = "fjcg5PGKaNpPSHFAZ4QsCOkV71R3zVci";

        @Test
        @DisplayName("公式 = Base64(MD5(msgData + timestamp + checkWord))，UTF-8")
        void shouldFollowOfficialFormula() {
            String expected = base64Md5(SAMPLE_MSG_DATA + SAMPLE_TIMESTAMP + SAMPLE_CHECK_WORD);

            String actual = SignatureUtils.buildSFSignature(
                    SAMPLE_MSG_DATA, SAMPLE_TIMESTAMP, SAMPLE_CHECK_WORD);

            assertThat(actual).isEqualTo(expected);
        }

        @Test
        @DisplayName("回归防护：签名不得包含 appKey（旧实现多拼了 appKey，会导致验签失败）")
        void shouldNotIncludeAppKey() {
            // 旧（错误）算法：Base64(MD5(msgData + timestamp + appKey + checkWord))
            String legacyWrong = base64Md5(
                    SAMPLE_MSG_DATA + SAMPLE_TIMESTAMP + "SOME_APP_KEY" + SAMPLE_CHECK_WORD);

            String actual = SignatureUtils.buildSFSignature(
                    SAMPLE_MSG_DATA, SAMPLE_TIMESTAMP, SAMPLE_CHECK_WORD);

            assertThat(actual).isNotEqualTo(legacyWrong);
        }

        @Test
        @DisplayName("回归防护：拼接顺序不可调换（顺序变了签名就变）")
        void shouldBeOrderSensitive() {
            String actual = SignatureUtils.buildSFSignature(
                    SAMPLE_MSG_DATA, SAMPLE_TIMESTAMP, SAMPLE_CHECK_WORD);

            assertThat(actual)
                    .isNotEqualTo(base64Md5(SAMPLE_CHECK_WORD + SAMPLE_TIMESTAMP + SAMPLE_MSG_DATA))
                    .isNotEqualTo(base64Md5(SAMPLE_TIMESTAMP + SAMPLE_MSG_DATA + SAMPLE_CHECK_WORD));
        }

        @Test
        @DisplayName("null 参数按空串处理，不抛异常")
        void shouldTolerateNulls() {
            assertThatCode(() -> SignatureUtils.buildSFSignature(null, "1", "cw"))
                    .doesNotThrowAnyException();
            assertThat(SignatureUtils.buildSFSignature(null, null, null))
                    .isEqualTo(base64Md5(""));
        }
    }

    @Nested
    @DisplayName("通用工具")
    class CommonTest {

        @Test
        @DisplayName("md5 输出大写十六进制")
        void md5ShouldBeUpperCaseHex() {
            String md5 = SignatureUtils.md5("abc");
            assertThat(md5).isEqualTo("900150983CD24FB0D6963F7D28E17F72");
        }

        @Test
        @DisplayName("buildSortedSign：参数按key字典序排序 + 密钥首尾包裹")
        void sortedSignShouldWrapSecret() {
            java.util.Map<String, Object> params = new java.util.LinkedHashMap<>();
            params.put("b", "2");
            params.put("a", "1");
            // 期望拼接：secret + a1 + b2 + secret
            assertThat(SignatureUtils.buildSortedSign(params, "secret"))
                    .isEqualTo(SignatureUtils.md5("secreta1b2secret"));
        }

        @Test
        @DisplayName("buildSortedSign：排除 sign 字段本身")
        void sortedSignShouldExcludeSign() {
            java.util.Map<String, Object> withSign = new java.util.LinkedHashMap<>();
            withSign.put("a", "1");
            withSign.put("sign", "SHOULD_BE_IGNORED");

            java.util.Map<String, Object> withoutSign = new java.util.LinkedHashMap<>();
            withoutSign.put("a", "1");

            assertThat(SignatureUtils.buildSortedSign(withSign, "s"))
                    .isEqualTo(SignatureUtils.buildSortedSign(withoutSign, "s"));
        }
    }

    /** 测试内独立实现的 Base64(MD5(x))，避免用被测代码算期望值造成循环论证 */
    private static String base64Md5(String content) {
        try {
            MessageDigest md5 = MessageDigest.getInstance("MD5");
            byte[] digest = md5.digest(content.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
