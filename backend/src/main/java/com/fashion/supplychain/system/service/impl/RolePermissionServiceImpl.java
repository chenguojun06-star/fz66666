package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.RolePermission;
import com.fashion.supplychain.system.mapper.RolePermissionMapper;
import com.fashion.supplychain.system.service.RolePermissionService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;

@Service
public class RolePermissionServiceImpl extends ServiceImpl<RolePermissionMapper, RolePermission>
        implements RolePermissionService {

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
    @Transactional
    public boolean replaceRolePermissions(Long roleId, List<Long> permissionIds) {
        if (roleId == null) {
            return false;
        }

        this.remove(new LambdaQueryWrapper<RolePermission>().eq(RolePermission::getRoleId, roleId));

        if (permissionIds == null || permissionIds.isEmpty()) {
            return true;
        }

        LinkedHashSet<Long> distinct = new LinkedHashSet<>();
        for (Long id : permissionIds) {
            if (id != null) {
                distinct.add(id);
            }
        }
        if (distinct.isEmpty()) {
            return true;
        }

        List<RolePermission> batch = new ArrayList<>(distinct.size());
        for (Long pid : distinct) {
            RolePermission rp = new RolePermission();
            rp.setRoleId(roleId);
            rp.setPermissionId(pid);
            batch.add(rp);
        }
        return this.saveBatch(batch);
    }
}
