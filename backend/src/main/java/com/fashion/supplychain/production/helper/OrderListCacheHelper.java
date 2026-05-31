package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class OrderListCacheHelper {

    private static final String LIST_CACHE_PREFIX = "order:list:";
    private static final String DETAIL_CACHE_PREFIX = "order:detail:";
    private static final long LIST_TTL_SECONDS = 30;
    private static final long DETAIL_TTL_SECONDS = 30;

    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    public String buildListCacheKey(Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        String tenant = tenantId != null ? "t" + tenantId : "anon";
        String factoryId = UserContext.factoryId();
        String factory = factoryId != null ? ":f" + factoryId : "";
        String queryHash = hashParams(params);
        return LIST_CACHE_PREFIX + tenant + factory + ":" + queryHash;
    }

    public String buildDetailCacheKey(String orderId) {
        Long tenantId = UserContext.tenantId();
        String tenant = tenantId != null ? "t" + tenantId : "anon";
        return DETAIL_CACHE_PREFIX + tenant + ":" + orderId;
    }

    public IPage<?> getListCache(String cacheKey) {
        if (stringRedisTemplate == null) return null;
        try {
            String json = stringRedisTemplate.opsForValue().get(cacheKey);
            if (json == null || json.isEmpty()) return null;
            return objectMapper.readValue(json, objectMapper.getTypeFactory()
                    .constructParametricType(Page.class, Map.class));
        } catch (Exception e) {
            log.debug("[OrderCache] 列表缓存读取失败, key={}, err={}", cacheKey, e.getMessage());
            safeDelete(cacheKey);
            return null;
        }
    }

    public void putListCache(String cacheKey, IPage<?> page) {
        if (stringRedisTemplate == null || page == null) return;
        try {
            String json = objectMapper.writeValueAsString(page);
            stringRedisTemplate.opsForValue().set(cacheKey, json, LIST_TTL_SECONDS, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.debug("[OrderCache] 列表缓存写入失败, key={}, err={}", cacheKey, e.getMessage());
        }
    }

    public Map<String, Object> getDetailCache(String cacheKey) {
        if (stringRedisTemplate == null) return null;
        try {
            String json = stringRedisTemplate.opsForValue().get(cacheKey);
            if (json == null || json.isEmpty()) return null;
            return objectMapper.readValue(json, objectMapper.getTypeFactory()
                    .constructMapType(Map.class, String.class, Object.class));
        } catch (Exception e) {
            log.debug("[OrderCache] 详情缓存读取失败, key={}, err={}", cacheKey, e.getMessage());
            safeDelete(cacheKey);
            return null;
        }
    }

    public void putDetailCache(String cacheKey, Object detail) {
        if (stringRedisTemplate == null || detail == null) return;
        try {
            String json = objectMapper.writeValueAsString(detail);
            stringRedisTemplate.opsForValue().set(cacheKey, json, DETAIL_TTL_SECONDS, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.debug("[OrderCache] 详情缓存写入失败, key={}, err={}", cacheKey, e.getMessage());
        }
    }

    public void evictTenantListCache() {
        if (stringRedisTemplate == null) return;
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) return;
        String pattern = LIST_CACHE_PREFIX + "t" + tenantId + ":*";
        safeDeleteByPattern(pattern);
    }

    public void evictDetailCache(String orderId) {
        if (stringRedisTemplate == null) return;
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) return;
        safeDelete(DETAIL_CACHE_PREFIX + "t" + tenantId + ":" + orderId);
    }

    private String hashParams(Map<String, Object> params) {
        try {
            String sorted = params == null ? "" : params.entrySet().stream()
                    .sorted(Map.Entry.comparingByKey())
                    .map(e -> e.getKey() + "=" + e.getValue())
                    .reduce((a, b) -> a + "&" + b)
                    .orElse("");
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(sorted.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash).substring(0, 16);
        } catch (Exception e) {
            return String.valueOf(params == null ? 0 : params.hashCode());
        }
    }

    private void safeDelete(String key) {
        try {
            stringRedisTemplate.delete(key);
        } catch (Exception e) {
            log.debug("[OrderCache] 删除缓存失败, key={}", key);
        }
    }

    private void safeDeleteByPattern(String pattern) {
        try {
            var keys = stringRedisTemplate.keys(pattern);
            if (keys != null && !keys.isEmpty()) {
                stringRedisTemplate.delete(keys);
                log.debug("[OrderCache] 清除租户列表缓存, pattern={}, count={}", pattern, keys.size());
            }
        } catch (Exception e) {
            log.debug("[OrderCache] 按pattern删除失败(可能Redis Cluster), pattern={}, err={}", pattern, e.getMessage());
            scanAndDelete(pattern);
        }
    }

    private void scanAndDelete(String pattern) {
        try (var cursor = stringRedisTemplate.scan(
                org.springframework.data.redis.core.ScanOptions.scanOptions().match(pattern).count(100).build())) {
            int count = 0;
            while (cursor.hasNext()) {
                String key = cursor.next();
                stringRedisTemplate.delete(key);
                count++;
            }
            if (count > 0) {
                log.debug("[OrderCache] SCAN清除租户列表缓存, pattern={}, count={}", pattern, count);
            }
        } catch (Exception e) {
            log.debug("[OrderCache] SCAN删除失败, pattern={}, err={}", pattern, e.getMessage());
        }
    }
}
