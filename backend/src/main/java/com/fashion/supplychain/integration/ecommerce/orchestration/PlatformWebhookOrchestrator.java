package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.ecommerce.service.PlatformDataMapperService;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * 电商平台 Webhook 编排层（租户 + 平台编码寻址的推送入口）
 *
 * <p>{@code PlatformWebhookController} 原先直接注入 {@code EcPlatformConfigService} 与
 * {@code PlatformDataMapperService}（D-630 规则6 违规），现由本层承接。
 *
 * <p><b>刻意留在 Controller 的部分：</b>HTTP 状态码决策（401 配置/签名类错误、
 * 500 处理异常、200 成功）——这是与电商平台之间的**重推契约**（平台只看状态码），
 * 属传输层关注点，且历史上有过「异常也返 200 导致平台认为已送达、订单被静默丢弃」的事故。
 * 本层只负责「取配置 / 验签名 / 在租户上下文中落单」。
 */
@Slf4j
@Service
public class PlatformWebhookOrchestrator {

    @Autowired
    private EcPlatformConfigService ecPlatformConfigService;

    @Autowired
    private EcommerceOrderOrchestrator ecommerceOrderOrchestrator;

    @Autowired
    private PlatformDataMapperService dataMapper;

    /**
     * 按租户 + 平台编码取配置。
     *
     * @return 未配置时返回 {@code null}（由 Controller 决定 401 响应）
     */
    public EcPlatformConfig findConfig(Long tenantId, String platformCode) {
        return ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);
    }

    /**
     * 校验平台签名：HMAC-SHA256(appSecret, timestamp + body) 是否等于签名头。
     *
     * @return 任一入参缺失或签名不匹配返回 {@code false}
     */
    public boolean verifySignature(String appSecret, String timestamp, String body, String signature) {
        if (appSecret == null || signature == null) {
            return false;
        }
        return hmacSha256(appSecret, timestamp + body).equals(signature);
    }

    /**
     * 在系统租户上下文中落单（webhook 免登录，但下游依赖 UserContext 的租户信息）。
     *
     * <p>D-532：必须注入租户上下文，否则 {@code receiveOrder} 内依赖租户上下文的子调用
     * （TenantAssert / 智能分仓 / 组合识别）全部异常导致整单回滚。
     *
     * @return 落单结果，含 {@code duplicate} / {@code orderNo} / {@code id}
     */
    public Map<String, Object> receiveOrder(String platformCode, String body, Long tenantId) {
        Map<String, Object> orderBody = dataMapper.mapToGeneric(platformCode, body);

        UserContext webhookCtx = new UserContext();
        webhookCtx.setTenantId(tenantId);
        webhookCtx.setUserId("webhook-system");
        webhookCtx.setUsername("webhook:" + platformCode);
        webhookCtx.setPermissionRange("all");
        UserContext.set(webhookCtx);
        try {
            return ecommerceOrderOrchestrator.receiveOrder(platformCode, orderBody, tenantId);
        } finally {
            UserContext.clear();
        }
    }

    /** HMAC-SHA256 十六进制摘要；异常时返回空串（与重构前一致，便于签名比对直接判不等）。 */
    private String hmacSha256(String key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            log.error("[Webhook] HMAC 计算失败: {}", e.getMessage());
            return "";
        }
    }
}
