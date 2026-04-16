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
    public Tenant findByCodeOrName(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return null;
        }
        // 1. 优先精确编码匹配（大小写不敏感）
        Tenant byCode = getOne(new QueryWrapper<Tenant>()
                .eq("tenant_code", keyword.trim()).last("LIMIT 1"));
        if (byCode != null) {
            return byCode;
        }
        // 2. 编码未命中，尝试名称模糊匹配（仅匹配 active 租户）
        java.util.List<Tenant> byName = list(new QueryWrapper<Tenant>()
                .like("tenant_name", keyword.trim())
                .eq("status", "active"));
        if (byName.size() == 1) {
            return byName.get(0);
        }
        if (byName.size() > 1) {
            // 多个同名工厂，无法自动区分
            throw new IllegalArgumentException(
                    "找到 " + byName.size() + " 个名称包含\"" + keyword + "\"的工厂，请使用精确工厂编码注册");
        }
        return null;
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
