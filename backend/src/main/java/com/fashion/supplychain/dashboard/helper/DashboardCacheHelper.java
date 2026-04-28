package com.fashion.supplychain.dashboard.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.service.RedisService;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class DashboardCacheHelper {

    private static final String CACHE_PREFIX = "dashboard:";
    private static final long CACHE_TTL_MINUTES = 5;

    private final RedisService redisService;

    public DashboardCacheHelper(@Autowired(required = false) RedisService redisService) {
        this.redisService = redisService;
    }

    public String tenantCacheKey(String key) {
        Long tenantId = UserContext.tenantId();
        String prefix = tenantId != null ? "t" + tenantId + ":" : "superadmin:";
        return CACHE_PREFIX + prefix + key;
    }

    public <T> T getFromCache(String key) {
        try {
            return redisService != null ? redisService.get(tenantCacheKey(key)) : null;
        } catch (Exception e) {
            log.debug("Redis cache miss or error for key: {}", key);
            return null;
        }
    }

    public void putToCache(String key, Object value) {
        try {
            if (redisService != null) {
                redisService.set(tenantCacheKey(key), value, CACHE_TTL_MINUTES, TimeUnit.MINUTES);
            }
        } catch (Exception e) {
            log.debug("Redis cache put error for key: {}", key);
        }
    }

    public long extractLongScalar(java.util.List<java.util.Map<String, Object>> rows, String fieldName) {
        java.util.Map<String, Object> first = (rows == null || rows.isEmpty()) ? null : rows.get(0);
        Object value = first == null ? null : first.get(fieldName);
        if (value == null && first != null) {
            value = first.get(fieldName.toUpperCase());
        }
        if (value == null) {
            return 0;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (Exception e) {
            return 0;
        }
    }
}
