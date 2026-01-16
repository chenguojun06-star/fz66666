package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.service.RolePermissionService;
import com.fashion.supplychain.system.service.RoleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.NoSuchElementException;

@Service
public class RoleOrchestrator {

    @Autowired
    private RoleService roleService;

    @Autowired
    private RolePermissionService rolePermissionService;

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
        return true;
    }

    public boolean update(Role role) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        boolean success = roleService.updateById(role);
        if (!success) {
            throw new IllegalStateException("更新失败");
        }
        return true;
    }

    public boolean delete(Long id) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        boolean success = roleService.removeById(id);
        if (!success) {
            throw new IllegalStateException("删除失败");
        }
        return true;
    }

    public List<Long> permissionIds(Long id) {
        if (id == null) {
            throw new IllegalArgumentException("角色ID不能为空");
        }
        return rolePermissionService.getPermissionIdsByRoleId(id);
    }

    public boolean updatePermissionIds(Long id, List<Long> permissionIds) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        if (id == null) {
            throw new IllegalArgumentException("角色ID不能为空");
        }
        boolean success = rolePermissionService.replaceRolePermissions(id, permissionIds);
        if (!success) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }
}
