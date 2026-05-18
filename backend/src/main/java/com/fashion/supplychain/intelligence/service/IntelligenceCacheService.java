package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

/**
 * 智能查询 Redis 缓存服务
 *
 * 为 NL 查询、Dashboard 汇总等高频读取场景提供缓存层
 * 自动降级：Redis 不可用时直接穿透到 DB，不抛异常
 */
@Service
@Slf4j
public class IntelligenceCacheService {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String PREFIX = "xiaoyun:cache:";

    @Autowired(required = false)
    private RedisTemplate<String, Object> redisTemplate;

    @Value("${xiaoyun.cache.ttl-seconds:60}")
    private int defaultTtlSeconds;

    @Value("${xiaoyun.cache.enabled:true}")
    private boolean cacheEnabled;

    public boolean isAvailable() {
        if (!cacheEnabled || redisTemplate == null) return false;
        try {
            redisTemplate.hasKey(PREFIX + "health");
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public <T> T getOrLoad(String cacheKey, Class<T> type, java.util.function.Supplier<T> loader) {
        return getOrLoad(cacheKey, type, loader, defaultTtlSeconds);
    }

    public <T> T getOrLoad(String cacheKey, Class<T> type, java.util.function.Supplier<T> loader, int ttlSeconds) {
        if (!isAvailable()) {
            return loader.get();
        }
        String fullKey = PREFIX + cacheKey;
        try {
            Object cached = redisTemplate.opsForValue().get(fullKey);
            if (cached != null) {
                if (cached instanceof String) {
                    return MAPPER.readValue((String) cached, type);
                }
                return type.cast(cached);
            }
        } catch (Exception e) {
            log.debug("[IntelligenceCache] 读取缓存失败 key={}: {}", fullKey, e.getMessage());
        }

        T value = loader.get();
        if (value != null) {
            try {
                String json = MAPPER.writeValueAsString(value);
                redisTemplate.opsForValue().set(fullKey, json, ttlSeconds, TimeUnit.SECONDS);
            } catch (Exception e) {
                log.debug("[IntelligenceCache] 写入缓存失败 key={}: {}", fullKey, e.getMessage());
            }
        }
        return value;
    }

    public String getOrLoadString(String cacheKey, java.util.function.Supplier<String> loader) {
        return getOrLoadString(cacheKey, loader, defaultTtlSeconds);
    }

    public String getOrLoadString(String cacheKey, java.util.function.Supplier<String> loader, int ttlSeconds) {
        if (!isAvailable()) {
            return loader.get();
        }
        String fullKey = PREFIX + cacheKey;
        try {
            Object cached = redisTemplate.opsForValue().get(fullKey);
            if (cached != null) {
                return cached.toString();
            }
        } catch (Exception e) {
            log.debug("[IntelligenceCache] 读取字符串缓存失败 key={}: {}", fullKey, e.getMessage());
        }

        String value = loader.get();
        if (value != null) {
            try {
                redisTemplate.opsForValue().set(fullKey, value, ttlSeconds, TimeUnit.SECONDS);
            } catch (Exception e) {
                log.debug("[IntelligenceCache] 写入字符串缓存失败 key={}: {}", fullKey, e.getMessage());
            }
        }
        return value;
    }

    public void evict(String cacheKey) {
        if (!isAvailable()) return;
        try {
            redisTemplate.delete(PREFIX + cacheKey);
        } catch (Exception e) {
            log.debug("[IntelligenceCache] 删除缓存失败 key={}: {}", cacheKey, e.getMessage());
        }
    }

    public void evictByPattern(String pattern) {
        if (!isAvailable()) return;
        try {
            var keys = redisTemplate.keys(PREFIX + pattern);
            if (keys != null && !keys.isEmpty()) {
                redisTemplate.delete(keys);
            }
        } catch (Exception e) {
            log.debug("[IntelligenceCache] 批量删除缓存失败 pattern={}: {}", pattern, e.getMessage());
        }
    }
}