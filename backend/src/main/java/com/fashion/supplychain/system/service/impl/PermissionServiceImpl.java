package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.Permission;
import com.fashion.supplychain.system.mapper.PermissionMapper;
import com.fashion.supplychain.system.service.PermissionService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class PermissionServiceImpl extends ServiceImpl<PermissionMapper, Permission> implements PermissionService {

    @Override
    public Page<Permission> getPermissionPage(Long page, Long pageSize, String permissionName, String permissionCode, String status) {
        Page<Permission> pageParam = new Page<>(page, pageSize);
        LambdaQueryWrapper<Permission> wrapper = new LambdaQueryWrapper<>();
        
        wrapper.like(StringUtils.hasText(permissionName), Permission::getPermissionName, permissionName);
        wrapper.like(StringUtils.hasText(permissionCode), Permission::getPermissionCode, permissionCode);
        wrapper.eq(StringUtils.hasText(status), Permission::getStatus, status);
        wrapper.orderByAsc(Permission::getSort);
        
        return baseMapper.selectPage(pageParam, wrapper);
    }
}
