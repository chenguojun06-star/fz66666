package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.system.service.UserRoleService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 用户角色关联编排器（事务边界层）
 *
 * P0 铁律 #2：@Transactional 必须在 Orchestrator 层，Service 层禁止 @Transactional。
 * 本类承接 UserRoleService 的多步写操作事务，保证"先删后插"等操作的原子性。
 *
 * 单条 save/update/remove 已由 MyBatis-Plus 保证原子性，无需走 Orchestrator。
 */
@Slf4j
@Service
public class UserRoleOrchestrator {

    @Autowired
    private UserRoleService userRoleService;

    /**
     * 替换用户的全部角色（先软删除现有，再批量插入新关联）
     * 第一个角色自动设为主角色（is_primary=1），其余为兼职角色
     *
     * @param userId   用户ID
     * @param tenantId 租户ID
     * @param roleIds  新角色ID列表（顺序决定主角色，第一个为主）
     */
    @Transactional(rollbackFor = Exception.class)
    public void replaceUserRoles(Long userId, Long tenantId, List<Long> roleIds) {
        userRoleService.replaceUserRoles(userId, tenantId, roleIds);
    }

    /**
     * 为用户追加角色（不删除现有角色，已存在的角色跳过）
     *
     * @param userId   用户ID
     * @param tenantId 租户ID
     * @param roleIds  待追加的角色ID列表
     * @param primary  是否设为主角色（true=设为主角色，false=兼职角色）
     */
    @Transactional(rollbackFor = Exception.class)
    public void addRoles(Long userId, Long tenantId, List<Long> roleIds, boolean primary) {
        userRoleService.addRoles(userId, tenantId, roleIds, primary);
    }

    /**
     * 移除用户的指定角色（软删除，保留历史记录）
     *
     * @param userId   用户ID
     * @param tenantId 租户ID
     * @param roleIds  待移除的角色ID列表
     */
    @Transactional(rollbackFor = Exception.class)
    public void removeRoles(Long userId, Long tenantId, List<Long> roleIds) {
        userRoleService.removeRoles(userId, tenantId, roleIds);
    }
}
