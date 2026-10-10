package com.fashion.supplychain.integration.payment;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 支付模块的「结构性」守护。
 *
 * <p>这些都不是业务逻辑，但**任何一条被改回去都会直接变成事故**，
 * 而且编译期与普通单测都发现不了：
 * <ol>
 *   <li>未配置时返回"模拟成功"（假二维码）→ 系统真的发货记账，却一分钱没收到；</li>
 *   <li>回调验签在未配置时直接放行 → 任何人都能 POST 一个"支付成功"把单刷成已付；</li>
 *   <li>幂等条件被去掉 → 渠道重复推送会重复出库；</li>
 *   <li>密钥明文落库 → 一次数据库泄露就能动商家的钱；</li>
 *   <li>微信回调地址丢掉 tenantId → 无法解密验签，回调永远失败。</li>
 * </ol>
 */
@DisplayName("支付模块：安全与幂等的结构守护")
class PaymentSchemaGuardTest {

    private static String read(String rel) throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/" + rel,
                "backend/src/main/java/com/fashion/supplychain/" + rel,
                "src/main/resources/" + rel,
                "backend/src/main/resources/" + rel)) {
            Path path = Path.of(p);
            if (Files.exists(path)) {
                return Files.readString(path, StandardCharsets.UTF_8);
            }
        }
        throw new AssertionError("找不到 " + rel);
    }

    @Test
    @DisplayName("① 渠道适配器不得再有「未配置就返回模拟成功」的分支")
    void noMockSuccessPath() throws Exception {
        for (String file : List.of(
                "integration/payment/impl/AlipayAdapter.java",
                "integration/payment/impl/WechatPayAdapter.java")) {
            String s = read(file);
            assertThat(s)
                    .as(file + " 不得再出现 mock 响应（假二维码等于假装收到了钱）")
                    .doesNotContain("mockResponse")
                    .doesNotContain("MOCK_QR")
                    .doesNotContain("Mock模式");
            assertThat(s)
                    .as(file + " 未配置必须明确抛错")
                    .contains("尚未配置");
        }
    }

    @Test
    @DisplayName("② 支付管理器：未配置就拒绝，绝不放行")
    void managerRefusesUnconfigured() throws Exception {
        String s = read("integration/payment/PaymentManager.java");
        assertThat(s)
                .as("未配置时给商家看得懂的原因")
                .contains("尚未开启")
                .contains("收款参数不完整");
        assertThat(s)
                .as("不再有「模拟成功」这条路")
                .doesNotContain("mock");
    }

    @Test
    @DisplayName("③ 回调验签：失败一律拒绝，且不得出现「验签不通过却返回成功」")
    void callbackMustRejectOnVerifyFailure() throws Exception {
        String cb = read("integration/payment/orchestration/PaymentCallbackOrchestrator.java");
        assertThat(cb)
                .as("未配置渠道直接拒绝")
                .contains("微信支付未配置")
                .contains("未找到 app_id");
        assertThat(cb)
                .as("验签失败返回 fail，且不落账")
                .contains("verifyCallback(cfg, params)")
                .contains("return \"fail\"");

        String wechat = read("integration/payment/channel/WechatPayGatewayClient.java");
        assertThat(wechat)
                .as("微信侧还要校验商户号，防止别人拿自己的商户号往我们这推")
                .contains("回调商户号与本店配置不一致");
    }

    @Test
    @DisplayName("④ 幂等：状态跃迁必须带 status='PENDING' 条件，业务落账只做一次")
    void idempotencyGuards() throws Exception {
        String mapper = read("integration/record/mapper/PaymentRecordMapper.java");
        assertThat(mapper)
                .as("条件更新是防重复回调的核心：只有 PENDING → SUCCESS 那一次才算数")
                .contains("AND status = 'PENDING'");
        assertThat(mapper).contains("casMarkPaid").contains("casMarkClosed");

        String confirm = read("integration/payment/orchestration/PaymentConfirmOrchestrator.java");
        assertThat(confirm)
                .as("影响 0 行时必须直接返回，不能执行业务落账")
                .contains("if (rows == 0)");
        assertThat(confirm)
                .as("状态跃迁与业务落账必须同一个事务：业务失败要能退回 PENDING 让渠道重推")
                .contains("@Transactional(rollbackFor = Exception.class)");
    }

    @Test
    @DisplayName("⑤ 密钥加密落库、且绝不回传前端")
    void secretsEncryptedAndNotExposed() throws Exception {
        String entity = read("integration/payment/entity/PaymentConfig.java");
        assertThat(entity)
                .as("实体里只能有密文字段，不能有明文密钥字段")
                .contains("privateKeyCipher")
                .doesNotContain("private String privateKey;");

        String svc = read("integration/payment/config/PaymentConfigService.java");
        assertThat(svc)
                .as("保存时必须加密")
                .contains("aesEncryptor.encrypt(v)");
        assertThat(svc)
                .as("给前端的描述只报「是否已设置」，不含密钥内容")
                .contains("privateKeySet")
                .doesNotContain("out.put(\"privateKey\"");

        String sql = read("db/migration/V202710100006__create_payment_config.sql");
        assertThat(sql)
                .as("每租户每渠道只允许一条配置")
                .contains("uk_tenant_channel");
        assertThat(sql)
                .as("表里存的是密文列")
                .contains("private_key_cipher")
                .contains("api_v3_key_cipher");
    }

    @Test
    @DisplayName("⑥ 微信回调地址必须带 tenantId（body 加密，没法先解析单号再反查租户）")
    void wechatCallbackCarriesTenant() throws Exception {
        String ctrl = read("integration/payment/callback/PaymentCallbackController.java");
        assertThat(ctrl)
                .as("路径变量 tenantId")
                .contains("/wechat/{tenantId}");

        String dash = read("integration/controller/IntegrationDashboardController.java");
        assertThat(dash)
                .as("集成中心展示的回调地址也要带 tenantId，否则运营照着配就收不到回调")
                .contains("/api/webhook/payment/wechat/{tenantId}");
    }

    @Test
    @DisplayName("⑦ 收银台：待支付时不出库；出库只发生在结算里")
    void posDoesNotShipBeforePayment() throws Exception {
        String orc = read("pos/orchestration/PosSaleOrchestrator.java");
        assertThat(orc)
                .as("在线支付分支只发起支付、拿二维码，不调结算")
                .contains("paymentOrchestrator.prepay(");
        // 出库只在 PosSaleWriteService.settle 里发生
        String write = read("pos/service/PosSaleWriteService.java");
        assertThat(write)
                .as("出库只在结算方法里，且只有仍处于 PAYING 的单才会出库")
                .contains("freeOutbound(params)")
                .contains("\"PAID\".equals(sale.getPayStatus())");
        assertThat(write)
                .as("已取消却收到钱必须报错，让人工核对退款（不能悄悄出库）")
                .contains("请核对渠道账单后处理退款");
    }

    @Test
    @DisplayName("⑧ 收银台交班口径：只统计钱已到位的单")
    void posShiftTotalsOnlySettled() throws Exception {
        String mapper = read("pos/mapper/PosSaleMapper.java");
        assertThat(mapper)
                .as("待支付/已取消不能计入收款，否则收银员数钱对不上")
                .contains("pay_status IN ('PAID', 'UNPAID')");
        assertThat(mapper)
                .as("已收款金额只算 PAID，挂账单独列")
                .contains("WHEN pay_status = 'PAID' THEN total_amount")
                .contains("WHEN pay_status = 'UNPAID' THEN total_amount");
    }
}
