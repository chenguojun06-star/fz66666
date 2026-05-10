package com.fashion.supplychain.integration.sync.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.sync.dto.EcSyncContext;
import com.fashion.supplychain.integration.sync.entity.EcSyncConfig;
import com.fashion.supplychain.integration.sync.mapper.EcSyncConfigMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
public class EcSyncConfigService extends ServiceImpl<EcSyncConfigMapper, EcSyncConfig> {

    public EcSyncConfig getByTenantAndPlatform(Long tenantId, String platformCode) {
        return getOne(new QueryWrapper<EcSyncConfig>()
                .eq("tenant_id", tenantId)
                .eq("platform_code", platformCode)
                .eq("enabled", 1)
                .eq("delete_flag", 0));
    }

    public List<EcSyncConfig> listEnabledByTenant(Long tenantId) {
        return list(new QueryWrapper<EcSyncConfig>()
                .eq("tenant_id", tenantId)
                .eq("enabled", 1)
                .eq("delete_flag", 0)
                .orderByAsc("platform_code"));
    }

    public EcSyncContext buildContext(Long tenantId, String platformCode) {
        EcSyncConfig config = getByTenantAndPlatform(tenantId, platformCode);
        if (config == null) {
            return null;
        }
        return EcSyncContext.builder()
                .tenantId(tenantId)
                .platformCode(platformCode)
                .appId(config.getAppId())
                .appSecret(config.getAppSecret())
                .callbackUrl(config.getCallbackUrl())
                .extraConfig(config.getExtraConfig())
                .build();
    }

    public void updateLastSyncAt(Long configId) {
        EcSyncConfig config = getById(configId);
        if (config != null) {
            config.setLastSyncAt(java.time.LocalDateTime.now());
            updateById(config);
        }
    }
}
