package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.RolePermission;
import com.fashion.supplychain.system.mapper.RolePermissionMapper;
import com.fashion.supplychain.system.orchestration.RolePermissionOrchestrator;
import com.fashion.supplychain.system.service.RolePermissionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;

@Service
public class RolePermissionServiceImpl extends ServiceImpl<RolePermissionMapper, RolePermission>
        implements RolePermissionService {

    @Autowired
    private RolePermissionOrchestrator rolePermissionOrchestrator;

    @Override
    public List<Long> getPermissionIdsByRoleId(Long roleId) {
        if (roleId == null) {
            return Collections.emptyList();
        }
        return this.list(new LambdaQueryWrapper<RolePermission>().eq(RolePermission::getRoleId, roleId)).stream()
                .map(RolePermission::getPermissionId)
                .filter(v -> v != null)
                .toList();
    }

    @Override
    public boolean replaceRolePermissions(Long roleId, List<Long> permissionIds) {
        return rolePermissionOrchestrator.replaceRolePermissions(roleId, permissionIds);
    }
}
