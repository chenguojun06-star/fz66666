package com.fashion.supplychain.common.cache;

import com.fashion.supplychain.common.UserContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class UnifiedCacheManager {

    private final RedisTemplate<String, Object> redisTemplate;
    private final RealTimePushService realTimePushService;

    private static final String CACHE_KEY_PREFIX = "fashion:cache:";
    private static final String LOCK_PREFIX = "fashion:lock:";

    public <T> T get(String cacheName, String key) {
        String fullKey = buildKey(cacheName, key);
        try {
            Object value = redisTemplate.opsForValue().get(fullKey);
            log.debug("[Cache] Get cacheName={}, key={}, exists={}", cacheName, key, value != null);
            return (T) value;
        } catch (Exception e) {
            log.warn("[Cache] Get failed, cacheName={}, key={}", cacheName, key, e);
            return null;
        }
    }

    public void set(String cacheName, String key, Object value, Duration ttl) {
        String fullKey = buildKey(cacheName, key);
        try {
            if (value == null) {
                return;
            }
            redisTemplate.opsForValue().set(fullKey, value, ttl);
            log.debug("[Cache] Set cacheName={}, key={}, ttl={}", cacheName, key, ttl);
        } catch (Exception e) {
            log.warn("[Cache] Set failed, cacheName={}, key={}", cacheName, key, e);
        }
    }

    public void set(String cacheName, String key, Object value, long timeout, TimeUnit unit) {
        set(cacheName, key, value, Duration.ofMillis(unit.toMillis(timeout)));
    }

    public void evict(String cacheName, String key) {
        String fullKey = buildKey(cacheName, key);
        try {
            Boolean deleted = redisTemplate.delete(fullKey);
            log.debug("[Cache] Evict cacheName={}, key={}, success={}", cacheName, key, deleted);

            pushEvictionEvent(cacheName, Collections.singleton(key));
        } catch (Exception e) {
            log.warn("[Cache] Evict failed, cacheName={}, key={}", cacheName, key, e);
        }
    }

    public void evictByPattern(String cacheName, String pattern) {
        String fullPattern = buildKey(cacheName, pattern);
        try {
            Set<String> keys = redisTemplate.keys(fullPattern);
            if (keys != null && !keys.isEmpty()) {
                Long count = redisTemplate.delete(keys);
                log.info("[Cache] Evict by pattern, cacheName={}, pattern={}, count={}", cacheName, pattern, count);
                pushEvictionEvent(cacheName, keys);
            }
        } catch (Exception e) {
            log.warn("[Cache] Evict by pattern failed, cacheName={}, pattern={}", cacheName, pattern, e);
        }
    }

    public void evictAll(String cacheName) {
        evictByPattern(cacheName, "*");
    }

    public boolean exists(String cacheName, String key) {
        String fullKey = buildKey(cacheName, key);
        try {
            return Boolean.TRUE.equals(redisTemplate.hasKey(fullKey));
        } catch (Exception e) {
            log.warn("[Cache] Check exists failed, cacheName={}, key={}", cacheName, key, e);
            return false;
        }
    }

    public boolean tryLock(String lockKey, Duration waitTime, Duration leaseTime) {
        String fullKey = LOCK_PREFIX + lockKey;
        try {
            Boolean acquired = redisTemplate.opsForValue()
                    .setIfAbsent(fullKey, System.currentTimeMillis(), leaseTime);
            if (Boolean.TRUE.equals(acquired)) {
                log.debug("[Lock] Acquired lockKey={}", lockKey);
                return true;
            }
            return false;
        } catch (Exception e) {
            log.warn("[Lock] Try lock failed, lockKey={}", lockKey, e);
            return false;
        }
    }

    public void unlock(String lockKey) {
        String fullKey = LOCK_PREFIX + lockKey;
        try {
            redisTemplate.delete(fullKey);
            log.debug("[Lock] Released lockKey={}", lockKey);
        } catch (Exception e) {
            log.warn("[Lock] Unlock failed, lockKey={}", lockKey, e);
        }
    }

    public void publishDataSync(DataSyncEvent event) {
        try {
            realTimePushService.publishDataSync(event);
        } catch (Exception e) {
            log.warn("[Sync] Publish data sync failed, event={}", event, e);
        }
    }

    private String buildKey(String cacheName, String key) {
        Long tenantIdLong = UserContext.tenantId();
        String tenantId = tenantIdLong != null ? String.valueOf(tenantIdLong) : null;
        if (tenantId != null) {
            return CACHE_KEY_PREFIX + tenantId + ":" + cacheName + ":" + key;
        }
        return CACHE_KEY_PREFIX + cacheName + ":" + key;
    }

    private void pushEvictionEvent(String cacheName, Set<String> keys) {
        try {
            Long tenantIdLong = UserContext.tenantId();
            String tenantId = tenantIdLong != null ? String.valueOf(tenantIdLong) : null;
            CacheEvictionEvent event = CacheEvictionEvent.builder()
                    .cacheName(cacheName)
                    .keys(keys)
                    .tenantId(tenantId)
                    .source("backend")
                    .timestamp(System.currentTimeMillis())
                    .build();
            realTimePushService.publishCacheEviction(event);
        } catch (Exception e) {
            log.warn("[Sync] Push eviction event failed", e);
        }
    }
}
