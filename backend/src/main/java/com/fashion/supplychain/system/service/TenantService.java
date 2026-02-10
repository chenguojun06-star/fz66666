package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.Tenant;

/**
 * 租户服务接口
 */
public interface TenantService extends IService<Tenant> {

    /**
     * 根据租户编码查找
     */
    Tenant findByTenantCode(String tenantCode);

    /**
     * 根据主账号用户ID查找租户
     */
    Tenant findByOwnerUserId(Long ownerUserId);

    /**
     * 检查租户是否有效（状态正常且未过期）
     */
    boolean isTenantActive(Long tenantId);

    /**
     * 获取租户当前用户数
     */
    int countTenantUsers(Long tenantId);
}
