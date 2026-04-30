package com.fashion.supplychain.system.helper;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.orchestration.PermissionCalculationEngine;
import com.fashion.supplychain.system.orchestration.UserLoginHelper;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.LoginLogService;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@Component
@Slf4j
public class UserPermissionHelper {

    @Autowired
    private UserService userService;

    @Autowired
    private PermissionCalculationEngine permissionEngine;

    @Autowired(required = false)
    private TenantService tenantService;

    @Autowired
    private UserLoginHelper loginHelper;

    @Autowired
    private LoginLogService loginLogService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired(required = false)
    private FactoryService factoryService;

    public Map<String, Object> me() {
        User user = resolveCurrentUser();
        if (user == null) throw new NoSuchElementException("用户不存在");
        sanitizeUser(user);
        Map<String, Object> result = new HashMap<>();
        result.put("id", user.getId());
        result.put("username", user.getUsername());
        result.put("name", user.getName());
        result.put("roleId", user.getRoleId());
        result.put("roleName", user.getRoleName());
        result.put("permissionRange", user.getPermissionRange());
        result.put("phone", user.getPhone());
        result.put("email", user.getEmail());
        result.put("avatarUrl", user.getAvatarUrl());
        result.put("tenantId", user.getTenantId());
        result.put("isTenantOwner", Boolean.TRUE.equals(user.getIsTenantOwner()));
        result.put("isFactoryOwner", Boolean.TRUE.equals(user.getIsFactoryOwner()));
        result.put("isSuperAdmin", Boolean.TRUE.equals(user.getIsSuperAdmin()));
        if (user.getFactoryId() != null && !user.getFactoryId().isBlank()) {
            result.put("factoryId", user.getFactoryId());
            // 补充工厂名，供小程序首页欢迎语显示
            if (factoryService != null) {
                try {
                    Factory factory = factoryService.getById(user.getFactoryId());
                    if (factory != null && StringUtils.hasText(factory.getFactoryName())) {
                        result.put("factoryName", factory.getFactoryName());
                    }
                } catch (Exception ex) {
                    log.debug("[UserPermissionHelper] 查询工厂名失败: {}", ex.getMessage());
                }
            }
        }
        if (user.getTenantId() != null && tenantService != null) {
            try {
                Tenant currentTenant = tenantService.getById(user.getTenantId());
                if (currentTenant != null) {
                    if (StringUtils.hasText(currentTenant.getTenantName())) result.put("tenantName", currentTenant.getTenantName());
                    if (StringUtils.hasText(currentTenant.getTenantType())) result.put("tenantType", currentTenant.getTenantType());
                    if (StringUtils.hasText(currentTenant.getEnabledModules())) result.put("tenantEnabledModules", currentTenant.getEnabledModules());
                }
            } catch (Exception ex) { log.debug("[UserPermissionHelper] 查询租户信息失败: {}", ex.getMessage()); }
        }
        List<String> permissions;
        try {
            permissions = permissionEngine.calculatePermissions(user.getId(), user.getRoleId(), user.getTenantId(), Boolean.TRUE.equals(user.getIsTenantOwner()));
        } catch (Exception e) { permissions = List.of(); }
        result.put("permissions", permissions);
        return result;
    }

    public List<String> permissionsByRole(Long roleId) {
        Long rid = roleId;
        if (!UserContext.isTopAdmin()) {
            User current = resolveCurrentUser();
            if (current == null || current.getRoleId() == null) throw new AccessDeniedException("无权限操作");
            rid = current.getRoleId();
        }
        User user = resolveCurrentUser();
        if (user != null) return permissionEngine.calculatePermissions(user.getId(), rid, user.getTenantId());
        return permissionEngine.getRolePermissionCodes(rid);
    }

    @org.springframework.transaction.annotation.Transactional(rollbackFor = Exception.class)
    public void adminResetMemberPassword(String userId, String newPassword) {
        if (!StringUtils.hasText(userId)) throw new IllegalArgumentException("用户ID不能为空");
        if (!StringUtils.hasText(newPassword) || newPassword.trim().length() < 6) throw new IllegalArgumentException("新密码不能少于6个字符");
        Long tenantId = UserContext.tenantId();
        User target = userService.getById(Long.valueOf(userId));
        if (target == null) throw new NoSuchElementException("用户不存在");
        if (!java.util.Objects.equals(target.getTenantId(), tenantId)) throw new AccessDeniedException("无权操作其他租户的用户");
        if (target.getFactoryId() == null) throw new IllegalArgumentException("只能重置外发工厂成员的密码");
        target.setPassword(passwordEncoder.encode(newPassword.trim()));
        userService.updateById(target);
        loginHelper.incrementPwdVersion(target.getId());
        saveOperationLog("user", String.valueOf(target.getId()), target.getUsername(), "ADMIN_RESET_PASSWORD", "管理员重置工厂成员密码");
    }

    /**
     * 租户主账号（老板）重置同租户下任意子账号密码为默认值 123456
     * 规则：
     *   - 调用者必须是 isTenantOwner 或 isSuperAdmin
     *   - 目标用户必须属于同一租户
     *   - 不能重置主账号（isTenantOwner=true）的密码（避免循环授权混乱）
     *   - 不能重置自己的密码（应走 changePassword 流程）
     */
    public void ownerResetMemberPasswordToDefault(String userId) {
        if (!UserContext.isTenantOwner() && !UserContext.isTopAdmin()) {
            throw new AccessDeniedException("仅租户主账号或超管可执行此操作");
        }
        if (!StringUtils.hasText(userId)) throw new IllegalArgumentException("用户ID不能为空");
        Long tenantId = UserContext.tenantId();
        User target = userService.getById(Long.valueOf(userId));
        if (target == null) throw new NoSuchElementException("用户不存在");
        if (!java.util.Objects.equals(target.getTenantId(), tenantId)) {
            throw new AccessDeniedException("无权操作其他租户的用户");
        }
        if (Boolean.TRUE.equals(target.getIsTenantOwner())) {
            throw new IllegalArgumentException("不能重置主账号的密码，请联系超管操作");
        }
        String callerUserId = UserContext.userId();
        if (userId.equals(callerUserId)) {
            throw new IllegalArgumentException("不能重置自己的密码，请使用修改密码功能");
        }
        target.setPassword(passwordEncoder.encode("123456"));
        userService.updateById(target);
        loginHelper.incrementPwdVersion(target.getId());
        saveOperationLog("user", userId, target.getUsername(), "OWNER_RESET_PASSWORD", "主账号重置员工密码为默认值");
    }

    public void resetTenantOwnerPassword(Long tenantId, String newPassword) {
        if (!UserContext.isTopAdmin()) throw new AccessDeniedException("仅超管可重置租户密码");
        QueryWrapper<User> q = new QueryWrapper<>();
        q.eq("tenant_id", tenantId).eq("is_tenant_owner", true).last("LIMIT 1");
        User owner = userService.getOne(q, false);
        if (owner == null && tenantService != null) {
            Tenant tenant = tenantService.getById(tenantId);
            if (tenant != null && tenant.getOwnerUserId() != null) {
                owner = userService.getById(tenant.getOwnerUserId());
                if (owner != null && !java.util.Objects.equals(owner.getTenantId(), tenantId)) {
                    owner = null;
                }
                if (owner != null && !Boolean.TRUE.equals(owner.getIsTenantOwner())) {
                    owner.setIsTenantOwner(true);
                    userService.updateById(owner);
                    log.info("[resetTenantOwnerPassword] 修复 is_tenant_owner 标记: userId={}", owner.getId());
                }
            }
        }
        if (owner == null) throw new NoSuchElementException("未找到该租户主账号");
        owner.setPassword(passwordEncoder.encode(newPassword));
        userService.updateById(owner);
        loginHelper.incrementPwdVersion(owner.getId());
        saveOperationLog("user", String.valueOf(owner.getId()), owner.getUsername(), "RESET_PASSWORD", "超管重置租户主账号密码: tenantId=" + tenantId);
    }

    public User resolveCurrentUser() {
        UserContext ctx = UserContext.get();
        String userId = ctx == null ? null : safeTrim(ctx.getUserId());
        String username = ctx == null ? null : safeTrim(ctx.getUsername());
        User byId = null;
        if (StringUtils.hasText(userId)) {
            try { byId = userService.getById(Long.valueOf(userId)); } catch (Exception e) { log.warn("Failed to resolve current user by userId: userId={}", userId, e); }
        }
        if (byId != null) return byId;
        if (!StringUtils.hasText(username)) return null;
        QueryWrapper<User> q = new QueryWrapper<>();
        q.eq("username", username);
        return userService.getOne(q, false);
    }

    public void sanitizeUser(User user) { if (user != null) user.setPassword(null); }

    private static String safeTrim(String s) { if (s == null) return null; String t = s.trim(); return t.isEmpty() ? null : t; }

    private void saveOperationLog(String bizType, String bizId, String targetName, String action, String remark) {
        try {
            UserContext ctx = UserContext.get();
            String operator = (ctx != null ? ctx.getUsername() : null);
            loginLogService.recordOperation(bizType, bizId, targetName, action, operator, remark);
        } catch (Exception e) { log.warn("[UserPermissionHelper] 记录操作日志失败: {}", e.getMessage()); }
    }
}
