package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.mapper.EcPlatformConfigMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 电商平台凭证配置 Service
 * 单领域 CRUD，不涉及跨服务调用
 */
@Slf4j
@Service
public class EcPlatformConfigService extends ServiceImpl<EcPlatformConfigMapper, EcPlatformConfig> {

    /**
     * 获取某租户某平台的凭证配置
     */
    public EcPlatformConfig getByTenantAndPlatform(Long tenantId, String platformCode) {
        return getOne(new QueryWrapper<EcPlatformConfig>()
                .eq("tenant_id", tenantId)
                .eq("platform_code", platformCode)
                .eq("status", "ACTIVE"));
    }

    /**
     * 获取某租户所有已配置的平台凭证
     */
    public List<EcPlatformConfig> listByTenant(Long tenantId) {
        return list(new QueryWrapper<EcPlatformConfig>()
                .eq("tenant_id", tenantId)
                .eq("status", "ACTIVE")
                .orderByAsc("platform_code"));
    }

    /**
     * 保存（新增或更新）某租户某平台的凭证配置
     */
    public EcPlatformConfig saveOrUpdate(Long tenantId, String platformCode,
                                         String shopName, String appKey,
                                         String appSecret, String extraField,
                                         String callbackUrl) {
        EcPlatformConfig existing = getByTenantAndPlatform(tenantId, platformCode);
        if (existing == null) {
            existing = new EcPlatformConfig();
            existing.setTenantId(tenantId);
            existing.setPlatformCode(platformCode);
            existing.setStatus("ACTIVE");
        }
        existing.setShopName(shopName);
        existing.setAppKey(appKey);
        existing.setAppSecret(appSecret);
        existing.setExtraField(extraField);
        existing.setCallbackUrl(callbackUrl);
        saveOrUpdate(existing);
        log.info("[EcConfig] 租户{} 平台{} 凭证已保存，店铺：{}", tenantId, platformCode, shopName);
        return existing;
    }

    /**
     * 断开（软删除）某租户某平台的凭证配置
     */
    public void disconnect(Long tenantId, String platformCode) {
        update(new com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper<EcPlatformConfig>()
                .eq("tenant_id", tenantId)
                .eq("platform_code", platformCode)
                .set("status", "DISABLED"));
        log.info("[EcConfig] 租户{} 平台{} 已断开连接", tenantId, platformCode);
    }

    public EcPlatformConfig getByAppKey(String appKey) {
        return getOne(new QueryWrapper<EcPlatformConfig>()
                .eq("app_key", appKey)
                .eq("status", "ACTIVE"));
    }

    public List<EcPlatformConfig> listByPlatformCode(String platformCode) {
        return list(new QueryWrapper<EcPlatformConfig>()
                .eq("platform_code", platformCode)
                .eq("status", "ACTIVE"));
    }
}
