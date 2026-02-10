package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.mapper.TenantMapper;
import com.fashion.supplychain.system.mapper.UserMapper;
import com.fashion.supplychain.system.service.TenantService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 租户服务实现
 */
@Service
public class TenantServiceImpl extends ServiceImpl<TenantMapper, Tenant> implements TenantService {

    @Autowired
    private UserMapper userMapper;

    @Override
    public Tenant findByTenantCode(String tenantCode) {
        if (tenantCode == null || tenantCode.isBlank()) {
            return null;
        }
        return getOne(new QueryWrapper<Tenant>().eq("tenant_code", tenantCode).last("LIMIT 1"));
    }

    @Override
    public Tenant findByOwnerUserId(Long ownerUserId) {
        if (ownerUserId == null) {
            return null;
        }
        return getOne(new QueryWrapper<Tenant>().eq("owner_user_id", ownerUserId).last("LIMIT 1"));
    }

    @Override
    public boolean isTenantActive(Long tenantId) {
        if (tenantId == null) {
            return false;
        }
        Tenant tenant = getById(tenantId);
        if (tenant == null) {
            return false;
        }
        if (!"active".equals(tenant.getStatus())) {
            return false;
        }
        if (tenant.getExpireTime() != null && tenant.getExpireTime().isBefore(LocalDateTime.now())) {
            return false;
        }
        return true;
    }

    @Override
    public int countTenantUsers(Long tenantId) {
        if (tenantId == null) {
            return 0;
        }
        Long count = userMapper.selectCount(new QueryWrapper<User>().eq("tenant_id", tenantId));
        return count == null ? 0 : count.intValue();
    }
}
