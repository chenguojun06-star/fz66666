package com.fashion.supplychain.common.lock;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.SmartLifecycle;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
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
        } catch (IllegalStateException ise) {
            // Redis 连接工厂被 Spring graceful shutdown 等场景 STOPPED，
            // 但容器仍在运行（云托管常见：SIGTERM 后未真正退出）。
            // 自愈：重启 ConnectionFactory 并重试一次，避免后续所有定时任务静默罢工。
            if (tryRecoverConnectionFactory(lockKey, ise)) {
                try {
                    Boolean retry = redisTemplate.opsForValue()
                            .setIfAbsent(lockKey, lockValue, timeout, unit);
                    if (Boolean.TRUE.equals(retry)) {
                        log.info("Lock acquired after Redis self-heal: {}", lockKey);
                        return lockValue;
                    }
                    return null;
                } catch (Exception retryErr) {
                    log.warn("Lock acquire retry failed after self-heal: {} - {}", lockKey, retryErr.getMessage());
                    return null;
                }
            }
            // 自愈未通过冷却期或失败：降级为 WARN，避免堆栈刷屏
            log.warn("Lock acquire skipped (Redis unavailable): {} - {}", lockKey, ise.getMessage());
            return null;
        } catch (Exception e) {
            log.error("Lock acquire error: {}", lockKey, e);
            return null;
        }
    }

    /**
     * 自愈冷却时间（毫秒）：避免 Redis 真挂时每次定时任务都尝试 start() 风暴
     */
    private static final long RECOVER_COOLDOWN_MS = 30_000L;
    private final AtomicLong lastRecoverAttempt = new AtomicLong(0L);

    /**
     * 尝试重启被 STOPPED 的 RedisConnectionFactory。
     * 仅当 connectionFactory 实现了 SmartLifecycle 且距离上次尝试超过冷却时间才执行。
     *
     * @return true=已尝试 start，调用方可重试一次；false=跳过（冷却中或不支持）
     */
    private boolean tryRecoverConnectionFactory(String lockKey, IllegalStateException originalErr) {
        long now = System.currentTimeMillis();
        long last = lastRecoverAttempt.get();
        if (now - last < RECOVER_COOLDOWN_MS) {
            return false;
        }
        if (!lastRecoverAttempt.compareAndSet(last, now)) {
            return false;
        }
        try {
            RedisConnectionFactory factory = redisTemplate.getConnectionFactory();
            if (factory instanceof SmartLifecycle lifecycle) {
                log.warn("Detected RedisConnectionFactory STOPPED while acquiring {}, attempting auto-restart...",
                        lockKey);
                if (!lifecycle.isRunning()) {
                    lifecycle.start();
                }
                log.info("RedisConnectionFactory restarted: running={}", lifecycle.isRunning());
                return true;
            }
            log.warn("RedisConnectionFactory is not SmartLifecycle, cannot self-heal: {}",
                    factory == null ? "null" : factory.getClass().getName());
            return false;
        } catch (Exception healErr) {
            log.error("RedisConnectionFactory self-heal failed for {}: {}", lockKey, healErr.getMessage(), healErr);
            return false;
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
            throw new IllegalStateException("获取分布式锁失败，请稍后重试: " + key);
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
     * 尝试带锁执行，获取不到锁时等待重试而非降级为无锁执行
     * 适用于并发场景下需要保证数据一致性的关键操作（扫码、入库等）
     */
    public <T> T executeWithLockOrFallback(String key, long timeout, TimeUnit unit, Supplier<T> supplier) {
        try {
            String lockValue = tryLock(key, timeout, unit);
            if (lockValue == null) {
                log.warn("Lock contention detected: {}, retrying after short wait", key);
                Thread.sleep(200);
                lockValue = tryLock(key, timeout, unit);
                if (lockValue == null) {
                    throw new IllegalStateException("系统繁忙，请稍后重试 [lock:" + key + "]");
                }
            }
            try {
                return supplier.get();
            } finally {
                unlock(key, lockValue);
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("操作被中断，请重试 [lock:" + key + "]");
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.error("Lock error for key: {}, failing safely instead of executing without lock", key, e);
            throw new IllegalStateException("系统暂时不可用，请稍后重试 [lock:" + key + "]");
        }
    }

    public <T> T executeWithStrictLock(String key, long timeout, TimeUnit unit, Supplier<T> supplier) {
        String lockValue = tryLock(key, timeout, unit);
        if (lockValue == null) {
            throw new IllegalStateException("系统繁忙，请稍后重试 [lock:" + key + "]");
        }
        try {
            return supplier.get();
        } finally {
            unlock(key, lockValue);
        }
    }
}
