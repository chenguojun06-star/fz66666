package com.fashion.supplychain.common.util;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.concurrent.TimeUnit;

@Slf4j
public class RateLimitUtil {

    private RateLimitUtil() {}

    public static boolean checkRateLimit(StringRedisTemplate redis, String key, int maxRequests, int windowMinutes) {
        if (redis == null) return true;
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
            log.warn("[RateLimit] Redis异常，拒绝请求(fail-closed): key={}, error={}", key, e.getMessage());
            return false;
        }
        return true;
    }
}
