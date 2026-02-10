package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.TenantPermissionCeiling;
import com.fashion.supplychain.system.mapper.TenantPermissionCeilingMapper;
import com.fashion.supplychain.system.service.TenantPermissionCeilingService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class TenantPermissionCeilingServiceImpl
        extends ServiceImpl<TenantPermissionCeilingMapper, TenantPermissionCeiling>
        implements TenantPermissionCeilingService {

    @Override
    public List<Long> getGrantedPermissionIds(Long tenantId) {
        return list(new LambdaQueryWrapper<TenantPermissionCeiling>()
                .eq(TenantPermissionCeiling::getTenantId, tenantId)
                .eq(TenantPermissionCeiling::getStatus, "GRANTED"))
                .stream()
                .map(TenantPermissionCeiling::getPermissionId)
                .collect(Collectors.toList());
    }

    @Override
    public List<Long> getBlockedPermissionIds(Long tenantId) {
        return list(new LambdaQueryWrapper<TenantPermissionCeiling>()
                .eq(TenantPermissionCeiling::getTenantId, tenantId)
                .eq(TenantPermissionCeiling::getStatus, "BLOCKED"))
                .stream()
                .map(TenantPermissionCeiling::getPermissionId)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void replaceCeiling(Long tenantId, List<Long> grantedPermissionIds) {
        // 删除旧数据
        remove(new LambdaQueryWrapper<TenantPermissionCeiling>()
                .eq(TenantPermissionCeiling::getTenantId, tenantId));

        // 批量插入新数据
        if (grantedPermissionIds != null && !grantedPermissionIds.isEmpty()) {
            List<TenantPermissionCeiling> ceilings = new ArrayList<>();
            LocalDateTime now = LocalDateTime.now();
            for (Long permId : grantedPermissionIds) {
                TenantPermissionCeiling c = new TenantPermissionCeiling();
                c.setTenantId(tenantId);
                c.setPermissionId(permId);
                c.setStatus("GRANTED");
                c.setCreateTime(now);
                c.setUpdateTime(now);
                ceilings.add(c);
            }
            saveBatch(ceilings);
        }
    }
}
