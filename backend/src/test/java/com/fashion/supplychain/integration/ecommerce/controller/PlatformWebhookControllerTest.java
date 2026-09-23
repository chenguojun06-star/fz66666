package com.fashion.supplychain.integration.ecommerce.controller;

import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import com.fashion.supplychain.integration.ecommerce.service.PlatformDataMapperService;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
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
import static org.mockito.ArgumentMatchers.any;
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
 * <p>签名算法：{@code HMAC-SHA256(appSecret, X-Platform-Timestamp + rawBody)}，小写十六进制。
 * 本测试的期望签名由外部工具（openssl）独立算出后硬编码，
 * 避免"用生产代码算期望值再拿生产代码去比"的自证循环。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("PlatformWebhookController - 平台订单推送入口")
class PlatformWebhookControllerTest {

    private static final Long TENANT_ID = 1L;
    private static final String PLATFORM = "TAOBAO";
    private static final String SECRET = "test-secret";
    private static final String BODY = "{\"orderNo\":\"A1\",\"skuCode\":\"X\"}";
    private static final String TIMESTAMP = "1700000000";
    /** openssl dgst -sha256 -hmac 'test-secret' <<< '1700000000{"orderNo":"A1","skuCode":"X"}' */
    private static final String VALID_SIGNATURE =
            "b2dead28888cbc0d2841d69e35c55146d55112f8155d1bf7e9f0a4f0f64c0d58";

    @Mock
    private EcPlatformConfigService ecPlatformConfigService;

    @Mock
    private EcommerceOrderOrchestrator ecommerceOrderOrchestrator;

    @Mock
    private PlatformDataMapperService dataMapper;

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
        when(ecPlatformConfigService.getByTenantAndPlatform(TENANT_ID, PLATFORM)).thenReturn(null);

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, PLATFORM,
                VALID_SIGNATURE, TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(((Map<?, ?>) res.getBody()).get("received")).isEqualTo(false);
        verify(ecommerceOrderOrchestrator, never()).receiveOrder(anyString(), any(), anyLong());
    }

    @Test
    @DisplayName("缺签名头 → 401，且不落库")
    void missingSignatureHeader_returns401() {
        when(ecPlatformConfigService.getByTenantAndPlatform(anyLong(), anyString()))
                .thenReturn(config(SECRET));

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, PLATFORM, null, TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(ecommerceOrderOrchestrator, never()).receiveOrder(anyString(), any(), anyLong());
    }

    @Test
    @DisplayName("AppSecret 未配置 → 401，且不落库")
    void appSecretMissing_returns401() {
        when(ecPlatformConfigService.getByTenantAndPlatform(anyLong(), anyString()))
                .thenReturn(config(null));

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, PLATFORM,
                VALID_SIGNATURE, TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(ecommerceOrderOrchestrator, never()).receiveOrder(anyString(), any(), anyLong());
    }

    @Test
    @DisplayName("签名不匹配 → 401，且不落库")
    void signatureMismatch_returns401() {
        when(ecPlatformConfigService.getByTenantAndPlatform(anyLong(), anyString()))
                .thenReturn(config(SECRET));

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, PLATFORM,
                "deadbeef", TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(ecommerceOrderOrchestrator, never()).receiveOrder(anyString(), any(), anyLong());
    }

    @Test
    @DisplayName("平台编码大小写不敏感（URL 传 taobao 也能查到 TAOBAO 配置）")
    void platformCodeIsUppercased() {
        when(ecPlatformConfigService.getByTenantAndPlatform(TENANT_ID, PLATFORM))
                .thenReturn(config(SECRET));
        when(dataMapper.mapToGeneric(eq(PLATFORM), eq(BODY))).thenReturn(Map.of("platformOrderNo", "A1"));
        when(ecommerceOrderOrchestrator.receiveOrder(eq(PLATFORM), any(), eq(TENANT_ID)))
                .thenReturn(Map.of("orderNo", "A1", "id", 7L));

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, "taobao",
                VALID_SIGNATURE, TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("签名正确 → 200 + received=true")
    void validSignature_returns200() {
        when(ecPlatformConfigService.getByTenantAndPlatform(anyLong(), anyString()))
                .thenReturn(config(SECRET));
        when(dataMapper.mapToGeneric(anyString(), anyString()))
                .thenReturn(Map.of("platformOrderNo", "A1"));
        when(ecommerceOrderOrchestrator.receiveOrder(anyString(), any(), anyLong()))
                .thenReturn(Map.of("orderNo", "A1", "id", 7L));

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, PLATFORM,
                VALID_SIGNATURE, TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<?, ?> body = (Map<?, ?>) res.getBody();
        assertThat(body.get("received")).isEqualTo(true);
        assertThat(body.get("duplicate")).isEqualTo(false);
        assertThat(body.get("orderNo")).isEqualTo("A1");
    }

    @Test
    @DisplayName("重复推送幂等命中 → 200 + duplicate=true（平台不会重推，是正确结果）")
    void duplicatePush_returns200WithDuplicateFlag() {
        when(ecPlatformConfigService.getByTenantAndPlatform(anyLong(), anyString()))
                .thenReturn(config(SECRET));
        when(dataMapper.mapToGeneric(anyString(), anyString()))
                .thenReturn(Map.of("platformOrderNo", "A1"));
        when(ecommerceOrderOrchestrator.receiveOrder(anyString(), any(), anyLong()))
                .thenReturn(Map.of("duplicate", true, "orderNo", "A1"));

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, PLATFORM,
                VALID_SIGNATURE, TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(((Map<?, ?>) res.getBody()).get("duplicate")).isEqualTo(true);
    }

    @Test
    @DisplayName("处理异常 → 500（关键回归：不能返回 200 让平台认为已送达）")
    void processingFailure_returns500() {
        when(ecPlatformConfigService.getByTenantAndPlatform(anyLong(), anyString()))
                .thenReturn(config(SECRET));
        when(dataMapper.mapToGeneric(anyString(), anyString())).thenReturn(Map.of());
        when(ecommerceOrderOrchestrator.receiveOrder(anyString(), any(), anyLong()))
                .thenThrow(new RuntimeException("db down"));

        ResponseEntity<?> res = controller.receiveOrder(BODY, TENANT_ID, PLATFORM,
                VALID_SIGNATURE, TIMESTAMP);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        Map<?, ?> body = (Map<?, ?>) res.getBody();
        assertThat(body.get("received")).isEqualTo(false);
        assertThat(body.get("error")).isEqualTo("db down");
    }
}
