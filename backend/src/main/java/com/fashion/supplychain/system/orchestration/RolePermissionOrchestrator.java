package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.system.entity.RolePermission;
import com.fashion.supplychain.system.service.RolePermissionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

@Service
public class RolePermissionOrchestrator {

    @Autowired
    private RolePermissionService rolePermissionService;

    @Transactional(rollbackFor = Exception.class)
    public boolean replaceRolePermissions(Long roleId, List<Long> permissionIds) {
        if (roleId == null) {
            return false;
        }

        rolePermissionService.remove(new LambdaQueryWrapper<RolePermission>().eq(RolePermission::getRoleId, roleId));

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
        return rolePermissionService.saveBatch(batch);
    }
}
