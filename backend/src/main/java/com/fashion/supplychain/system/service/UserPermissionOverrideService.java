package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.UserPermissionOverride;
import java.util.List;

public interface UserPermissionOverrideService extends IService<UserPermissionOverride> {

    /**
     * 获取用户额外授予的权限ID列表
     */
    List<Long> getGrantPermissionIds(Long userId);

    /**
     * 获取用户被撤销的权限ID列表
     */
    List<Long> getRevokePermissionIds(Long userId);

    /**
     * 替换用户权限微调
     * @param userId 用户ID
     * @param tenantId 租户ID
     * @param grantIds 额外授予的权限ID
     * @param revokeIds 撤销的权限ID
     */
    void replaceOverrides(Long userId, Long tenantId, List<Long> grantIds, List<Long> revokeIds);
}
