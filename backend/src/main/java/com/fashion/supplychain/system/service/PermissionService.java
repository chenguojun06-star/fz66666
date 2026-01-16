package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.Permission;

public interface PermissionService extends IService<Permission> {
    Page<Permission> getPermissionPage(Long page, Long pageSize, String permissionName, String permissionCode, String status);
}
