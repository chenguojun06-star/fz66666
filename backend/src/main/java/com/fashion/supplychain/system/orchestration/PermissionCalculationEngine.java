package com.fashion.supplychain.system.orchestration;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.service.RedisService;
import com.fashion.supplychain.system.entity.Permission;
import com.fashion.supplychain.system.service.PermissionService;
import com.fashion.supplychain.system.service.RolePermissionService;
import com.fashion.supplychain.system.service.TenantPermissionCeilingService;
import com.fashion.supplychain.system.service.UserPermissionOverrideService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * 三级权限计算引擎
 *
 * 权限计算公式：
 *   最终权限 = (角色权限 ∩ 租户天花板) ∪ 用户GRANT覆盖 - 用户REVOKE覆盖
 *
 * 三层含义：
 *   Level 1: 角色权限 — 用户所属角色拥有的权限（来自 t_role_permission）
 *   Level 2: 租户天花板 — 超级管理员为租户设置的可用权限范围（来自 t_tenant_permission_ceiling）
 *             如果租户无天花板记录，默认所有权限可用
 *   Level 3: 用户覆盖 — 针对特定用户的微调（来自 t_user_permission_override）
 *             GRANT = 额外授予（但仍受天花板约束）
 *             REVOKE = 撤销
 *
 * 超级管理员（tenantId=null）：直接获取全部权限，跳过天花板和覆盖计算
 */
@Service
@Slf4j
public class PermissionCalculationEngine {

    /** 用户最终权限缓存前缀 */
    private static final String USER_PERM_CACHE_PREFIX = "user:perms:";
    /** 角色权限缓存前缀 */
    private static final String ROLE_PERM_CACHE_PREFIX = "role:perms:";
    /** 租户天花板缓存前缀 */
    private static final String TENANT_CEILING_CACHE_PREFIX = "tenant:ceiling:";
    /** 超管权限缓存key */
    private static final String SUPER_ALL_PERM_CACHE_KEY = "super:all:perms";
    /** 缓存TTL 30分钟 */
    private static final long CACHE_TTL_MINUTES = 30;

    @Autowired
    private RolePermissionService rolePermissionService;

    @Autowired
    private PermissionService permissionService;

    @Autowired
    private TenantPermissionCeilingService ceilingService;

    @Autowired
    private UserPermissionOverrideService overrideService;

    @Autowired
    private RedisService redisService;

    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    private final Set<String> brokenCacheWarnedKeys = ConcurrentHashMap.newKeySet();

    /**
     * 启动时清理旧格式权限缓存，防止序列化版本升级后反复出现 WARN
     * 触发场景：新容器替换旧容器时，旧 Redis key 格式不兼容新序列化配置
     * 清理后首次访问自动以新格式重建，零 WARN 运行
     */
    @PostConstruct
    public void clearLegacyPermissionCache() {
        long role = 0;
        long user = 0;
        long ceiling = 0;
        try {
            if (redisService != null) {
                role = redisService.deleteByPattern(ROLE_PERM_CACHE_PREFIX + "*");
                user = redisService.deleteByPattern(USER_PERM_CACHE_PREFIX + "*");
                ceiling = redisService.deleteByPattern(TENANT_CEILING_CACHE_PREFIX + "*");
            }
        } catch (Exception e) {
            log.warn("[PermissionCache] 权限缓存批量清理失败，影响不大，首次访问时自愈: {}", e.getMessage());
        }

        try {
            if (stringRedisTemplate != null) {
                stringRedisTemplate.delete(SUPER_ALL_PERM_CACHE_KEY);
            }
            log.info("[PermissionCache] 启动清理完成：role={}, user={}, ceiling={}, super={} — 旧格式缓存已删除，将按稳定JSON重建",
                    role, user, ceiling, stringRedisTemplate != null ? 1 : 0);
        } catch (Exception e) {
            log.warn("[PermissionCache] 超管权限缓存清理失败，影响不大，首次访问时自愈: {}", e.getMessage());
        }
    }

    /**
     * 计算用户最终权限代码列表
     *
     * @param userId   用户ID
     * @param roleId   角色ID
     * @param tenantId 租户ID（null=超级管理员）
     * @return 权限代码列表
     */
    public List<String> calculatePermissions(Long userId, Long roleId, Long tenantId) {
        return calculatePermissions(userId, roleId, tenantId, false);
    }

    /**
     * 计算用户最终权限代码列表（支持租户主账号）
     *
     * @param userId        用户ID
     * @param roleId        角色ID
     * @param tenantId      租户ID（null=超级管理员）
     * @param isTenantOwner 是否为租户主账号
     * @return 权限代码列表
     */
    public List<String> calculatePermissions(Long userId, Long roleId, Long tenantId, boolean isTenantOwner) {
        // 超级管理员（tenantId=null）：跳过天花板和角色限制，直接返回系统全部权限
        // 以后新增任何权限，超管自动获得，无需手动配置
        if (tenantId == null) {
            if (roleId != null) {
                return getRolePermissionCodes(roleId);
            }
            return getAllPermissionCodes();
        }

        // 租户主账号且无角色：获取租户天花板内的所有权限
        if (roleId == null && isTenantOwner && tenantId != null) {
            return calculateTenantOwnerPermissions(userId, tenantId);
        }
        if (roleId == null) {
            return List.of();
        }

        // 尝试从缓存获取最终权限
        String cacheKey = USER_PERM_CACHE_PREFIX + userId;
        List<String> cachedUserPerms = readCacheList(cacheKey, new TypeReference<List<String>>() {}, "user-perms");
        if (cachedUserPerms != null) {
            log.debug("用户权限缓存命中: userId={}", userId);
            return cachedUserPerms;
        }

        // Level 1: 角色权限
        Set<Long> rolePermIds = new HashSet<>(getRolePermissionIds(roleId));
        if (rolePermIds.isEmpty()) {
            return List.of();
        }

        // Level 2: 租户天花板（如果有配置则取交集，否则全部允许）
        Set<Long> effectivePermIds = applyTenantCeiling(rolePermIds, tenantId);

        // Level 3: 用户覆盖
        if (userId != null) {
            effectivePermIds = applyUserOverrides(effectivePermIds, userId, tenantId);
        }

        // 转换为权限代码
        List<String> permissionCodes = convertToPermissionCodes(effectivePermIds);

        // 写入缓存
        writeCache(cacheKey, permissionCodes, "user-perms");

        return permissionCodes;
    }

    /**
     * 获取角色权限ID列表（带缓存）
     */
    public List<Long> getRolePermissionIds(Long roleId) {
        if (roleId == null) return List.of();

        String cacheKey = ROLE_PERM_CACHE_PREFIX + roleId;
        List<Long> cachedRolePerms = readCacheList(cacheKey, new TypeReference<List<Long>>() {}, "role-perms");
        if (cachedRolePerms != null) return cachedRolePerms;

        List<Long> ids = rolePermissionService.getPermissionIdsByRoleId(roleId);
        if (ids == null) ids = List.of();

        writeCache(cacheKey, ids, "role-perms");

        return ids;
    }

    /**
     * 获取角色权限代码列表
     */
    public List<String> getRolePermissionCodes(Long roleId) {
        List<Long> ids = getRolePermissionIds(roleId);
        return convertToPermissionCodes(new HashSet<>(ids));
    }

    /**
     * 获取系统全部权限代码列表（超管专用）
     * 带缓存，新增权限后TTL内自动生效
     */
    private List<String> getAllPermissionCodes() {
        String cacheKey = SUPER_ALL_PERM_CACHE_KEY;
        List<String> cached = readCacheList(cacheKey, new TypeReference<List<String>>() {}, "super-all-perms");
        if (cached != null) return cached;

        List<String> codes = permissionService.list().stream()
                .map(Permission::getPermissionCode)
                .filter(c -> c != null && !c.isBlank())
                .sorted()
                .collect(Collectors.toList());

        writeCache(cacheKey, codes, "super-all-perms");

        return codes;
    }

    /**
     * Level 2: 应用租户天花板
     * 如果租户有天花板配置 → 取交集（角色权限 ∩ 天花板GRANTED权限）
     * 如果租户无天花板配置 → 全部允许（不做限制）
     */
    private Set<Long> applyTenantCeiling(Set<Long> rolePermIds, Long tenantId) {
        List<Long> grantedIds = getCeilingGrantedIds(tenantId);

        // 如果没有天花板配置，默认全部允许
        if (grantedIds == null || grantedIds.isEmpty()) {
            return new HashSet<>(rolePermIds);
        }

        // 取交集
        Set<Long> ceilingSet = new HashSet<>(grantedIds);
        Set<Long> result = new HashSet<>(rolePermIds);
        result.retainAll(ceilingSet);
        return result;
    }

    /**
     * Level 3: 应用用户覆盖
     * GRANT: 额外授予（但仍受天花板约束）
     * REVOKE: 撤销
     */
    private Set<Long> applyUserOverrides(Set<Long> currentPermIds, Long userId, Long tenantId) {
        List<Long> grantIds = overrideService.getGrantPermissionIds(userId);
        List<Long> revokeIds = overrideService.getRevokePermissionIds(userId);

        Set<Long> result = new HashSet<>(currentPermIds);

        // 添加GRANT（但需受天花板约束）
        if (grantIds != null && !grantIds.isEmpty()) {
            List<Long> ceilingGranted = getCeilingGrantedIds(tenantId);
            for (Long grantId : grantIds) {
                // 如果有天花板，额外授予的权限也必须在天花板范围内
                if (ceilingGranted == null || ceilingGranted.isEmpty() || ceilingGranted.contains(grantId)) {
                    result.add(grantId);
                }
            }
        }

        // 移除REVOKE
        if (revokeIds != null && !revokeIds.isEmpty()) {
            result.removeAll(new HashSet<>(revokeIds));
        }

        return result;
    }

    /**
     * 获取租户天花板GRANTED权限ID（带缓存）
     */
    private List<Long> getCeilingGrantedIds(Long tenantId) {
        if (tenantId == null) return null;

        String cacheKey = TENANT_CEILING_CACHE_PREFIX + tenantId;
        List<Long> cached = readCacheList(cacheKey, new TypeReference<List<Long>>() {}, "tenant-ceiling");
        if (cached != null) return cached;

        List<Long> ids = ceilingService.getGrantedPermissionIds(tenantId);

        writeCache(cacheKey, ids, "tenant-ceiling");

        return ids;
    }

    /**
     * 权限ID集合转权限代码
     */
    private List<String> convertToPermissionCodes(Set<Long> permIds) {
        if (permIds == null || permIds.isEmpty()) {
            return List.of();
        }
        return permissionService.listByIds(new ArrayList<>(permIds)).stream()
                .map(Permission::getPermissionCode)
                .filter(Objects::nonNull)
                .sorted()
                .collect(Collectors.toList());
    }

    /**
     * 计算租户主账号的权限
     * 租户主账号获得：天花板范围内的全部权限（如果无天花板则获得系统全部权限）
     */
    private List<String> calculateTenantOwnerPermissions(Long userId, Long tenantId) {
        // 尝试从缓存获取
        String cacheKey = USER_PERM_CACHE_PREFIX + userId;
        List<String> cached = readCacheList(cacheKey, new TypeReference<List<String>>() {}, "tenant-owner-user-perms");
        if (cached != null) {
            return cached;
        }

        // 获取系统全部权限ID
        List<Permission> allPerms = permissionService.list();
        Set<Long> allPermIds = allPerms.stream()
                .map(Permission::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        // 应用天花板
        Set<Long> effectivePermIds = applyTenantCeiling(allPermIds, tenantId);

        // 应用用户覆盖
        if (userId != null) {
            effectivePermIds = applyUserOverrides(effectivePermIds, userId, tenantId);
        }

        List<String> permissionCodes = convertToPermissionCodes(effectivePermIds);

        // 写入缓存
        writeCache(cacheKey, permissionCodes, "tenant-owner-user-perms");

        return permissionCodes;
    }

    private <T> List<T> readCacheList(String key, TypeReference<List<T>> typeRef, String cacheName) {
        if (stringRedisTemplate == null) {
            return null;
        }
        try {
            String raw = stringRedisTemplate.opsForValue().get(key);
            if (raw == null || raw.isBlank()) {
                return null;
            }
            List<T> parsed = objectMapper.readValue(raw, typeRef);
            if (parsed != null) {
                brokenCacheWarnedKeys.remove(key);
            }
            return parsed;
        } catch (Exception e) {
            List<T> fallback = parseLegacyCache(rawValue(key), cacheName);
            if (fallback != null) {
                writeCache(key, fallback, cacheName + "-migrated");
                brokenCacheWarnedKeys.remove(key);
                log.info("[PermissionCache] 已自动迁移旧格式缓存: cache={} key={}", cacheName, key);
                return fallback;
            }

            if (brokenCacheWarnedKeys.add(key)) {
                log.warn("[PermissionCache] 读取{}失败，删除损坏key后回源DB: key={} err={}", cacheName, key, e.getMessage());
            } else {
                log.debug("[PermissionCache] 重复读取损坏缓存，已降级debug: cache={} key={} err={}", cacheName, key, e.getMessage());
            }
            safeDeleteKey(key);
            return null;
        }
    }

    private String rawValue(String key) {
        try {
            return stringRedisTemplate == null ? null : stringRedisTemplate.opsForValue().get(key);
        } catch (Exception ignored) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private <T> List<T> parseLegacyCache(String raw, String cacheName) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            if (cacheName.contains("role-perms") || cacheName.contains("tenant-ceiling")) {
                List<Long> longs = new ArrayList<>();
                collectLongs(objectMapper.readTree(raw), longs);
                if (!longs.isEmpty()) {
                    return (List<T>) longs;
                }
            }
            if (cacheName.contains("user-perms") || cacheName.contains("super-all-perms")) {
                List<String> strings = new ArrayList<>();
                collectStrings(objectMapper.readTree(raw), strings);
                if (!strings.isEmpty()) {
                    return (List<T>) strings;
                }
            }
        } catch (Exception ignored) {
            return null;
        }
        return null;
    }

    private void collectLongs(com.fasterxml.jackson.databind.JsonNode node, List<Long> out) {
        if (node == null || node.isNull()) {
            return;
        }
        if (node.isArray()) {
            node.forEach(child -> collectLongs(child, out));
            return;
        }
        if (node.isNumber()) {
            out.add(node.asLong());
            return;
        }
        if (node.isTextual()) {
            String v = node.asText();
            if (v != null && !v.isBlank()) {
                try {
                    out.add(Long.parseLong(v.trim()));
                } catch (NumberFormatException ignored) {
                }
            }
        }
    }

    private void collectStrings(com.fasterxml.jackson.databind.JsonNode node, List<String> out) {
        if (node == null || node.isNull()) {
            return;
        }
        if (node.isArray()) {
            node.forEach(child -> collectStrings(child, out));
            return;
        }
        String v = node.asText();
        if (v != null && !v.isBlank()) {
            out.add(v.trim());
        }
    }

    private void safeDeleteKey(String key) {
        try {
            if (stringRedisTemplate != null) {
                stringRedisTemplate.delete(key);
            }
        } catch (Exception ignored) {
        }
    }

    private void writeCache(String key, List<?> value, String cacheName) {
        if (stringRedisTemplate == null) {
            return;
        }
        try {
            stringRedisTemplate.opsForValue().set(
                    key,
                    objectMapper.writeValueAsString(value == null ? List.of() : value),
                    CACHE_TTL_MINUTES,
                    TimeUnit.MINUTES
            );
        } catch (Exception e) {
            log.debug("[PermissionCache] 写入{}失败: key={} err={}", cacheName, key, e.getMessage());
        }
    }

    // ========== 缓存清除方法 ==========

    /**
     * 清除用户权限缓存
     */
    public void evictUserPermissionCache(Long userId) {
        try {
            if (stringRedisTemplate != null) {
                stringRedisTemplate.delete(USER_PERM_CACHE_PREFIX + userId);
            } else {
                redisService.delete(USER_PERM_CACHE_PREFIX + userId);
            }
        } catch (Exception e) {
            log.warn("清除用户权限缓存失败: userId={}", userId);
        }
    }

    /**
     * 清除角色权限缓存
     */
    public void evictRolePermissionCache(Long roleId) {
        try {
            if (stringRedisTemplate != null) {
                stringRedisTemplate.delete(ROLE_PERM_CACHE_PREFIX + roleId);
            } else {
                redisService.delete(ROLE_PERM_CACHE_PREFIX + roleId);
            }
        } catch (Exception e) {
            log.warn("清除角色权限缓存失败: roleId={}", roleId);
        }
    }

    /**
     * 清除租户天花板缓存
     */
    public void evictTenantCeilingCache(Long tenantId) {
        try {
            if (stringRedisTemplate != null) {
                stringRedisTemplate.delete(TENANT_CEILING_CACHE_PREFIX + tenantId);
            } else {
                redisService.delete(TENANT_CEILING_CACHE_PREFIX + tenantId);
            }
        } catch (Exception e) {
            log.warn("清除租户天花板缓存失败: tenantId={}", tenantId);
        }
    }

    /**
     * 批量清除所有用户权限缓存
     * 角色权限变更时调用，确保持有该角色的所有用户权限立即生效，无需等待 30 分钟 TTL
     */
    public void evictAllUserPermissionCaches() {
        try {
            if (redisService != null) {
                long deleted = redisService.deleteByPattern(USER_PERM_CACHE_PREFIX + "*");
                log.info("[PermissionCache] 角色权限变更批量清除用户缓存完成: deleted={}", deleted);
            }
        } catch (Exception e) {
            log.warn("[PermissionCache] 批量清除用户权限缓存失败，权限变更将在 TTL(30分钟)后自动生效: {}", e.getMessage());
        }
    }
}
