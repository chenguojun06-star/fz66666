package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.UserRole;

import java.util.List;

/**
 * 用户-角色关联 Service（一人多角色）
 */
public interface UserRoleService extends IService<UserRole> {

    /**
     * 查询用户的所有有效角色ID（按租户隔离，按主角色优先排序）
     */
    List<Long> getRoleIdsByUserId(Long userId, Long tenantId);

    /**
     * 查询用户的主角色ID（兼容旧 User.roleId 单角色逻辑）
     * 若 t_user_role 无记录，返回 null（调用方应回退到 User.roleId）
     */
    Long getPrimaryRoleId(Long userId, Long tenantId);

    /**
     * 替换用户的角色（全量覆盖，保留主角色标记）
     * @param userId 用户ID
     * @param tenantId 租户ID
     * @param roleIds 角色ID列表（第一个为主角色）
     */
    void replaceUserRoles(Long userId, Long tenantId, List<Long> roleIds);

    /**
     * 给用户添加角色（增量，不覆盖现有）
     */
    void addRoles(Long userId, Long tenantId, List<Long> roleIds, boolean primary);

    /**
     * 移除用户的指定角色
     */
    void removeRoles(Long userId, Long tenantId, List<Long> roleIds);
}
