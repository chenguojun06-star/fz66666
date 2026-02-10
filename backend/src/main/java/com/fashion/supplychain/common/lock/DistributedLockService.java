package com.fashion.supplychain.common.lock;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * 基于 Redis 的分布式锁服务
 * 替代 synchronized 单机锁，支持多实例部署
 *
 * 使用方式:
 * <pre>
 * String result = distributedLockService.executeWithLock(
 *     "lock:inbound:generateNo",
 *     5, TimeUnit.SECONDS,
 *     () -> generateInboundNo()
 * );
 * </pre>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DistributedLockService {

    private final RedisTemplate<String, Object> redisTemplate;

    private static final String LOCK_PREFIX = "fashion:lock:";

    /**
     * Lua 脚本：只有持有锁的线程才能释放
     * KEYS[1] = lockKey
     * ARGV[1] = lockValue (UUID)
     */
    private static final String UNLOCK_LUA_SCRIPT =
            "if redis.call('get', KEYS[1]) == ARGV[1] then " +
            "  return redis.call('del', KEYS[1]) " +
            "else " +
            "  return 0 " +
            "end";

    /**
     * 尝试获取分布式锁
     *
     * @param key     锁的业务标识（如 "inbound:generateNo"）
     * @param timeout 锁超时时间
     * @param unit    时间单位
     * @return 锁的唯一标识（用于释放），null 表示获取失败
     */
    public String tryLock(String key, long timeout, TimeUnit unit) {
        String lockKey = LOCK_PREFIX + key;
        String lockValue = UUID.randomUUID().toString();
        try {
            Boolean success = redisTemplate.opsForValue()
                    .setIfAbsent(lockKey, lockValue, timeout, unit);
            if (Boolean.TRUE.equals(success)) {
                log.debug("Lock acquired: {} (ttl={}{})", lockKey, timeout, unit);
                return lockValue;
            }
            log.debug("Lock contention: {} (already held)", lockKey);
            return null;
        } catch (Exception e) {
            log.error("Lock acquire error: {}", lockKey, e);
            return null;
        }
    }

    /**
     * 释放分布式锁（仅持有者可释放）
     */
    public boolean unlock(String key, String lockValue) {
        String lockKey = LOCK_PREFIX + key;
        try {
            DefaultRedisScript<Long> script = new DefaultRedisScript<>(UNLOCK_LUA_SCRIPT, Long.class);
            Long result = redisTemplate.execute(script, Collections.singletonList(lockKey), lockValue);
            boolean released = result != null && result > 0;
            if (released) {
                log.debug("Lock released: {}", lockKey);
            } else {
                log.warn("Lock release failed (not owner or expired): {}", lockKey);
            }
            return released;
        } catch (Exception e) {
            log.error("Lock release error: {}", lockKey, e);
            return false;
        }
    }

    /**
     * 带锁执行业务逻辑（推荐方式）
     *
     * @param key      锁的业务标识
     * @param timeout  锁超时时间
     * @param unit     时间单位
     * @param supplier 业务逻辑
     * @return 业务执行结果
     * @throws RuntimeException 获取锁失败时抛出
     */
    public <T> T executeWithLock(String key, long timeout, TimeUnit unit, Supplier<T> supplier) {
        String lockValue = tryLock(key, timeout, unit);
        if (lockValue == null) {
            throw new RuntimeException("获取分布式锁失败，请稍后重试: " + key);
        }
        try {
            return supplier.get();
        } finally {
            unlock(key, lockValue);
        }
    }

    /**
     * 带锁执行（无返回值）
     */
    public void executeWithLock(String key, long timeout, TimeUnit unit, Runnable action) {
        executeWithLock(key, timeout, unit, () -> {
            action.run();
            return null;
        });
    }

    /**
     * 尝试带锁执行，获取不到锁时降级为不加锁执行
     * 适用于 Redis 不可用时的降级场景
     */
    public <T> T executeWithLockOrFallback(String key, long timeout, TimeUnit unit, Supplier<T> supplier) {
        try {
            String lockValue = tryLock(key, timeout, unit);
            if (lockValue == null) {
                log.warn("Lock fallback (contention): {}, executing without lock", key);
                return supplier.get();
            }
            try {
                return supplier.get();
            } finally {
                unlock(key, lockValue);
            }
        } catch (Exception e) {
            log.warn("Lock fallback (redis error): {}, executing without lock", key, e);
            return supplier.get();
        }
    }
}
