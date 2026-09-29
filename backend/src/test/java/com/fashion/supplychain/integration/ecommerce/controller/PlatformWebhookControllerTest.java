package com.fashion.supplychain.integration.ecommerce.controller;

import com.fashion.supplychain.integration.ecommerce.orchestration.PlatformWebhookOrchestrator;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * PlatformWebhookController 契约测试。
 *
 * <p>守护的核心契约：<b>失败必须体现在 HTTP 状态码上，不能"假成功"</b>。
 * 平台侧只看状态码决定是否重推：早期异常/未配置都返回 200 + {@code received:false}，
 * 平台认为已送达不再重推，线上表现为"平台说推送成功、系统里没有单"。
 *
 * <p><b>D-634 重构后本测试的边界：</b>取配置 / 验签名 / 落单已下沉到
 * {@link PlatformWebhookOrchestrator}，本类只负责状态码决策。因此这里
 * mock 编排层、只断言 HTTP 契约；签名算法（HMAC-SHA256 十六进制）本身的正确性
 * 由 {@code PlatformWebhookOrchestratorTest} 用 openssl 独立算出的期望值守护 ——
 * 拆成两个测试是为了让"状态码契约"和"签名算法"各自有明确的失败信号，
 * 避免原来那种"签名算错了却表现为 401 断言失败"的混淆。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("PlatformWebhookController - 平台订单推送入口（HTTP 状态码契约）")
class PlatformWebhookControllerTest {

    private static final Long TENANT_ID = 1L;
    private static final String PLATFORM = "TAOBAO";
    private static final String SECRET = "test-secret";
    private static final String BODY = "{\"orderNo\":\"A1\",\"skuCode\":\"X\"}";
    private static final String TIMESTAMP = "1700000000";
    private static final String SIGNATURE = "any-signature-value";

    @Mock
    private PlatformWebhookOrchestrator platformWebhookOrchestrator;

    @InjectMocks
    private PlatformWebhookController controller;

    private static EcPlatformConfig config(String appSecret) {
        EcPlatformConfig c = new EcPlatformConfig();
        c.setTenantId(TENANT_ID);
        c.setPlatformCode(PLATFORM);
        c.setAppSecret(appSecret);
        c.setStatus("ACTIVE");
        return c;
    }

    @Test
    @DisplayName("平台未配置 → 401（不能伪装成 200 让平台放弃重推）")
    void notConfigured_returns401() {
        when(platformWebhookOrchestrator.findConfig(TENANT_ID, PLATFORM)).thenReturn(null);

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, PLATFORM,
                SIGNATURE, TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(((Map<?, ?>) res.getBody()).get("received")).isEqualTo(false);
        verify(platformWebhookOrchestrator, never()).receiveOrder(anyString(), anyString(), anyLong());
    }

    @Test
    @DisplayName("缺签名头 → 401，且不落库")
    void missingSignatureHeader_returns401() {
        when(platformWebhookOrchestrator.findConfig(anyLong(), anyString()))
                .thenReturn(config(SECRET));

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, PLATFORM, null, TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(platformWebhookOrchestrator, never()).receiveOrder(anyString(), anyString(), anyLong());
    }

    @Test
    @DisplayName("缺时间戳头 → 401，且不落库")
    void missingTimestampHeader_returns401() {
        when(platformWebhookOrchestrator.findConfig(anyLong(), anyString()))
                .thenReturn(config(SECRET));

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, PLATFORM, SIGNATURE, null);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(platformWebhookOrchestrator, never()).receiveOrder(anyString(), anyString(), anyLong());
    }

    @Test
    @DisplayName("AppSecret 未配置 → 401，且不落库")
    void appSecretMissing_returns401() {
        when(platformWebhookOrchestrator.findConfig(anyLong(), anyString()))
                .thenReturn(config(null));

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, PLATFORM,
                SIGNATURE, TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(platformWebhookOrchestrator, never()).receiveOrder(anyString(), anyString(), anyLong());
    }

    @Test
    @DisplayName("签名不匹配 → 401，且不落库")
    void signatureMismatch_returns401() {
        when(platformWebhookOrchestrator.findConfig(anyLong(), anyString()))
                .thenReturn(config(SECRET));
        when(platformWebhookOrchestrator.verifySignature(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(false);

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, PLATFORM,
                "deadbeef", TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(platformWebhookOrchestrator, never()).receiveOrder(anyString(), anyString(), anyLong());
    }

    @Test
    @DisplayName("平台编码大小写不敏感（URL 传 taobao 也要按 TAOBAO 查配置）")
    void platformCodeIsUppercased() {
        when(platformWebhookOrchestrator.findConfig(TENANT_ID, PLATFORM))
                .thenReturn(config(SECRET));
        when(platformWebhookOrchestrator.verifySignature(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(true);
        when(platformWebhookOrchestrator.receiveOrder(eq(PLATFORM), anyString(), eq(TENANT_ID)))
                .thenReturn(Map.of("orderNo", "A1", "id", 7L));

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, "taobao",
                SIGNATURE, TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        // 关键：大写归一化必须发生在 Controller，传给编排层的已是 TAOBAO
        verify(platformWebhookOrchestrator).findConfig(TENANT_ID, PLATFORM);
    }

    @Test
    @DisplayName("签名正确 → 200 + received=true")
    void validSignature_returns200() {
        when(platformWebhookOrchestrator.findConfig(anyLong(), anyString()))
                .thenReturn(config(SECRET));
        when(platformWebhookOrchestrator.verifySignature(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(true);
        when(platformWebhookOrchestrator.receiveOrder(anyString(), anyString(), anyLong()))
                .thenReturn(Map.of("orderNo", "A1", "id", 7L));

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, PLATFORM,
                SIGNATURE, TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<?, ?> body = (Map<?, ?>) res.getBody();
        assertThat(body.get("received")).isEqualTo(true);
        assertThat(body.get("duplicate")).isEqualTo(false);
        assertThat(body.get("orderNo")).isEqualTo("A1");
    }

    @Test
    @DisplayName("重复推送幂等命中 → 200 + duplicate=true（平台不会重推，是正确结果）")
    void duplicatePush_returns200WithDuplicateFlag() {
        when(platformWebhookOrchestrator.findConfig(anyLong(), anyString()))
                .thenReturn(config(SECRET));
        when(platformWebhookOrchestrator.verifySignature(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(true);
        when(platformWebhookOrchestrator.receiveOrder(anyString(), anyString(), anyLong()))
                .thenReturn(Map.of("duplicate", true, "orderNo", "A1"));

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, PLATFORM,
                SIGNATURE, TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(((Map<?, ?>) res.getBody()).get("duplicate")).isEqualTo(true);
    }

    @Test
    @DisplayName("处理异常 → 500（关键回归：不能返回 200 让平台认为已送达）")
    void processingFailure_returns500() {
        when(platformWebhookOrchestrator.findConfig(anyLong(), anyString()))
                .thenReturn(config(SECRET));
        when(platformWebhookOrchestrator.verifySignature(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(true);
        when(platformWebhookOrchestrator.receiveOrder(anyString(), anyString(), anyLong()))
                .thenThrow(new RuntimeException("db down"));

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, PLATFORM,
                SIGNATURE, TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        Map<?, ?> body = (Map<?, ?>) res.getBody();
        assertThat(body.get("received")).isEqualTo(false);
        assertThat(body.get("error")).isEqualTo("db down");
    }
}
