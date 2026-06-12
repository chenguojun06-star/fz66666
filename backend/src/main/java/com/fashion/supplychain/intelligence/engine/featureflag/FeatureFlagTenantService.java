package com.fashion.supplychain.intelligence.engine.featureflag;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@Lazy
public class FeatureFlagTenantService {

    @Autowired(required = false)
    private FeatureFlagTenantMapper mapper;

    private final ConcurrentHashMap<String, Boolean> localCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Long> cacheTimestamps = new ConcurrentHashMap<>();
    private static final long CACHE_TTL_MS = 60_000L;

    public boolean hasTenantFlag(Long tenantId, String feature) {
        if (mapper == null || tenantId == null || feature == null) return false;
        String key = tenantId + ":" + feature;
        Long ts = cacheTimestamps.get(key);
        if (ts != null && System.currentTimeMillis() - ts < CACHE_TTL_MS) {
            return localCache.containsKey(key);
        }
        try {
            int count = mapper.countTenantFlag(tenantId, feature);
            boolean exists = count > 0;
            if (exists) localCache.put(key, true);
            cacheTimestamps.put(key, System.currentTimeMillis());
            return exists;
        } catch (Exception e) {
            log.debug("[FeatureFlagTenant] hasTenantFlag db failed: {}", e.getMessage());
            return false;
        }
    }

    public boolean isFeatureEnabled(Long tenantId, String feature) {
        if (mapper == null || tenantId == null || feature == null) return false;
        String key = tenantId + ":" + feature;
        Long ts = cacheTimestamps.get(key);
        if (ts != null && System.currentTimeMillis() - ts < CACHE_TTL_MS && localCache.containsKey(key)) {
            return localCache.get(key);
        }
        try {
            Boolean enabled = mapper.getTenantFlag(tenantId, feature);
            boolean result = Boolean.TRUE.equals(enabled);
            localCache.put(key, result);
            cacheTimestamps.put(key, System.currentTimeMillis());
            return result;
        } catch (Exception e) {
            log.debug("[FeatureFlagTenant] isFeatureEnabled db failed: {}", e.getMessage());
            return false;
        }
    }

    public void setTenantFlag(Long tenantId, String feature, boolean enabled) {
        if (mapper == null) return;
        try {
            mapper.upsertTenantFlag(tenantId, feature, enabled);
            String key = tenantId + ":" + feature;
            localCache.put(key, enabled);
            cacheTimestamps.put(key, System.currentTimeMillis());
        } catch (Exception e) {
            log.warn("[FeatureFlagTenant] setTenantFlag failed: {}", e.getMessage());
        }
    }

    public void invalidateCache() {
        localCache.clear();
        cacheTimestamps.clear();
    }
}
