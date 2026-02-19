package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.Permission;
import com.fashion.supplychain.system.orchestration.PermissionOrchestrator;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * 权限控制器
 */
@RestController
@RequestMapping("/api/system/permission")
@PreAuthorize("isAuthenticated()")
public class PermissionController {

    @Autowired
    private PermissionOrchestrator permissionOrchestrator;

    @PreAuthorize("hasAuthority('MENU_SYSTEM_PERMISSION_VIEW')")
    @GetMapping("/list")
    public Result<?> getPermissionList(
            @RequestParam(defaultValue = "1") Long page,
            @RequestParam(defaultValue = "10") Long pageSize,
            @RequestParam(required = false) String permissionName,
            @RequestParam(required = false) String permissionCode,
            @RequestParam(required = false) String status) {
        Page<Permission> permissionPage = permissionOrchestrator.list(page, pageSize, permissionName, permissionCode,
                status);
        return Result.success(permissionPage);
    }

    @PreAuthorize("hasAuthority('MENU_SYSTEM_PERMISSION_VIEW')")
    @GetMapping("/tree")
    public Result<?> getPermissionTree(@RequestParam(required = false) String status) {
        return Result.success(permissionOrchestrator.tree(status));
    }

    @PreAuthorize("hasAuthority('MENU_SYSTEM_PERMISSION_VIEW')")
    @GetMapping("/{id}")
    public Result<?> getPermissionById(@PathVariable Long id) {
        return Result.success(permissionOrchestrator.getById(id));
    }

    @PreAuthorize("hasAuthority('MENU_SYSTEM_PERMISSION_MANAGE')")
    @PostMapping
    public Result<?> addPermission(@RequestBody Permission permission) {
        permissionOrchestrator.add(permission);
        return Result.successMessage("新增成功");
    }

    @PreAuthorize("hasAuthority('MENU_SYSTEM_PERMISSION_MANAGE')")
    @PutMapping
    public Result<?> updatePermission(@RequestBody Permission permission) {
        permissionOrchestrator.update(permission);
        return Result.successMessage("更新成功");
    }

    @PreAuthorize("hasAuthority('MENU_SYSTEM_PERMISSION_MANAGE')")
    @DeleteMapping("/{id}")
    public Result<?> deletePermission(@PathVariable Long id) {
        permissionOrchestrator.delete(id);
        return Result.successMessage("删除成功");
    }
}
