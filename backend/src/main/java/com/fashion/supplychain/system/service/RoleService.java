package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.Role;

public interface RoleService extends IService<Role> {
    Page<Role> getRolePage(Long page, Long pageSize, String roleName, String roleCode, String status);
}
