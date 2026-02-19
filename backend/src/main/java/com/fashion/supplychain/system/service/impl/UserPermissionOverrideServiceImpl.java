package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.UserPermissionOverride;
import com.fashion.supplychain.system.mapper.UserPermissionOverrideMapper;
import com.fashion.supplychain.system.service.UserPermissionOverrideService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class UserPermissionOverrideServiceImpl
        extends ServiceImpl<UserPermissionOverrideMapper, UserPermissionOverride>
        implements UserPermissionOverrideService {

    @Override
    public List<Long> getGrantPermissionIds(Long userId) {
        return list(new LambdaQueryWrapper<UserPermissionOverride>()
                .eq(UserPermissionOverride::getUserId, userId)
                .eq(UserPermissionOverride::getOverrideType, "GRANT"))
                .stream()
                .map(UserPermissionOverride::getPermissionId)
                .collect(Collectors.toList());
    }

    @Override
    public List<Long> getRevokePermissionIds(Long userId) {
        return list(new LambdaQueryWrapper<UserPermissionOverride>()
                .eq(UserPermissionOverride::getUserId, userId)
                .eq(UserPermissionOverride::getOverrideType, "REVOKE"))
                .stream()
                .map(UserPermissionOverride::getPermissionId)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void replaceOverrides(Long userId, Long tenantId, List<Long> grantIds, List<Long> revokeIds) {
        // 删除旧数据
        remove(new LambdaQueryWrapper<UserPermissionOverride>()
                .eq(UserPermissionOverride::getUserId, userId));

        List<UserPermissionOverride> overrides = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();

        // 插入GRANT
        if (grantIds != null) {
            for (Long permId : grantIds) {
                UserPermissionOverride o = new UserPermissionOverride();
                o.setUserId(userId);
                o.setPermissionId(permId);
                o.setOverrideType("GRANT");
                o.setTenantId(tenantId);
                o.setCreateTime(now);
                overrides.add(o);
            }
        }

        // 插入REVOKE
        if (revokeIds != null) {
            for (Long permId : revokeIds) {
                UserPermissionOverride o = new UserPermissionOverride();
                o.setUserId(userId);
                o.setPermissionId(permId);
                o.setOverrideType("REVOKE");
                o.setTenantId(tenantId);
                o.setCreateTime(now);
                overrides.add(o);
            }
        }

        if (!overrides.isEmpty()) {
            saveBatch(overrides);
        }
    }
}
