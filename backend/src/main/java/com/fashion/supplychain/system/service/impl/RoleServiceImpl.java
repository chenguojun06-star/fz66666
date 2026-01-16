package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.mapper.RoleMapper;
import com.fashion.supplychain.system.service.RoleService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class RoleServiceImpl extends ServiceImpl<RoleMapper, Role> implements RoleService {

    @Override
    public Page<Role> getRolePage(Long page, Long pageSize, String roleName, String roleCode, String status) {
        Page<Role> pageParam = new Page<>(page, pageSize);
        LambdaQueryWrapper<Role> wrapper = new LambdaQueryWrapper<>();
        
        wrapper.like(StringUtils.hasText(roleName), Role::getRoleName, roleName);
        wrapper.like(StringUtils.hasText(roleCode), Role::getRoleCode, roleCode);
        wrapper.eq(StringUtils.hasText(status), Role::getStatus, status);
        wrapper.orderByDesc(Role::getCreateTime);
        
        return baseMapper.selectPage(pageParam, wrapper);
    }
}
