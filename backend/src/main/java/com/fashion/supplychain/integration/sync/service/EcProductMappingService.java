package com.fashion.supplychain.integration.sync.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.sync.entity.EcProductMapping;
import com.fashion.supplychain.integration.sync.mapper.EcProductMappingMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
public class EcProductMappingService extends ServiceImpl<EcProductMappingMapper, EcProductMapping> {

    public EcProductMapping findBySkuAndPlatform(Long skuId, String platformCode, Long tenantId) {
        return getOne(new QueryWrapper<EcProductMapping>()
                .eq("sku_id", skuId)
                .eq("platform_code", platformCode)
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0));
    }

    public List<EcProductMapping> listByStyleAndPlatform(Long styleId, String platformCode, Long tenantId) {
        return list(new QueryWrapper<EcProductMapping>()
                .eq("style_id", styleId)
                .eq("platform_code", platformCode)
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0));
    }

    public List<EcProductMapping> listByStyle(Long styleId, Long tenantId) {
        return list(new QueryWrapper<EcProductMapping>()
                .eq("style_id", styleId)
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0));
    }

    public List<EcProductMapping> listPendingByPlatform(String platformCode, Long tenantId) {
        return list(new QueryWrapper<EcProductMapping>()
                .eq("platform_code", platformCode)
                .eq("tenant_id", tenantId)
                .eq("sync_status", "PENDING")
                .eq("delete_flag", 0));
    }

    public EcProductMapping upsertMapping(Long tenantId, Long styleId, Long skuId,
                                           String platformCode, String platformItemId,
                                           String platformSkuId) {
        EcProductMapping existing = findBySkuAndPlatform(skuId, platformCode, tenantId);
        if (existing != null) {
            existing.setPlatformItemId(platformItemId);
            existing.setPlatformSkuId(platformSkuId);
            existing.setSyncStatus("SYNCED");
            existing.setLastSyncedAt(LocalDateTime.now());
            existing.setSyncVersion(existing.getSyncVersion() + 1);
            existing.setErrorMessage(null);
            updateById(existing);
            return existing;
        }
        EcProductMapping mapping = new EcProductMapping();
        mapping.setTenantId(tenantId);
        mapping.setStyleId(styleId);
        mapping.setSkuId(skuId);
        mapping.setPlatformCode(platformCode);
        mapping.setPlatformItemId(platformItemId);
        mapping.setPlatformSkuId(platformSkuId);
        mapping.setSyncStatus("SYNCED");
        mapping.setLastSyncedAt(LocalDateTime.now());
        mapping.setSyncVersion(1);
        mapping.setDeleteFlag(0);
        save(mapping);
        return mapping;
    }

    public void markFailed(Long mappingId, String errorMessage) {
        EcProductMapping mapping = getById(mappingId);
        if (mapping != null) {
            mapping.setSyncStatus("FAILED");
            mapping.setErrorMessage(errorMessage != null && errorMessage.length() > 500
                    ? errorMessage.substring(0, 500) : errorMessage);
            updateById(mapping);
        }
    }
}
