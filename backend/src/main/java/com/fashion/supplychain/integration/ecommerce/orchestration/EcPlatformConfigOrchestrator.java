package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 电商平台配置编排层
 *
 * <p>负责保存/更新/删除电商平台配置。所有数据库写操作通过此类执行，
 * 并使用 @Transactional 保证事务边界。
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class EcPlatformConfigOrchestrator {

    @Autowired
    private EcPlatformConfigService ecPlatformConfigService;

    /**
     * 保存或更新平台配置（包含 appSecret 掩蔽逻辑）
     *
     * <p>如果传入的 appSecret 为 "****"（前端掩蔽值），则不更新 secret 字段。
     */
    @Transactional(rollbackFor = Exception.class)
    public void saveOrUpdateConfig(Long tenantId, String platformCode,
                                    String appKey, String appSecret,
                                    String shopName, String callbackUrl) {
        if (tenantId == null) {
            tenantId = TenantAssert.requireTenantId();
        }
        EcPlatformConfig existing = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);
        if (existing != null) {
            existing.setAppKey(appKey);
            if (appSecret != null && !"****".equals(appSecret)) {
                existing.setAppSecret(appSecret);
            }
            if (shopName != null) existing.setShopName(shopName);
            if (callbackUrl != null) existing.setCallbackUrl(callbackUrl);
            existing.setStatus("ACTIVE");
            ecPlatformConfigService.updateById(existing);
        } else {
            EcPlatformConfig config = new EcPlatformConfig();
            config.setTenantId(tenantId);
            config.setPlatformCode(platformCode);
            config.setAppKey(appKey);
            config.setAppSecret(appSecret);
            config.setShopName(shopName);
            config.setCallbackUrl(callbackUrl);
            config.setStatus("ACTIVE");
            ecPlatformConfigService.save(config);
        }
        log.info("[EcPlatformConfigOrchestrator] 平台配置已更新: tenantId={}, platformCode={}", tenantId, platformCode);
    }
}
