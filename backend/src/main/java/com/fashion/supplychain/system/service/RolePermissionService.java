package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.RolePermission;

import java.util.List;

public interface RolePermissionService extends IService<RolePermission> {
    List<Long> getPermissionIdsByRoleId(Long roleId);

    boolean replaceRolePermissions(Long roleId, List<Long> permissionIds);
}
