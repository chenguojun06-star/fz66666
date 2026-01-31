package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.entity.SystemOperationLog;
import com.fashion.supplychain.system.service.RolePermissionService;
import com.fashion.supplychain.system.service.RoleService;
import com.fashion.supplychain.system.service.LoginLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.NoSuchElementException;

@Service
public class RoleOrchestrator {

    @Autowired
    private RoleService roleService;

    @Autowired
    private RolePermissionService rolePermissionService;

    @Autowired
    private LoginLogService loginLogService;

    public Page<Role> list(Long page, Long pageSize, String roleName, String roleCode, String status) {
        return roleService.getRolePage(page, pageSize, roleName, roleCode, status);
    }

    public Role getById(Long id) {
        Role role = roleService.getById(id);
        if (role == null) {
            throw new NoSuchElementException("角色不存在");
        }
        return role;
    }

    public boolean add(Role role) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        boolean success = roleService.save(role);
        if (!success) {
            throw new IllegalStateException("新增失败");
        }
        saveOperationLog("role", role == null ? null : String.valueOf(role.getId()), "CREATE", null);
        return true;
    }

    public boolean update(Role role) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        String remark = role == null ? null : TextUtils.safeText(role.getOperationRemark());
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        boolean success = roleService.updateById(role);
        if (!success) {
            throw new IllegalStateException("更新失败");
        }
        saveOperationLog("role", role == null ? null : String.valueOf(role.getId()), "UPDATE", remark);
        return true;
    }

    public boolean delete(Long id) {
        return delete(id, null);
    }

    public boolean delete(Long id, String remark) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        String normalized = TextUtils.safeText(remark);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        boolean success = roleService.removeById(id);
        if (!success) {
            throw new IllegalStateException("删除失败");
        }
        saveOperationLog("role", id == null ? null : String.valueOf(id), "DELETE", normalized);
        return true;
    }

    public List<Long> permissionIds(Long id) {
        if (id == null) {
            throw new IllegalArgumentException("角色ID不能为空");
        }
        return rolePermissionService.getPermissionIdsByRoleId(id);
    }

    public boolean updatePermissionIds(Long id, List<Long> permissionIds, String remark) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        if (id == null) {
            throw new IllegalArgumentException("角色ID不能为空");
        }
        String normalized = TextUtils.safeText(remark);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        boolean success = rolePermissionService.replaceRolePermissions(id, permissionIds);
        if (!success) {
            throw new IllegalStateException("保存失败");
        }
        saveOperationLog("role", String.valueOf(id), "PERMISSION_UPDATE", normalized);
        return true;
    }

    // 使用TextUtils.safeText()替代

    private void saveOperationLog(String bizType, String bizId, String action, String remark) {
        try {
            UserContext ctx = UserContext.get();
            String operator = (ctx != null ? ctx.getUsername() : null);
            loginLogService.recordOperation(bizType, bizId, action, operator, remark);
        } catch (Exception e) {
        }
    }
}
