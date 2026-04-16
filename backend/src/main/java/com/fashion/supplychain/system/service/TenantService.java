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
     * 按编码或名称查找租户（工人注册用）
     * 优先精确编码匹配，失败后尝试名称模糊匹配。
     * 名称模糊命中多个时返回 null（由调用方区分多结果与零结果）。
     *
     * @param keyword 用户输入的编码或名称
     * @return 唯一匹配的租户；零结果或多结果时返回 null
     * @throws IllegalArgumentException 名称模糊匹配命中多个租户
     */
    Tenant findByCodeOrName(String keyword);

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
