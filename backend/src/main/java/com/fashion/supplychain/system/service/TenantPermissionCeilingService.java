package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.TenantPermissionCeiling;
import java.util.List;

public interface TenantPermissionCeilingService extends IService<TenantPermissionCeiling> {

    /**
     * 获取租户授权的权限ID列表
     * @param tenantId 租户ID
     * @return GRANTED 状态的权限ID列表
     */
    List<Long> getGrantedPermissionIds(Long tenantId);

    /**
     * 获取租户被屏蔽的权限ID列表
     * @param tenantId 租户ID
     * @return BLOCKED 状态的权限ID列表
     */
    List<Long> getBlockedPermissionIds(Long tenantId);

    /**
     * 替换租户权限天花板配置
     * @param tenantId 租户ID
     * @param grantedPermissionIds 授权的权限ID列表
     */
    void replaceCeiling(Long tenantId, List<Long> grantedPermissionIds);
}
