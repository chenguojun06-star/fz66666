package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.orchestration.RoleOrchestrator;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 角色控制器
 */
@RestController
@RequestMapping("/api/system/role")
@PreAuthorize("isAuthenticated()")
public class RoleController {

    @Autowired
    private RoleOrchestrator roleOrchestrator;

    @GetMapping("/list")
    public Result<?> getRoleList(
            @RequestParam(defaultValue = "1") Long page,
            @RequestParam(defaultValue = "10") Long pageSize,
            @RequestParam(required = false) String roleName,
            @RequestParam(required = false) String roleCode,
            @RequestParam(required = false) String status) {
        Page<Role> rolePage = roleOrchestrator.list(page, pageSize, roleName, roleCode, status);
        return Result.success(rolePage);
    }

    @GetMapping("/{id}")
    public Result<?> getRoleById(@PathVariable Long id) {
        return Result.success(roleOrchestrator.getById(id));
    }

    @PostMapping
    public Result<?> addRole(@RequestBody Role role) {
        roleOrchestrator.add(role);
        return Result.successMessage("新增成功");
    }

    @PutMapping
    public Result<?> updateRole(@RequestBody Role role) {
        roleOrchestrator.update(role);
        return Result.successMessage("更新成功");
    }

    @DeleteMapping("/{id}")
    public Result<?> deleteRole(@PathVariable Long id,
            @RequestParam(required = false) String remark) {
        roleOrchestrator.delete(id, remark);
        return Result.successMessage("删除成功");
    }

    @GetMapping("/{id}/permission-ids")
    public Result<?> getRolePermissionIds(@PathVariable Long id) {
        return Result.success(roleOrchestrator.permissionIds(id));
    }

    @PutMapping("/{id}/permission-ids")
    public Result<?> updateRolePermissionIds(@PathVariable Long id,
            @RequestBody(required = false) Object body) {
        List<Long> permissionIds = null;
        String remark = null;
        if (body instanceof Map<?, ?> map) {
            Object ids = map.get("permissionIds");
            if (ids instanceof List<?> list) {
                permissionIds = parseIds(list);
            }
            Object r = map.get("remark");
            remark = r == null ? null : String.valueOf(r);
        } else if (body instanceof List<?> list) {
            permissionIds = parseIds(list);
        }
        roleOrchestrator.updatePermissionIds(id, permissionIds, remark);
        return Result.successMessage("保存成功");
    }

    private static List<Long> parseIds(List<?> list) {
        if (list == null) {
            return null;
        }
        List<Long> result = new ArrayList<>();
        for (Object item : list) {
            if (item == null) {
                continue;
            }
            try {
                result.add(Long.valueOf(String.valueOf(item)));
            } catch (Exception e) {
            }
        }
        return result;
    }
}
