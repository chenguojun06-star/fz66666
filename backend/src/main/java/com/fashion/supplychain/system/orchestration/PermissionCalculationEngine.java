package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.service.RedisService;
import com.fashion.supplychain.system.entity.Permission;
import com.fashion.supplychain.system.service.PermissionService;
import com.fashion.supplychain.system.service.RolePermissionService;
import com.fashion.supplychain.system.service.TenantPermissionCeilingService;
import com.fashion.supplychain.system.service.UserPermissionOverrideService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
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
        // 租户主账号且无角色：获取租户天花板内的所有权限
        if (roleId == null && isTenantOwner && tenantId != null) {
            return calculateTenantOwnerPermissions(userId, tenantId);
        }
        if (roleId == null) {
            return List.of();
        }

        // 超级管理员：直接返回角色权限（无天花板限制）
        if (tenantId == null) {
            return getRolePermissionCodes(roleId);
        }

        // 尝试从缓存获取最终权限
        String cacheKey = USER_PERM_CACHE_PREFIX + userId;
        try {
            List<String> cached = redisService.get(cacheKey);
            if (cached != null) {
                log.debug("用户权限缓存命中: userId={}", userId);
                return cached;
            }
        } catch (Exception e) {
            log.debug("用户权限缓存读取异常: userId={}", userId);
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
        try {
            redisService.set(cacheKey, permissionCodes, CACHE_TTL_MINUTES, TimeUnit.MINUTES);
        } catch (Exception e) {
            log.debug("用户权限缓存写入异常: userId={}", userId);
        }

        return permissionCodes;
    }

    /**
     * 获取角色权限ID列表（带缓存）
     */
    public List<Long> getRolePermissionIds(Long roleId) {
        if (roleId == null) return List.of();

        String cacheKey = ROLE_PERM_CACHE_PREFIX + roleId;
        try {
            List<Long> cached = redisService.get(cacheKey);
            if (cached != null) return cached;
        } catch (Exception e) { /* ignore */ }

        List<Long> ids = rolePermissionService.getPermissionIdsByRoleId(roleId);
        if (ids == null) ids = List.of();

        try {
            redisService.set(cacheKey, ids, CACHE_TTL_MINUTES, TimeUnit.MINUTES);
        } catch (Exception e) { /* ignore */ }

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
        try {
            List<Long> cached = redisService.get(cacheKey);
            if (cached != null) return cached;
        } catch (Exception e) { /* ignore */ }

        List<Long> ids = ceilingService.getGrantedPermissionIds(tenantId);

        try {
            redisService.set(cacheKey, ids, CACHE_TTL_MINUTES, TimeUnit.MINUTES);
        } catch (Exception e) { /* ignore */ }

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
        try {
            List<String> cached = redisService.get(cacheKey);
            if (cached != null) {
                return cached;
            }
        } catch (Exception e) {
            log.debug("租户主权限缓存读取异常: userId={}", userId);
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
        try {
            redisService.set(cacheKey, permissionCodes, CACHE_TTL_MINUTES, TimeUnit.MINUTES);
        } catch (Exception e) {
            log.debug("租户主权限缓存写入异常: userId={}", userId);
        }

        return permissionCodes;
    }

    // ========== 缓存清除方法 ==========

    /**
     * 清除用户权限缓存
     */
    public void evictUserPermissionCache(Long userId) {
        try {
            redisService.delete(USER_PERM_CACHE_PREFIX + userId);
        } catch (Exception e) {
            log.warn("清除用户权限缓存失败: userId={}", userId);
        }
    }

    /**
     * 清除角色权限缓存
     */
    public void evictRolePermissionCache(Long roleId) {
        try {
            redisService.delete(ROLE_PERM_CACHE_PREFIX + roleId);
        } catch (Exception e) {
            log.warn("清除角色权限缓存失败: roleId={}", roleId);
        }
    }

    /**
     * 清除租户天花板缓存
     */
    public void evictTenantCeilingCache(Long tenantId) {
        try {
            redisService.delete(TENANT_CEILING_CACHE_PREFIX + tenantId);
        } catch (Exception e) {
            log.warn("清除租户天花板缓存失败: tenantId={}", tenantId);
        }
    }
}
