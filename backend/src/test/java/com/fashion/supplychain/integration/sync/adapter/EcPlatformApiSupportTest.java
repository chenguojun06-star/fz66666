package com.fashion.supplychain.integration.sync.adapter;

import com.fashion.supplychain.integration.util.SignatureUtils;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 平台 API 签名与响应校验测试
 *
 * <p>存在意义：本项目曾出现两类严重缺陷，此处用测试把行为钉死，防止回退——
 * <ol>
 *   <li><b>缺签名</b>：适配器只塞 app_key 不签 sign，真实平台必拒；</li>
 *   <li><b>假成功</b>：HTTP 200 就算成功，平台返回 error_response 时系统仍报
 *       "同步成功"——用户看到的是假象，数据其实没同步出去。</li>
 * </ol>
 * 其中"假成功"比直接报错更危险，故响应校验是本测试的重点。
 */
@DisplayName("EcPlatformApiSupport - 平台API签名与响应校验")
class EcPlatformApiSupportTest {

    // ============================================================
    // 签名
    // ============================================================

    @Nested
    @DisplayName("签名计算")
    class SignTest {

        @Test
        @DisplayName("参数按key字典序排序后参与签名")
        void shouldSortParamsByKey() {
            Map<String, Object> params = new LinkedHashMap<>();
            // 故意乱序插入：b 在 a 之前
            params.put("b", "2");
            params.put("a", "1");

            String sign = SignatureUtils.buildSortedSign(params, "secret");

            // 期望拼接为 secret + a1 + b2 + secret
            assertThat(sign).isEqualTo("EF16F26C937CF52AE6F85DF2FD08B24A");
        }

        @Test
        @DisplayName("与真实TOP请求结构一致（method+timestamp）")
        void shouldMatchRealTopRequest() {
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("timestamp", "2026-01-01 00:00:00");
            params.put("method", "taobao.item.get");

            String sign = SignatureUtils.buildSortedSign(params, "secret");

            assertThat(sign).isEqualTo("D9C7C831ED5645D13860A5F7FF410DB0");
        }

        @Test
        @DisplayName("签名结果必须是大写的MD5十六进制")
        void shouldBeUpperCaseHex() {
            String sign = SignatureUtils.buildSortedSign(Map.of("k", "v"), "secret");
            assertThat(sign).matches("^[0-9A-F]{32}$");
        }

        @Test
        @DisplayName("sign字段本身不参与签名，避免自引用")
        void shouldExcludeSignField() {
            Map<String, Object> withSign = new LinkedHashMap<>();
            withSign.put("k", "v");
            withSign.put("sign", "SHOULD_BE_IGNORED");

            Map<String, Object> withoutSign = new LinkedHashMap<>();
            withoutSign.put("k", "v");

            assertThat(SignatureUtils.buildSortedSign(withSign, "secret"))
                    .isEqualTo(SignatureUtils.buildSortedSign(withoutSign, "secret"));
        }

        @Test
        @DisplayName("相同输入签名稳定（可重放）")
        void shouldBeDeterministic() {
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("method", "taobao.item.add");
            params.put("timestamp", "2026-01-01 00:00:00");

            String s1 = SignatureUtils.buildSortedSign(params, "secret");
            String s2 = SignatureUtils.buildSortedSign(params, "secret");

            assertThat(s1).isEqualTo(s2);
        }

        @Test
        @DisplayName("密钥不同则签名不同")
        void shouldDifferBySecret() {
            Map<String, Object> params = Map.of("k", "v");
            assertThat(SignatureUtils.buildSortedSign(params, "secretA"))
                    .isNotEqualTo(SignatureUtils.buildSortedSign(params, "secretB"));
        }

        @Test
        @DisplayName("空参数不抛异常，退化为仅密钥的MD5")
        void shouldHandleEmptyParams() {
            String sign = SignatureUtils.buildSortedSign(new LinkedHashMap<>(), "secret");
            assertThat(sign).isEqualTo(SignatureUtils.md5("secretsecret"));
        }
    }

    // ============================================================
    // 响应校验（防"假成功"）
    // ============================================================

    @Nested
    @DisplayName("响应校验 - 防止HTTP 200即误判成功")
    class ResponseCheckTest {

        @Test
        @DisplayName("null响应判为失败")
        void nullResponseShouldFail() {
            assertThat(EcPlatformApiSupport.isSuccess(null)).isFalse();
        }

        @Test
        @DisplayName("空响应判为失败")
        void emptyResponseShouldFail() {
            assertThat(EcPlatformApiSupport.isSuccess(new LinkedHashMap<>())).isFalse();
        }

        @Test
        @DisplayName("含error_response节点判为失败（淘宝/京东/拼多多统一错误结构）")
        void errorResponseShouldFail() {
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("error_response", Map.of("code", "15", "msg", "Invalid signature"));

            // 核心断言：即便HTTP 200，业务错误也必须判失败
            assertThat(EcPlatformApiSupport.isSuccess(resp)).isFalse();
        }

        @Test
        @DisplayName("顶层error_code非0判为失败")
        void topLevelErrorCodeShouldFail() {
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("error_code", "10001");
            resp.put("error_msg", "缺少必填参数");

            assertThat(EcPlatformApiSupport.isSuccess(resp)).isFalse();
        }

        @Test
        @DisplayName("顶层error_code为0视为成功")
        void zeroErrorCodeShouldPass() {
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("error_code", "0");
            resp.put("result", "ok");

            assertThat(EcPlatformApiSupport.isSuccess(resp)).isTrue();
        }

        @Test
        @DisplayName("正常业务响应判为成功")
        void normalResponseShouldPass() {
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("item_seller_get_response", Map.of("item", Map.of("num_iid", "123")));

            assertThat(EcPlatformApiSupport.isSuccess(resp)).isTrue();
        }

        @Test
        @DisplayName("带success标记的正常响应判为成功")
        void successFlagResponseShouldPass() {
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("success", true);
            resp.put("data", Map.of("sku", "A-001"));

            assertThat(EcPlatformApiSupport.isSuccess(resp)).isTrue();
        }
    }

    // ============================================================
    // 错误信息提取
    // ============================================================

    @Nested
    @DisplayName("错误信息提取 - 兼容各平台字段命名")
    class ErrorExtractTest {

        @Test
        @DisplayName("提取淘宝风格 msg + sub_msg")
        void extractTaobaoStyle() {
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("error_response", Map.of("code", "15", "msg", "Invalid signature",
                    "sub_msg", "sign参数错误"));

            String err = EcPlatformApiSupport.extractError(resp);

            assertThat(err).contains("15").contains("Invalid signature").contains("sign参数错误");
        }

        @Test
        @DisplayName("提取京东风格 zh_desc")
        void extractJdStyle() {
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("error_response", Map.of("code", "1000", "zh_desc", "商家信息不存在"));

            assertThat(EcPlatformApiSupport.extractError(resp)).contains("商家信息不存在");
        }

        @Test
        @DisplayName("提取拼多多风格 error_msg")
        void extractPddStyle() {
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("error_response", Map.of("error_msg", "无效的client_id", "code", "30001"));

            assertThat(EcPlatformApiSupport.extractError(resp)).contains("无效的client_id");
        }

        @Test
        @DisplayName("null响应给出可读提示而非NPE")
        void nullResponseShouldGiveReadableMessage() {
            assertThat(EcPlatformApiSupport.extractError(null)).contains("无响应");
        }

        @Test
        @DisplayName("顶层平铺错误也能提取")
        void extractTopLevelError() {
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("error_code", "20001");
            resp.put("error_msg", "商品不存在");

            assertThat(EcPlatformApiSupport.extractError(resp))
                    .contains("20001").contains("商品不存在");
        }
    }
}
