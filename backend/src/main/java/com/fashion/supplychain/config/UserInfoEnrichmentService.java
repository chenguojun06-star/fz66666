package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Slf4j
public class UserInfoEnrichmentService {

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    private final ConcurrentHashMap<String, String> tenantInfoCache = new ConcurrentHashMap<>();
    private static final long TENANT_CACHE_TTL_MS = 5 * 60 * 1000L;
    private static final long TENANT_CACHE_SWEEP_INTERVAL_MS = 30 * 60 * 1000L;
    private volatile long tenantCacheLastSweep = System.currentTimeMillis();

    String getTenantCache(String key) {
        String raw = tenantInfoCache.get(key);
        if (raw == null) return null;
        int sep = raw.indexOf('|');
        if (sep < 0) return null;
        long ts;
        try { ts = Long.parseLong(raw.substring(0, sep)); } catch (NumberFormatException e) { return null; }
        if (System.currentTimeMillis() - ts > TENANT_CACHE_TTL_MS) {
            tenantInfoCache.remove(key, raw);
            return null;
        }
        return raw.substring(sep + 1);
    }

    void putTenantCache(String key, String value) {
        long now = System.currentTimeMillis();
        tenantInfoCache.put(key, now + "|" + value);
        if (now - tenantCacheLastSweep > TENANT_CACHE_SWEEP_INTERVAL_MS) {
            tenantCacheLastSweep = now;
            tenantInfoCache.entrySet().removeIf(e -> {
                String v = e.getValue();
                int sep = v.indexOf('|');
                if (sep < 0) return true;
                try { return now - Long.parseLong(v.substring(0, sep)) > TENANT_CACHE_TTL_MS; }
                catch (NumberFormatException ex) { return true; }
            });
        }
    }

    void invalidateTenantCache(String key) {
        tenantInfoCache.remove(key);
    }

    public EnrichmentResult enrichFromUserId(String userId) {
        if (jdbcTemplate == null || userId == null) return null;
        String cacheKey = "u:" + userId;
        String cached = getTenantCache(cacheKey);
        boolean isOldCache = cached != null && (cached.split("\\|", -1).length < 4 || "".equals(cached.split("\\|", -1)[3]));
        boolean wasCacheMiss = (cached == null);
        if (cached == null || isOldCache) {
            try {
                List<String> rows = jdbcTemplate.query(
                    "SELECT tenant_id, is_tenant_owner, is_super_admin, factory_id FROM t_user WHERE id = ? LIMIT 1",
                    (rs, i) -> {
                        Long tid = rs.getObject(1, Long.class);
                        Boolean owner = rs.getObject(2) != null && rs.getInt(2) == 1;
                        Boolean superAdm = rs.getObject(3) != null && rs.getInt(3) == 1;
                        String fid = rs.getString(4);
                        return (tid == null ? "" : tid.toString()) + "|" + owner + "|" + superAdm + "|" + (fid == null ? "null" : fid);
                    },
                    Long.parseLong(userId)
                );
                if (!rows.isEmpty()) {
                    cached = rows.get(0);
                    putTenantCache(cacheKey, cached);
                }
            } catch (Exception e) {
                log.warn("[UserInfoEnrichment] DB查询失败, userId={}", userId, e);
            }
        }
        if (cached == null) return null;
        EnrichmentResult result = parseCachedValue(cached);
        result.wasCacheMiss = wasCacheMiss;

        if (result.tenantId == null && Boolean.TRUE.equals(result.isTenantOwner) && !Boolean.TRUE.equals(result.isSuperAdmin)) {
            healTenantOwner(userId, result);
        }
        if (result.tenantId == null && !Boolean.TRUE.equals(result.isTenantOwner) && !Boolean.TRUE.equals(result.isSuperAdmin)) {
            healNonOwnerUser(userId, result.factoryId, result);
        }
        return result;
    }

    public EnrichmentResult enrichFromUsername(String username) {
        if (jdbcTemplate == null || username == null) return null;
        String cacheKey = "u:" + username;
        String cached = getTenantCache(cacheKey);
        boolean isOldCache = cached != null && (cached.split("\\|", -1).length < 5 || "".equals(cached.split("\\|", -1)[4]));
        if (cached == null || isOldCache) {
            try {
                List<String> rows = jdbcTemplate.query(
                    "SELECT id, tenant_id, is_tenant_owner, is_super_admin, factory_id FROM t_user " +
                            "WHERE username = ? OR name = ? ORDER BY CASE WHEN username = ? THEN 0 ELSE 1 END LIMIT 1",
                    (rs, i) -> {
                        long uid = rs.getLong(1);
                        Long tid = rs.getObject(2, Long.class);
                        Boolean owner = rs.getObject(3) != null && rs.getInt(3) == 1;
                        Boolean superAdm = rs.getObject(4) != null && rs.getInt(4) == 1;
                        String fid = rs.getString(5);
                        return uid + "|" + (tid == null ? "" : tid) + "|" + owner + "|" + superAdm + "|" + (fid == null ? "null" : fid);
                    },
                    username, username, username
                );
                if (!rows.isEmpty()) {
                    cached = rows.get(0);
                    putTenantCache(cacheKey, cached);
                }
            } catch (Exception e) {
                log.warn("[UserInfoEnrichment] username查询失败, username={}", username, e);
            }
        }
        if (cached == null) return null;
        String[] parts = cached.split("\\|", -1);
        EnrichmentResult result = new EnrichmentResult();
        if (!parts[0].isEmpty()) result.userId = parts[0];
        if (parts.length > 1 && !parts[1].isEmpty()) result.tenantId = Long.parseLong(parts[1]);
        if (parts.length > 2) result.isTenantOwner = Boolean.parseBoolean(parts[2]);
        if (parts.length > 3) result.isSuperAdmin = Boolean.parseBoolean(parts[3]);
        if (parts.length > 4 && org.springframework.util.StringUtils.hasText(parts[4]) && !"null".equals(parts[4])) {
            result.factoryId = parts[4].trim();
        }
        return result;
    }

    private void healTenantOwner(String userId, EnrichmentResult result) {
        try {
            List<Long> tids = jdbcTemplate.query(
                "SELECT id FROM t_tenant WHERE owner_user_id = ? LIMIT 1",
                (rs, i) -> rs.getLong(1),
                Long.parseLong(userId)
            );
            if (!tids.isEmpty()) {
                Long recoveredTenantId = tids.get(0);
                result.tenantId = recoveredTenantId;
                jdbcTemplate.update(
                    "UPDATE t_user SET tenant_id = ? WHERE id = ? AND tenant_id IS NULL",
                    recoveredTenantId, Long.parseLong(userId)
                );
                invalidateTenantCache("u:" + userId);
                log.warn("[UserInfoEnrichment] 自愈修复: 租户主 userId={} tenant_id 已回填为 {}", userId, recoveredTenantId);
            } else {
                log.error("[UserInfoEnrichment] 严重: 租户主 userId={} 在 t_tenant 中找不到对应记录!", userId);
            }
        } catch (Exception e) {
            log.error("[UserInfoEnrichment] 自愈查询失败 userId={}", userId, e);
        }
    }

    private void healNonOwnerUser(String userId, @Nullable String factoryId, EnrichmentResult result) {
        try {
            Long recoveredTenantId = null;
            List<Long> tids = jdbcTemplate.query(
                "SELECT DISTINCT u2.tenant_id FROM t_user u1 JOIN t_user u2 ON u1.org_unit_id = u2.org_unit_id " +
                        "WHERE u1.id = ? AND u1.org_unit_id IS NOT NULL AND u2.tenant_id IS NOT NULL LIMIT 1",
                (rs, i) -> rs.getLong(1), Long.parseLong(userId)
            );
            if (!tids.isEmpty()) {
                recoveredTenantId = tids.get(0);
            }
            if (recoveredTenantId == null && org.springframework.util.StringUtils.hasText(factoryId)) {
                tids = jdbcTemplate.query(
                    "SELECT DISTINCT tenant_id FROM t_user WHERE factory_id = ? AND tenant_id IS NOT NULL LIMIT 1",
                    (rs, i) -> rs.getLong(1), factoryId
                );
                if (!tids.isEmpty()) {
                    recoveredTenantId = tids.get(0);
                }
            }
            if (recoveredTenantId == null) {
                tids = jdbcTemplate.query(
                    "SELECT DISTINCT u2.tenant_id FROM t_user u1 JOIN t_user u2 ON u1.role_id = u2.role_id " +
                            "WHERE u1.id = ? AND u2.tenant_id IS NOT NULL AND u2.id != u1.id LIMIT 1",
                    (rs, i) -> rs.getLong(1), Long.parseLong(userId)
                );
                if (!tids.isEmpty()) {
                    recoveredTenantId = tids.get(0);
                }
            }
            if (recoveredTenantId != null) {
                result.tenantId = recoveredTenantId;
                jdbcTemplate.update(
                    "UPDATE t_user SET tenant_id = ? WHERE id = ? AND tenant_id IS NULL",
                    recoveredTenantId, Long.parseLong(userId)
                );
                invalidateTenantCache("u:" + userId);
                log.warn("[UserInfoEnrichment] 非owner用户自愈: userId={} tenant_id 已回填为 {}", userId, recoveredTenantId);
            } else {
                log.error("[UserInfoEnrichment] 严重: 非owner用户 userId={} 无法推断 tenant_id!", userId);
            }
        } catch (Exception e) {
            log.error("[UserInfoEnrichment] 非owner用户自愈查询失败 userId={}", userId, e);
        }
    }

    private EnrichmentResult parseCachedValue(String cached) {
        String[] parts = cached.split("\\|", -1);
        EnrichmentResult result = new EnrichmentResult();
        if (!parts[0].isEmpty()) result.tenantId = Long.parseLong(parts[0]);
        if (parts.length > 1) result.isTenantOwner = Boolean.parseBoolean(parts[1]);
        if (parts.length > 2) result.isSuperAdmin = Boolean.parseBoolean(parts[2]);
        if (parts.length > 3 && org.springframework.util.StringUtils.hasText(parts[3]) && !"null".equals(parts[3])) {
            result.factoryId = parts[3].trim();
        }
        return result;
    }

    public static class EnrichmentResult {
        @Nullable public String userId;
        @Nullable public Long tenantId;
        @Nullable public Boolean isTenantOwner;
        @Nullable public Boolean isSuperAdmin;
        @Nullable public String factoryId;
        public boolean wasCacheMiss;
    }
}
