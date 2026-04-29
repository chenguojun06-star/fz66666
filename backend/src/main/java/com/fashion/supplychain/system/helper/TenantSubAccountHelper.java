package com.fashion.supplychain.system.helper;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.RoleService;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.stream.Collectors;

@Component
@Slf4j
public class TenantSubAccountHelper {

    @Autowired private PasswordEncoder passwordEncoder;

    @Autowired private TenantService tenantService;
    @Autowired private UserService userService;
    @Autowired private RoleService roleService;

    @Transactional(rollbackFor = Exception.class)
    public User addSubAccount(User userData) {
        assertTenantOwner();

        Long tenantId = UserContext.tenantId();

        Tenant tenant = tenantService.getById(tenantId);
        if (tenant != null && tenant.getMaxUsers() != null && tenant.getMaxUsers() > 0) {
            int currentCount = tenantService.countTenantUsers(tenantId);
            if (currentCount >= tenant.getMaxUsers()) {
                throw new IllegalStateException("已达到最大用户数限制: " + tenant.getMaxUsers());
            }
        }

        QueryWrapper<User> userQuery = new QueryWrapper<>();
        userQuery.eq("username", userData.getUsername());
        if (userService.count(userQuery) > 0) {
            throw new IllegalArgumentException("用户名已存在: " + userData.getUsername());
        }

        userData.setTenantId(tenantId);
        userData.setIsTenantOwner(false);
        userData.setPassword(passwordEncoder.encode(userData.getPassword()));
        userData.setStatus("active");
        userData.setApprovalStatus("approved");
        userData.setCreateTime(LocalDateTime.now());
        userData.setUpdateTime(LocalDateTime.now());

        if (userData.getRoleId() != null) {
            Role role = roleService.getById(userData.getRoleId());
            if (role != null) {
                userData.setRoleName(role.getRoleName());
            }
        }
        if (!StringUtils.hasText(userData.getPermissionRange())) {
            userData.setPermissionRange("own");
        }

        userService.save(userData);
        return sanitizeUser(userData);
    }

    public Page<User> listSubAccounts(Long page, Long pageSize, String name, String roleName) {
        assertTenantOwnerOrAdmin();

        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return userService.getUserPage(page, pageSize, null, name, roleName, null);
        }

        QueryWrapper<User> query = new QueryWrapper<>();
        query.eq("tenant_id", tenantId);
        if (StringUtils.hasText(name)) {
            query.like("name", name);
        }
        if (StringUtils.hasText(roleName)) {
            query.like("role_name", roleName);
        }
        query.orderByDesc("create_time");
        Page<User> result = userService.page(new Page<>(page != null ? page : 1, pageSize != null ? pageSize : 20), query);
        if (result.getRecords() != null) {
            result.setRecords(result.getRecords().stream().map(this::sanitizeUser).collect(Collectors.toList()));
        }
        return result;
    }

    public boolean updateSubAccount(User userData) {
        assertTenantOwner();

        User existing = userService.getById(userData.getId());
        if (existing == null) {
            throw new IllegalArgumentException("用户不存在");
        }

        Long tenantId = UserContext.tenantId();
        if (!tenantId.equals(existing.getTenantId())) {
            throw new AccessDeniedException("无权操作其他租户的用户");
        }

        userData.setTenantId(null);
        userData.setIsTenantOwner(null);
        if (StringUtils.hasText(userData.getPassword())) {
            userData.setPassword(passwordEncoder.encode(userData.getPassword()));
        } else {
            userData.setPassword(null);
        }
        userData.setUpdateTime(LocalDateTime.now());

        if (userData.getRoleId() != null) {
            Role role = roleService.getById(userData.getRoleId());
            if (role != null) {
                userData.setRoleName(role.getRoleName());
            }
        }

        return userService.updateById(userData);
    }

    public boolean deleteSubAccount(Long userId) {
        assertTenantOwner();

        User existing = userService.getById(userId);
        if (existing == null) {
            throw new IllegalArgumentException("用户不存在");
        }

        Long tenantId = UserContext.tenantId();
        if (!tenantId.equals(existing.getTenantId())) {
            throw new AccessDeniedException("无权操作其他租户的用户");
        }
        if (Boolean.TRUE.equals(existing.getIsTenantOwner())) {
            throw new IllegalStateException("不能删除租户主账号");
        }

        return userService.removeById(userId);
    }

    private User sanitizeUser(User user) {
        if (user != null) { user.setPassword(null); }
        return user;
    }

    private void assertTenantOwner() {
        if (UserContext.isSuperAdmin()) return;
        if (!UserContext.isTenantOwner()) {
            throw new AccessDeniedException("仅租户主账号可执行此操作");
        }
        if (UserContext.tenantId() == null) {
            throw new AccessDeniedException("租户信息异常");
        }
    }

    private void assertTenantOwnerOrAdmin() {
        if (UserContext.isSuperAdmin()) return;
        if (UserContext.isTenantOwner()) return;
        if (UserContext.isTopAdmin()) return;
        throw new AccessDeniedException("无权限操作");
    }
}
