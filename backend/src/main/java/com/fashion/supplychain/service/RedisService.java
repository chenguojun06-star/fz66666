package com.fashion.supplychain.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Redis服务类
 * 提供常用的缓存操作
 */
@Slf4j
@Service
public class RedisService {

    @Autowired(required = false)
    private RedisTemplate<String, Object> redisTemplate;

    /**
     * 设置缓存
     */
    public void set(String key, Object value) {
        try {
            redisTemplate.opsForValue().set(key, value);
        } catch (Exception e) {
            log.error("Redis set error, key: {}", key, e);
        }
    }

    /**
     * 设置缓存并设置过期时间
     */
    public void set(String key, Object value, long timeout, TimeUnit unit) {
        try {
            redisTemplate.opsForValue().set(key, value, timeout, unit);
        } catch (Exception e) {
            log.error("Redis set error, key: {}", key, e);
        }
    }

    /**
     * 获取缓存
     */
    @SuppressWarnings("unchecked")
    public <T> T get(String key) {
        try {
            return (T) redisTemplate.opsForValue().get(key);
        } catch (Exception e) {
            // 反序列化失败：可能是新旧序列化格式不兼容（版本升级/部署后旧缓存未清理）
            // 自动删除损坏的 key，使其在下次写入时以当前格式重建，实现自愈
            log.warn("Redis get failed (cache miss), key={} err={} — 自动删除损坏key", key, e.getMessage());
            try { redisTemplate.delete(key); } catch (Exception ex) { log.debug("Non-critical error: {}", ex.getMessage()); }
            return null;
        }
    }

    /**
     * 删除缓存
     */
    public void delete(String key) {
        try {
            redisTemplate.delete(key);
        } catch (Exception e) {
            log.error("Redis delete error, key: {}", key, e);
        }
    }

    /**
     * 批量删除缓存
     */
    public void delete(Collection<String> keys) {
        try {
            redisTemplate.delete(keys);
        } catch (Exception e) {
            log.error("Redis batch delete error", e);
        }
    }

    /**
     * 按 pattern 批量删除缓存（SCAN游标实现，兼容云端 managed Redis 及 Redis Cluster）
     * 示例: deleteByPattern("role:perms:*")
     * 使用 SCAN 而非 KEYS，避免云端 managed Redis 禁用 KEYS 命令导致静默失败。
     * 每个 key 单独调用高层 delete() 而非 connection.del(多key)，
     * 防止 Redis Cluster 下多 key 落在不同 slot 触发 CROSSSLOT 错误而静默失败。
     */
    public long deleteByPattern(String pattern) {
        try {
            // SCAN 阶段：通过底层 connection 获取所有匹配 key 的原始字节
            List<byte[]> rawKeys = redisTemplate.execute((RedisCallback<List<byte[]>>) connection -> {
                List<byte[]> found = new ArrayList<>();
                ScanOptions options = ScanOptions.scanOptions().match(pattern).count(200).build();
                try (Cursor<byte[]> cursor = connection.scan(options)) {
                    while (cursor.hasNext()) {
                        found.add(cursor.next());
                    }
                }
                return found;
            });

            if (rawKeys == null || rawKeys.isEmpty()) return 0;

            // DELETE 阶段：逐个调用高层 API（cluster-aware，自动路由到正确 slot）
            long count = 0;
            StringRedisSerializer keySerializer = new StringRedisSerializer();
            for (byte[] rawKey : rawKeys) {
                try {
                    String keyStr = keySerializer.deserialize(rawKey);
                    if (keyStr != null) {
                        Boolean existed = redisTemplate.delete(keyStr);
                        if (Boolean.TRUE.equals(existed)) count++;
                    }
                } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
            }
            if (count > 0) {
                log.info("Redis deleteByPattern: pattern={}, deleted={}", pattern, count);
            }
            return count;
        } catch (Exception e) {
            log.warn("Redis deleteByPattern failed, pattern={}, err={}", pattern, e.getMessage());
            return 0;
        }
    }

    /**
     * 判断key是否存在
     */
    public boolean hasKey(String key) {
        try {
            return Boolean.TRUE.equals(redisTemplate.hasKey(key));
        } catch (Exception e) {
            log.error("Redis hasKey error, key: {}", key, e);
            return false;
        }
    }

    /**
     * 设置过期时间
     */
    public boolean expire(String key, long timeout, TimeUnit unit) {
        try {
            return Boolean.TRUE.equals(redisTemplate.expire(key, timeout, unit));
        } catch (Exception e) {
            log.error("Redis expire error, key: {}", key, e);
            return false;
        }
    }

    /**
     * 获取过期时间
     */
    public Long getExpire(String key, TimeUnit unit) {
        try {
            return redisTemplate.getExpire(key, unit);
        } catch (Exception e) {
            log.error("Redis getExpire error, key: {}", key, e);
            return null;
        }
    }

    /**
     * 递增
     */
    public Long increment(String key, long delta) {
        try {
            return redisTemplate.opsForValue().increment(key, delta);
        } catch (Exception e) {
            log.error("Redis increment error, key: {}", key, e);
            return null;
        }
    }

    /**
     * 递减
     */
    public Long decrement(String key, long delta) {
        try {
            return redisTemplate.opsForValue().decrement(key, delta);
        } catch (Exception e) {
            log.error("Redis decrement error, key: {}", key, e);
            return null;
        }
    }

    /**
     * 设置Hash缓存
     */
    public void hSet(String key, String hashKey, Object value) {
        try {
            redisTemplate.opsForHash().put(key, hashKey, value);
        } catch (Exception e) {
            log.error("Redis hSet error, key: {}, hashKey: {}", key, hashKey, e);
        }
    }

    /**
     * 获取Hash缓存
     */
    @SuppressWarnings("unchecked")
    public <T> T hGet(String key, String hashKey) {
        try {
            return (T) redisTemplate.opsForHash().get(key, hashKey);
        } catch (Exception e) {
            log.error("Redis hGet error, key: {}, hashKey: {}", key, hashKey, e);
            return null;
        }
    }

    /**
     * 删除Hash缓存
     */
    public void hDelete(String key, Object... hashKeys) {
        try {
            redisTemplate.opsForHash().delete(key, hashKeys);
        } catch (Exception e) {
            log.error("Redis hDelete error, key: {}", key, e);
        }
    }
}
