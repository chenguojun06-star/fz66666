package com.fashion.supplychain.common.util;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.TimeUnit;

@Slf4j
public class RateLimitUtil {

    private RateLimitUtil() {}

    private static final ConcurrentHashMap<String, LocalWindow> LOCAL_FALLBACK = new ConcurrentHashMap<>();

    private static final int MAX_LOCAL_ENTRIES = 512;

    public static boolean checkRateLimit(StringRedisTemplate redis, String key, int maxRequests, int windowMinutes) {
        if (redis == null) {
            return checkLocalFallback(key, maxRequests, windowMinutes);
        }
        try {
            Long count = redis.opsForValue().increment(key);
            if (count != null && count == 1) {
                redis.expire(key, windowMinutes, TimeUnit.MINUTES);
            }
            if (count != null && count > maxRequests) {
                log.warn("[RateLimit] 限流触发: key={}, count={}/{}per{}min", key, count, maxRequests, windowMinutes);
                return false;
            }
        } catch (Exception e) {
            log.warn("[RateLimit] Redis异常，降级到本地限流: key={}, error={}", key, e.getMessage());
            return checkLocalFallback(key, maxRequests, windowMinutes);
        }
        return true;
    }

    private static boolean checkLocalFallback(String key, int maxRequests, int windowMinutes) {
        if (LOCAL_FALLBACK.size() > MAX_LOCAL_ENTRIES) {
            LOCAL_FALLBACK.clear();
        }
        LocalWindow window = LOCAL_FALLBACK.computeIfAbsent(key, k -> new LocalWindow());
        boolean allowed = window.tryAcquire(maxRequests, windowMinutes);
        if (!allowed) {
            log.warn("[RateLimit-Local] 本地限流触发: key={}, max={}/{}min", key, maxRequests, windowMinutes);
        }
        return allowed;
    }

    private static class LocalWindow {
        private final ConcurrentLinkedDeque<Long> timestamps = new ConcurrentLinkedDeque<>();

        boolean tryAcquire(int maxRequests, int windowMinutes) {
            long now = System.currentTimeMillis();
            long windowStart = now - TimeUnit.MINUTES.toMillis(windowMinutes);
            while (!timestamps.isEmpty() && timestamps.peekFirst() < windowStart) {
                timestamps.pollFirst();
            }
            if (timestamps.size() >= maxRequests) {
                return false;
            }
            timestamps.addLast(now);
            return true;
        }
    }
}
